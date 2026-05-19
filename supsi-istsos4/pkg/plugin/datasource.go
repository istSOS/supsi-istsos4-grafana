package plugin

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/frames"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
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
func NewDatasource(_ context.Context, _ backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return &Datasource{}, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct{}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
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

func (d *Datasource) query(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	var qm models.IstSOS4Query
	if len(query.JSON) > 0 {
		err := json.Unmarshal(query.JSON, &qm)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
		}
	}
	qm.RefID = query.RefID

	if qm.Entity == models.EntityObservations {
		// The package structure is ready for the SensorThings client. Until the
		// API fetch is wired in, keep returning the development frame.
		response.Frames = append(response.Frames, frames.Development(query, qm))
		return response
	}

	response.Frames = append(response.Frames, frames.Development(query, qm))
	return response
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

	if config.OAuth2ClientID == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 client ID is missing"
		return res, nil
	}

	if config.Secrets.OAuth2Password == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 password is missing"
		return res, nil
	}

	if config.Secrets.OAuth2ClientSecret == "" {
		res.Status = backend.HealthStatusError
		res.Message = "OAuth2 client secret is missing"
		return res, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
}
