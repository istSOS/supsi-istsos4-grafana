package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
)

func TestQueryData(t *testing.T) {
	ds := Datasource{}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{RefID: "A"},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
}

func TestQueryDataFetchesObservationFrame(t *testing.T) {
	var gotPath string
	var gotQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"value": [
				{"@iot.id": 1, "phenomenonTime": "2026-01-02T03:04:05Z", "result": 12.5},
				{"@iot.id": 2, "phenomenonTime": "2026-01-02T03:05:05Z", "result": 13.5}
			]
		}`))
	}))
	defer server.Close()

	top := 2
	queryModel := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Top:                 &top,
		UseGrafanaTimeRange: true,
		Alias:               "Temperature",
	}
	queryJSON, err := json.Marshal(queryModel)
	if err != nil {
		t.Fatal(err)
	}

	ds := Datasource{
		config: &models.PluginSettings{
			APIURL:   server.URL,
			AuthType: "none",
			Secrets:  &models.SecretPluginSettings{},
		},
		httpClient: server.Client(),
	}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{
					RefID: "A",
					JSON:  queryJSON,
					TimeRange: backend.TimeRange{
						From: time.Date(2026, 1, 2, 3, 0, 0, 0, time.UTC),
						To:   time.Date(2026, 1, 2, 4, 0, 0, 0, time.UTC),
					},
				},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	dataResponse := resp.Responses["A"]
	if dataResponse.Error != nil {
		t.Fatal(dataResponse.Error)
	}
	if len(dataResponse.Frames) != 1 {
		t.Fatalf("expected 1 frame, got %d", len(dataResponse.Frames))
	}

	frame := dataResponse.Frames[0]
	if frame.Name != "Temperature" {
		t.Fatalf("unexpected frame name %q", frame.Name)
	}
	if got := frame.Fields[1].At(1).(float64); got != 13.5 {
		t.Fatalf("unexpected last value %f", got)
	}
	if gotPath != "/Observations" {
		t.Fatalf("unexpected request path %q", gotPath)
	}
	if gotQuery == "" {
		t.Fatal("expected query string")
	}
}

func TestQueryDataDoesNotFollowNextLinkWhenDisabled(t *testing.T) {
	var serverURL string
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/Observations":
			_, _ = w.Write([]byte(`{
				"value": [
					{"@iot.id": 1, "phenomenonTime": "2026-01-02T03:04:05Z", "result": 12.5}
				],
				"@iot.nextLink": "` + serverURL + `/ObservationsPage2"
			}`))
		case "/ObservationsPage2":
			_, _ = w.Write([]byte(`{
				"value": [
					{"@iot.id": 2, "phenomenonTime": "2026-01-02T03:05:05Z", "result": 13.5}
				]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	serverURL = server.URL

	followNextLink := false
	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity:         models.EntityObservations,
		FollowNextLink: &followNextLink,
	})

	ds := Datasource{
		config: &models.PluginSettings{
			APIURL:   server.URL,
			AuthType: "none",
			Secrets:  &models.SecretPluginSettings{},
		},
		httpClient: server.Client(),
	}

	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Responses["A"].Error != nil {
		t.Fatal(resp.Responses["A"].Error)
	}

	frame := resp.Responses["A"].Frames[0]
	if got := frame.Fields[1].Len(); got != 1 {
		t.Fatalf("expected 1 value, got %d", got)
	}
	if requests != 1 {
		t.Fatalf("expected 1 request, got %d", requests)
	}
}

func TestQueryDataFollowsNextLinkByDefault(t *testing.T) {
	var serverURL string
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/Observations":
			_, _ = w.Write([]byte(`{
				"value": [
					{"@iot.id": 1, "phenomenonTime": "2026-01-02T03:04:05Z", "result": 12.5}
				],
				"@iot.nextLink": "` + serverURL + `/ObservationsPage2"
			}`))
		case "/ObservationsPage2":
			_, _ = w.Write([]byte(`{
				"value": [
					{"@iot.id": 2, "phenomenonTime": "2026-01-02T03:05:05Z", "result": 13.5}
				]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	serverURL = server.URL

	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity: models.EntityObservations,
	})

	ds := Datasource{
		config: &models.PluginSettings{
			APIURL:   server.URL,
			AuthType: "none",
			Secrets:  &models.SecretPluginSettings{},
		},
		httpClient: server.Client(),
	}

	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Responses["A"].Error != nil {
		t.Fatal(resp.Responses["A"].Error)
	}

	frame := resp.Responses["A"].Frames[0]
	if got := frame.Fields[1].Len(); got != 2 {
		t.Fatalf("expected 2 values, got %d", got)
	}
	if requests != 2 {
		t.Fatalf("expected 2 requests, got %d", requests)
	}
}

func queryJSONForTest(t *testing.T, query models.IstSOS4Query) json.RawMessage {
	t.Helper()
	queryJSON, err := json.Marshal(query)
	if err != nil {
		t.Fatal(err)
	}
	return queryJSON
}
