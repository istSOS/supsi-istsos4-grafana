package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/frames"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/sensorthings"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces - only those which are required for a particular task.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(_ context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	config, err := models.LoadPluginSettings(settings)
	if err != nil {
		return nil, err
	}

	return &Datasource{
		config: config,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	config     *models.PluginSettings
	httpClient *http.Client
	mu         sync.Mutex
	token      oauthToken
}

type oauthToken struct {
	AccessToken  string
	RefreshToken string
	TokenType    string
	ExpiresAt    time.Time
}

type tokenResponse struct {
	AccessToken       string      `json:"access_token"`
	Token             string      `json:"token"`
	RefreshToken      string      `json:"refresh_token"`
	RefreshTokenCamel string      `json:"refreshToken"`
	TokenType         string      `json:"token_type"`
	ExpiresIn         json.Number `json:"expires_in"`
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
}

func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if req.Method != http.MethodGet {
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusMethodNotAllowed})
	}
	if strings.Trim(req.Path, "/") != "proxy" {
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusNotFound})
	}

	query, err := url.Parse(req.URL)
	if err != nil {
		return sendError(sender, http.StatusBadRequest, "invalid resource URL")
	}

	target := query.Query().Get("url")
	if target == "" {
		return sendError(sender, http.StatusBadRequest, "missing url parameter")
	}
	if err := d.validateTargetURL(target); err != nil {
		return sendError(sender, http.StatusBadRequest, err.Error())
	}

	status, headers, body, err := d.proxyGET(ctx, target)
	if err != nil {
		return sendError(sender, http.StatusBadGateway, err.Error())
	}

	return sender.Send(&backend.CallResourceResponse{
		Status:  status,
		Headers: responseHeaders(headers),
		Body:    body,
	})
}

func (d *Datasource) proxyGET(ctx context.Context, target string) (int, http.Header, []byte, error) {
	status, headers, body, err := d.doGET(ctx, target)
	if err != nil {
		return 0, nil, nil, err
	}

	if status == http.StatusUnauthorized && d.config.AuthType == "oauth2" {
		d.clearToken()
		status, headers, body, err = d.doGET(ctx, target)
	}

	return status, headers, body, err
}

func (d *Datasource) doGET(ctx context.Context, target string) (int, http.Header, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("create request: %w", err)
	}

	if d.config.AuthType == "oauth2" {
		token, err := d.authToken(ctx)
		if err != nil {
			return 0, nil, nil, err
		}
		req.Header.Set("Authorization", strings.TrimSpace(token.TokenType+" "+token.AccessToken))
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("read response: %w", err)
	}

	return resp.StatusCode, resp.Header, body, nil
}

func (d *Datasource) authToken(ctx context.Context) (oauthToken, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.token.AccessToken != "" && time.Now().Add(30*time.Second).Before(d.token.ExpiresAt) {
		return d.token, nil
	}

	if d.token.RefreshToken != "" && d.config.OAuth2RefreshURL != "" {
		token, err := d.requestToken(ctx, d.config.OAuth2RefreshURL, url.Values{
			"grant_type":    {"refresh_token"},
			"refresh_token": {d.token.RefreshToken},
		})
		if err == nil {
			d.token = token
			return d.token, nil
		}
	}

	values := url.Values{
		"grant_type": {"password"},
		"username":   {d.config.OAuth2Username},
		"password":   {d.config.Secrets.OAuth2Password},
	}
	token, err := d.requestToken(ctx, d.config.OAuth2TokenURL, values)
	if err != nil {
		return oauthToken{}, err
	}
	d.token = token
	return d.token, nil
}

func (d *Datasource) requestToken(ctx context.Context, path string, values url.Values) (oauthToken, error) {
	if d.config.OAuth2ClientID != "" {
		values.Set("client_id", d.config.OAuth2ClientID)
	}
	if d.config.Secrets.OAuth2ClientSecret != "" {
		values.Set("client_secret", d.config.Secrets.OAuth2ClientSecret)
	}

	endpoint, err := joinURL(d.config.APIURL, path)
	if err != nil {
		return oauthToken{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(values.Encode()))
	if err != nil {
		return oauthToken{}, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return oauthToken{}, fmt.Errorf("send token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return oauthToken{}, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return oauthToken{}, fmt.Errorf("token endpoint returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp tokenResponse
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&tokenResp); err != nil {
		return oauthToken{}, fmt.Errorf("decode token response: %w", err)
	}

	accessToken := tokenResp.AccessToken
	if accessToken == "" {
		accessToken = tokenResp.Token
	}
	if accessToken == "" {
		return oauthToken{}, fmt.Errorf("token response did not include access_token")
	}

	refreshToken := tokenResp.RefreshToken
	if refreshToken == "" {
		refreshToken = tokenResp.RefreshTokenCamel
	}
	if refreshToken == "" {
		refreshToken = d.token.RefreshToken
	}

	expiresIn := int64(300)
	if tokenResp.ExpiresIn != "" {
		if parsed, err := tokenResp.ExpiresIn.Int64(); err == nil && parsed > 0 {
			expiresIn = parsed
		}
	}

	tokenType := tokenResp.TokenType
	if tokenType == "" {
		tokenType = "Bearer"
	}

	return oauthToken{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    tokenType,
		ExpiresAt:    time.Now().Add(time.Duration(expiresIn) * time.Second),
	}, nil
}

func (d *Datasource) clearToken() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.token = oauthToken{}
}

func (d *Datasource) validateTargetURL(target string) error {
	targetURL, err := url.Parse(target)
	if err != nil {
		return fmt.Errorf("invalid target URL")
	}
	baseURL, err := url.Parse(d.config.APIURL)
	if err != nil {
		return fmt.Errorf("invalid API URL")
	}
	if targetURL.Scheme != baseURL.Scheme || targetURL.Host != baseURL.Host {
		return fmt.Errorf("target URL must match the configured API URL")
	}
	basePath := strings.TrimRight(baseURL.EscapedPath(), "/")
	targetPath := targetURL.EscapedPath()
	if basePath != "" && targetPath != basePath && !strings.HasPrefix(targetPath, basePath+"/") {
		return fmt.Errorf("target URL must be inside the configured API URL path")
	}
	return nil
}

func joinURL(baseURL string, path string) (string, error) {
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return "", fmt.Errorf("parse base URL: %w", err)
	}
	relative := strings.TrimLeft(path, "/")
	endpoint, err := base.Parse(relative)
	if err != nil {
		return "", fmt.Errorf("parse endpoint path: %w", err)
	}
	return endpoint.String(), nil
}

func responseHeaders(headers http.Header) map[string][]string {
	result := map[string][]string{}
	if contentType := headers.Get("Content-Type"); contentType != "" {
		result["Content-Type"] = []string{contentType}
	} else {
		result["Content-Type"] = []string{"application/json"}
	}
	return result
}

func sendError(sender backend.CallResourceResponseSender, status int, message string) error {
	body, _ := json.Marshal(map[string]string{"message": message})
	return sender.Send(&backend.CallResourceResponse{
		Status:  status,
		Headers: map[string][]string{"Content-Type": {"application/json"}},
		Body:    body,
	})
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

func (d *Datasource) query(ctx context.Context, _ backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	var qm models.IstSOS4Query
	if len(query.JSON) > 0 {
		err := json.Unmarshal(query.JSON, &qm)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
		}
	}
	qm.RefID = query.RefID

	if qm.Hide {
		return response
	}

	if qm.UseGrafanaTimeRange && qm.FromTo == nil {
		qm.FromTo = &models.TimeRange{
			From: query.TimeRange.From.UTC().Format(time.RFC3339Nano),
			To:   query.TimeRange.To.UTC().Format(time.RFC3339Nano),
		}
	}

	if qm.Entity != models.EntityObservations {
		return backend.ErrDataResponse(
			backend.StatusBadRequest,
			fmt.Sprintf("backend alert queries currently support %s only", models.EntityObservations),
		)
	}

	requestURL, err := sensorthings.BuildURL(d.sensorThingsBaseURL(), qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
	}
	logDevelopmentQueryURL(query.RefID, requestURL)

	apiResponse, err := d.getAllSensorThingsPages(ctx, requestURL, qm.ShouldFollowNextLink())
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, err.Error())
	}

	frame, err := frames.Observations(apiResponse, qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, err.Error())
	}

	response.Frames = append(response.Frames, frame)
	return response
}

func logDevelopmentQueryURL(refID string, requestURL string) {
	if !isDevelopmentMode() {
		return
	}
	log.DefaultLogger.Debug("Built SensorThings query URL", "refId", refID, "url", requestURL)
}

func isDevelopmentMode() bool {
	return os.Getenv("NODE_ENV") == "development" ||
		os.Getenv("GF_DEFAULT_APP_MODE") == "development" ||
		os.Getenv("GF_APP_MODE") == "development"
}

func (d *Datasource) sensorThingsBaseURL() string {
	if d.config == nil {
		return ""
	}
	return strings.TrimRight(d.config.APIURL, "/") + "/" + strings.TrimLeft(d.config.Path, "/")
}

func (d *Datasource) getAllSensorThingsPages(ctx context.Context, firstURL string, followNextLink bool) (*sensorthings.Response, error) {
	combined := &sensorthings.Response{Value: []json.RawMessage{}}
	nextURL := firstURL

	for nextURL != "" {
		page, err := d.getSensorThingsPage(ctx, nextURL)
		if err != nil {
			return nil, err
		}
		combined.Value = append(combined.Value, page.Value...)
		combined.Count = page.Count
		combined.NextLink = page.NextLink
		if followNextLink {
			nextURL = page.NextLink
		} else {
			nextURL = ""
		}
	}

	if followNextLink {
		combined.NextLink = ""
	}
	return combined, nil
}

func (d *Datasource) getSensorThingsPage(ctx context.Context, requestURL string) (*sensorthings.Response, error) {
	status, _, body, err := d.proxyGET(ctx, requestURL)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("SensorThings API returned HTTP %d: %s", status, string(body))
	}

	var page sensorthings.Response
	if err := json.Unmarshal(body, &page); err == nil {
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal(body, &envelope); err == nil {
			if _, ok := envelope["value"]; ok {
				return &page, nil
			}
		}
	}

	var raw json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode SensorThings response: %w", err)
	}
	page.Value = []json.RawMessage{raw}
	return &page, nil
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}
	config, err := models.LoadPluginSettings(*req.PluginContext.DataSourceInstanceSettings)

	if err != nil {
		res.Status = backend.HealthStatusError
		res.Message = "Unable to load settings"
		return res, nil
	}

	if config.APIURL == "" {
		res.Status = backend.HealthStatusError
		res.Message = "API URL is missing"
		return res, nil
	}

	if config.AuthType != "oauth2" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: "Data source is working",
		}, nil
	}

	if config.OAuth2TokenURL == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 token URL is missing"
		return res, nil
	}

	if config.OAuth2Username == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 username is missing"
		return res, nil
	}

	if config.Secrets.OAuth2Password == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 password is missing"
		return res, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
}
