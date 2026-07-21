package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestQueryDataInjectsGrafanaRangeIntoExpandedObservations(t *testing.T) {
	var requestedExpand string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedExpand = r.URL.Query().Get("$expand")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"value": []}`))
	}))
	defer server.Close()

	top := 2000
	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		Expand: []models.ExpandOption{
			{
				Entity: models.EntityObservations,
				SubQuery: &models.ExpandSubQuery{
					Select:                []string{"result", "phenomenonTime"},
					Top:                   &top,
					UseGrafanaTimeRange:   true,
					GrafanaTimeRangeField: "phenomenonTime",
				},
			},
		},
	})
	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
		httpClient: server.Client(),
	}

	response, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{
			{
				RefID: "A",
				JSON:  queryJSON,
				TimeRange: backend.TimeRange{
					From: time.Date(2026, 7, 18, 13, 14, 46, 827000000, time.UTC),
					To:   time.Date(2026, 7, 20, 13, 14, 46, 827000000, time.UTC),
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Responses["A"].Error != nil {
		t.Fatal(response.Responses["A"].Error)
	}

	wantExpand := "Observations($filter=phenomenonTime ge '2026-07-18T13:14:46.827Z' and phenomenonTime le '2026-07-20T13:14:46.827Z';$select=result,phenomenonTime;$orderby=phenomenonTime;$top=2000)"
	if requestedExpand != wantExpand {
		t.Fatalf("unexpected expand\nwant: %s\n got: %s", wantExpand, requestedExpand)
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

func TestQueryDataUsesNavigationPath(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"value":[{"@iot.id":1,"phenomenonTime":"2026-01-02T03:04:05Z","result":12.5}]}`))
	}))
	defer server.Close()

	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity: models.EntityObservations,
		NavigationPath: []models.NavigationSegment{
			{Entity: models.EntityDatastreams, EntityID: json.RawMessage(`16`)},
		},
	})
	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
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
	if gotPath != "/Datastreams(16)/Observations" {
		t.Fatalf("unexpected SensorThings path %q", gotPath)
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

func TestQueryDataFetchesAllExpandedObservationPages(t *testing.T) {
	var serverURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/Datastreams":
			_, _ = w.Write([]byte(`{
				"value": [{
					"@iot.id": 3,
					"name": "Temperature",
					"unitOfMeasurement": {"name": "degree Celsius", "symbol": "°C"},
					"Observations": [{"@iot.id": 1, "phenomenonTime": "2026-01-02T03:04:05Z", "result": 12.5}],
					"Observations@iot.nextLink": "` + serverURL + `/MoreObservations"
				}]
			}`))
		case "/MoreObservations":
			_, _ = w.Write([]byte(`{
				"value": [{"@iot.id": 2, "phenomenonTime": "2026-01-02T03:05:05Z", "result": 13.5}]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	serverURL = server.URL

	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		Expand: []models.ExpandOption{{Entity: models.EntityObservations}},
	})
	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
		httpClient: server.Client(),
	}

	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatal(err)
	}
	dataResponse := resp.Responses["A"]
	if dataResponse.Error != nil {
		t.Fatal(dataResponse.Error)
	}
	if len(dataResponse.Frames) != 1 {
		t.Fatalf("expected one datastream frame, got %d", len(dataResponse.Frames))
	}
	if got := dataResponse.Frames[0].Fields[0].Len(); got != 2 {
		t.Fatalf("expected two observations after expanded pagination, got %d", got)
	}
}

func TestQueryDataFollowsRelativeTopLevelAndExpandedNextLinksForCustomQuery(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/Datastreams":
			if r.URL.Query().Get("$skip") == "1" {
				_, _ = w.Write([]byte(`{
					"value": [{
						"@iot.id": 4,
						"name": "Relative humidity",
						"unitOfMeasurement": {"name": "percent", "symbol": "%"},
						"Observations": [
							{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 61.0},
							{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 60.0}
						]
					}]
				}`))
				return
			}
			_, _ = w.Write([]byte(`{
				"value": [{
					"@iot.id": 3,
					"name": "Air temperature",
					"unitOfMeasurement": {"name": "degree Celsius", "symbol": "°C"},
					"Observations": [
						{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 21.5}
					],
					"Observations@iot.nextLink": "Datastreams(3)/Observations?$skip=1"
				}],
				"@iot.nextLink": "Datastreams?$skip=1"
			}`))
		case "/Datastreams(3)/Observations":
			_, _ = w.Write([]byte(`{
				"value": [
					{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 22.0}
				]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	followNextLink := true
	queryJSON := queryJSONForTest(t, models.IstSOS4Query{
		Entity:                models.EntityDatastreams,
		Expression:            "$filter=(id eq 3 or id eq 4)&$select=id,name,unitOfMeasurement&$orderby=name&$top=2000&$expand=Observations($select=result,phenomenonTime;$filter=phenomenonTime ge '${__from:date:iso}' and phenomenonTime le '${__to:date:iso}';$top=2000)",
		FollowNextLink:        &followNextLink,
		UseGrafanaTimeRange:   true,
		GrafanaTimeRangeField: "phenomenonTime",
		FromTo: &models.TimeRange{
			From: "2026-07-20T10:00:00Z",
			To:   "2026-07-20T11:00:00Z",
		},
	})
	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
		httpClient: server.Client(),
	}

	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatal(err)
	}
	dataResponse := resp.Responses["A"]
	if dataResponse.Error != nil {
		t.Fatal(dataResponse.Error)
	}
	if len(dataResponse.Frames) != 2 {
		t.Fatalf("expected two datastream frames, got %d", len(dataResponse.Frames))
	}
	if got := dataResponse.Frames[0].Fields[0].Len(); got != 2 {
		t.Fatalf("expected two temperature observations, got %d", got)
	}
	if got := dataResponse.Frames[1].Fields[0].Len(); got != 2 {
		t.Fatalf("expected two humidity observations, got %d", got)
	}
	if requests != 3 {
		t.Fatalf("expected three SensorThings requests, got %d", requests)
	}
}

func TestQueryDataRejectsCrossOriginNextLink(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"value": [{"@iot.id": 1, "phenomenonTime": "2026-01-02T03:04:05Z", "result": 12.5}],
			"@iot.nextLink": "https://example.invalid/Observations"
		}`))
	}))
	defer server.Close()

	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
		httpClient: server.Client(),
	}
	queryJSON := queryJSONForTest(t, models.IstSOS4Query{Entity: models.EntityObservations})
	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Responses["A"].Error == nil {
		t.Fatal("expected cross-origin nextLink to be rejected")
	}
}

func TestGetSensorThingsPageRetriesEncodedEquivalentAfterBadRequest(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if strings.Contains(r.RequestURI, ";") {
			http.Error(w, "raw OData characters rejected", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"value": []}`))
	}))
	defer server.Close()

	ds := Datasource{
		config:     &models.PluginSettings{APIURL: server.URL, AuthType: "anonymous", Secrets: &models.SecretPluginSettings{}},
		httpClient: server.Client(),
	}
	requestURL := server.URL + "/Datastreams?$expand=Observations($top=1;$skip=1)"
	page, err := ds.getSensorThingsPage(context.Background(), requestURL)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Value) != 0 {
		t.Fatalf("expected empty response page, got %d values", len(page.Value))
	}
	if requests != 2 {
		t.Fatalf("expected original and encoded retry requests, got %d", requests)
	}
}

func TestCanonicalizeQueryURLPreservesNextLinkSemantics(t *testing.T) {
	raw := "https://example.test/v1.1/Datastreams(172)/Observations?$select=result,phenomenonTime&$filter=phenomenonTime ge '2026-07-14T08:58:24.179Z' and result le 400&$top=2000"
	got, err := canonicalizeQueryURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(got, " '$") {
		t.Fatalf("canonical URL still contains raw OData characters: %s", got)
	}
	if !strings.Contains(got, "%24filter=phenomenonTime%20ge%20%272026-07-14T08%3A58%3A24.179Z%27%20and%20result%20le%20400") {
		t.Fatalf("canonical URL changed or omitted the filter: %s", got)
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
