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

	if (qm.UseGrafanaTimeRange || hasExpandedGrafanaTimeRange(qm)) && qm.FromTo == nil {
		qm.FromTo = &models.TimeRange{
			From: query.TimeRange.From.UTC().Format(time.RFC3339Nano),
			To:   query.TimeRange.To.UTC().Format(time.RFC3339Nano),
		}
	}

	if qm.Entity == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "entity is required")
	}
	if qm.Top == nil && qm.EntityID == nil && d.config.DefaultTop != nil {
		qm.Top = d.config.DefaultTop
	}
	if hasExpandedEntity(qm, models.EntityObservations) {
		qm = d.applyExpandedObservationsDefault(qm)
	}

	requestURL, err := sensorthings.BuildURL(d.sensorThingsBaseURL(), qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
	}
	logDevelopmentQueryURL(query.RefID, requestURL)

	apiResponse, err := d.getAllSensorThingsPages(ctx, requestURL, qm.ShouldFollowNextLink(), hasExpandedEntity(qm, models.EntityObservations))
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, err.Error())
	}

	queryFrames, err := frames.Transform(apiResponse, qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, err.Error())
	}

	response.Frames = append(response.Frames, queryFrames...)
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

func (d *Datasource) getAllSensorThingsPages(ctx context.Context, firstURL string, followNextLink bool, expandObservations bool) (*sensorthings.Response, error) {
	combined := &sensorthings.Response{Value: []json.RawMessage{}}
	nextURL := firstURL
	visited := map[string]struct{}{}

	for nextURL != "" {
		if _, exists := visited[nextURL]; exists {
			return nil, fmt.Errorf("SensorThings pagination cycle detected at %s", nextURL)
		}
		visited[nextURL] = struct{}{}
		if err := d.validateTargetURL(nextURL); err != nil {
			return nil, fmt.Errorf("refusing SensorThings nextLink: %w", err)
		}
		page, err := d.getSensorThingsPage(ctx, nextURL)
		if err != nil {
			return nil, err
		}
		if expandObservations {
			for index, raw := range page.Value {
				hydrated, err := d.hydrateExpandedObservations(ctx, raw, followNextLink, nextURL)
				if err != nil {
					return nil, err
				}
				page.Value[index] = hydrated
			}
		}
		combined.Value = append(combined.Value, page.Value...)
		combined.Count = page.Count
		combined.NextLink = page.NextLink
		if followNextLink {
			resolved, err := resolveResponseURL(nextURL, page.NextLink)
			if err != nil {
				return nil, fmt.Errorf("resolve SensorThings nextLink: %w", err)
			}
			nextURL = resolved
		} else {
			nextURL = ""
		}
	}

	if followNextLink {
		combined.NextLink = ""
	}
	return combined, nil
}

func hasExpandedEntity(query models.IstSOS4Query, entity models.EntityType) bool {
	for _, expand := range query.Expand {
		if expand.Entity == entity {
			return true
		}
	}
	return strings.Contains(strings.ToLower(query.Expression), strings.ToLower(string(entity)))
}

func hasExpandedGrafanaTimeRange(query models.IstSOS4Query) bool {
	for _, expand := range query.Expand {
		if expand.SubQuery != nil && expand.SubQuery.UseGrafanaTimeRange {
			return true
		}
	}
	return false
}

func (d *Datasource) applyExpandedObservationsDefault(query models.IstSOS4Query) models.IstSOS4Query {
	limit := 1000
	if d.config.DefaultExpandedObservationsTop != nil {
		limit = *d.config.DefaultExpandedObservationsTop
	}
	for index, expand := range query.Expand {
		if expand.Entity != models.EntityObservations {
			continue
		}
		if query.Expand[index].SubQuery == nil {
			query.Expand[index].SubQuery = &models.ExpandSubQuery{}
		}
		if query.Expand[index].SubQuery.Top == nil {
			query.Expand[index].SubQuery.Top = &limit
		}
	}
	return query
}

func (d *Datasource) hydrateExpandedObservations(ctx context.Context, raw json.RawMessage, followNextLink bool, responseURL string) (json.RawMessage, error) {
	if !followNextLink {
		return raw, nil
	}
	var item map[string]json.RawMessage
	if err := json.Unmarshal(raw, &item); err != nil {
		return nil, fmt.Errorf("decode expanded SensorThings entity: %w", err)
	}
	var nextLink string
	if link, ok := item["Observations@iot.nextLink"]; ok {
		_ = json.Unmarshal(link, &nextLink)
	}
	if nextLink == "" {
		return raw, nil
	}
	resolvedNextLink, err := resolveResponseURL(responseURL, nextLink)
	if err != nil {
		return nil, fmt.Errorf("resolve expanded Observations nextLink: %w", err)
	}
	nextLink = resolvedNextLink
	var observations []json.RawMessage
	if expanded, ok := item["Observations"]; ok {
		if err := json.Unmarshal(expanded, &observations); err != nil {
			return nil, fmt.Errorf("decode expanded observations: %w", err)
		}
	}
	visited := map[string]struct{}{}
	for nextLink != "" {
		if _, exists := visited[nextLink]; exists {
			return nil, fmt.Errorf("expanded Observations pagination cycle detected at %s", nextLink)
		}
		visited[nextLink] = struct{}{}
		if err := d.validateTargetURL(nextLink); err != nil {
			return nil, fmt.Errorf("refusing expanded Observations nextLink: %w", err)
		}
		page, err := d.getSensorThingsPage(ctx, nextLink)
		if err != nil {
			return nil, err
		}
		observations = append(observations, page.Value...)
		resolved, err := resolveResponseURL(nextLink, page.NextLink)
		if err != nil {
			return nil, fmt.Errorf("resolve expanded Observations nextLink: %w", err)
		}
		nextLink = resolved
	}
	expanded, err := json.Marshal(observations)
	if err != nil {
		return nil, fmt.Errorf("encode expanded observations: %w", err)
	}
	item["Observations"] = expanded
	delete(item, "Observations@iot.nextLink")
	return json.Marshal(item)
}

func resolveResponseURL(responseURL, link string) (string, error) {
	link = strings.TrimSpace(link)
	if link == "" {
		return "", nil
	}
	base, err := url.Parse(responseURL)
	if err != nil {
		return "", fmt.Errorf("invalid response URL")
	}
	reference, err := url.Parse(link)
	if err != nil {
		return "", fmt.Errorf("invalid response link")
	}
	return base.ResolveReference(reference).String(), nil
}

func (d *Datasource) getSensorThingsPage(ctx context.Context, requestURL string) (*sensorthings.Response, error) {
	status, _, body, err := d.proxyGET(ctx, requestURL)
	if err != nil {
		return nil, err
	}
	if status == http.StatusBadRequest {
		canonicalURL, canonicalErr := canonicalizeQueryURL(requestURL)
		if canonicalErr == nil && canonicalURL != requestURL {
			status, _, body, err = d.proxyGET(ctx, canonicalURL)
			if err != nil {
				return nil, fmt.Errorf("retry encoded SensorThings URL: %w", err)
			}
			requestURL = canonicalURL
		}
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("SensorThings API returned HTTP %d for %s: %s", status, requestURL, string(body))
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

func canonicalizeQueryURL(requestURL string) (string, error) {
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return "", fmt.Errorf("invalid SensorThings URL")
	}
	if parsed.RawQuery == "" {
		return requestURL, nil
	}

	parts := strings.Split(parsed.RawQuery, "&")
	for index, part := range parts {
		key, value, hasValue := strings.Cut(part, "=")
		key = canonicalizeQueryComponent(key)
		if hasValue {
			value = canonicalizeQueryComponent(value)
			parts[index] = key + "=" + value
		} else {
			parts[index] = key
		}
	}
	parsed.RawQuery = strings.Join(parts, "&")
	return parsed.String(), nil
}

func canonicalizeQueryComponent(component string) string {
	decoded, err := url.QueryUnescape(component)
	if err != nil {
		return component
	}
	return strings.ReplaceAll(url.QueryEscape(decoded), "+", "%20")
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
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

	if config.AuthType == "oauth2" && config.OAuth2TokenURL == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 token URL is missing"
		return res, nil
	}

	if config.AuthType == "oauth2" && config.OAuth2Username == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 username is missing"
		return res, nil
	}

	if config.AuthType == "oauth2" && config.Secrets.OAuth2Password == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 password is missing"
		return res, nil
	}

	healthURL := strings.TrimRight(d.sensorThingsBaseURL(), "/") + "/"
	status, _, body, err := d.proxyGET(ctx, healthURL)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Unable to connect to SensorThings API: %v", err),
		}, nil
	}
	if status < 200 || status >= 300 {
		message := strings.TrimSpace(string(body))
		if len(message) > 200 {
			message = message[:200]
		}
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("SensorThings API returned HTTP %d: %s", status, message),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Successfully connected to SensorThings API",
	}, nil
}
