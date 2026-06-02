package sensorthings

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
)

func TestBuildURLForObservations(t *testing.T) {
	top := 100
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		Top:    &top,
		OrderBy: []models.OrderByOption{
			{Property: "phenomenonTime", Direction: "desc"},
		},
	}

	got, err := BuildURL("https://example.test/FROST-Server/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	want := "https://example.test/FROST-Server/v1.1/Observations?%24orderby=phenomenonTime%20desc&%24top=100"
	if got != want {
		t.Fatalf("unexpected URL\nwant: %s\n got: %s", want, got)
	}
	if strings.Contains(got, "+") {
		t.Fatalf("URL should encode spaces as %%20, got %s", got)
	}
}

func TestBuildURLWithEntityID(t *testing.T) {
	id := int64(42)
	query := models.IstSOS4Query{
		Entity:   models.EntityDatastreams,
		EntityID: &id,
		Expand: []models.ExpandOption{
			{Entity: models.EntityObservations},
		},
	}

	got, err := BuildURL("https://example.test/v1.1/", query)
	if err != nil {
		t.Fatal(err)
	}

	want := "https://example.test/v1.1/Datastreams(42)?%24expand=Observations"
	if got != want {
		t.Fatalf("unexpected URL\nwant: %s\n got: %s", want, got)
	}
}

func TestBuildURLWithExpressionReplacesGrafanaTimeMacros(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Expression:          "$filter=Datastream/@iot.id eq 1 and phenomenonTime ge '${__from:date:iso}' and phenomenonTime le '${__to:date:iso}'&$orderby=phenomenonTime desc",
		UseGrafanaTimeRange: false,
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:00:00Z",
			To:   "2026-05-27T08:00:00Z",
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	wantFilter := "Datastream/@iot.id eq 1 and phenomenonTime ge '2026-05-27T07:00:00Z' and phenomenonTime le '2026-05-27T08:00:00Z'"
	if values.Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s", wantFilter, values.Get("$filter"))
	}
	if values.Get("$orderby") != "phenomenonTime desc" {
		t.Fatalf("unexpected orderby %q", values.Get("$orderby"))
	}
	if got == "https://example.test/v1.1/Observations?"+query.Expression {
		t.Fatal("expression query was not encoded")
	}
}

func TestBuildURLWithExpressionAppendsConcreteGrafanaTimeRange(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Expression:          "$filter=Datastream/@iot.id eq 1&$orderby=phenomenonTime desc",
		UseGrafanaTimeRange: true,
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:00:00Z",
			To:   "2026-05-27T08:00:00Z",
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	wantFilter := "Datastream/@iot.id eq 1 and phenomenonTime ge '2026-05-27T07:00:00Z' and phenomenonTime le '2026-05-27T08:00:00Z'"
	if values.Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s", wantFilter, values.Get("$filter"))
	}
}

func TestBuildURLWithFullPreviewExpression(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Expression:          "/Observations?$filter=Datastream/@iot.id eq 1 and phenomenonTime ge '${__from:date:iso}' and phenomenonTime le '${__to:date:iso}'&$orderby=phenomenonTime desc&$top=1",
		UseGrafanaTimeRange: false,
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:00:00Z",
			To:   "2026-05-27T08:00:00Z",
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	wantFilter := "Datastream/@iot.id eq 1 and phenomenonTime ge '2026-05-27T07:00:00Z' and phenomenonTime le '2026-05-27T08:00:00Z'"
	if values.Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s", wantFilter, values.Get("$filter"))
	}
	if values.Get("$orderby") != "phenomenonTime desc" {
		t.Fatalf("unexpected orderby %q", values.Get("$orderby"))
	}
	if values.Get("$top") != "1" {
		t.Fatalf("unexpected top %q", values.Get("$top"))
	}
}

func TestBuildURLWithFullPreviewExpressionAndOrderByOnly(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Expression:          "/Observations?$filter=Datastream/@iot.id eq 1 and phenomenonTime ge '${__from:date:iso}' and phenomenonTime le '${__to:date:iso}'&$orderby=phenomenonTime",
		UseGrafanaTimeRange: false,
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:00:00Z",
			To:   "2026-05-27T08:00:00Z",
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(got, "${__") {
		t.Fatalf("URL contains unresolved macro: %s", got)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	wantFilter := "Datastream/@iot.id eq 1 and phenomenonTime ge '2026-05-27T07:00:00Z' and phenomenonTime le '2026-05-27T08:00:00Z'"
	if values.Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s\n url: %s", wantFilter, values.Get("$filter"), got)
	}
	if values.Get("$orderby") != "phenomenonTime" {
		t.Fatalf("unexpected orderby %q in url %s", values.Get("$orderby"), got)
	}
}

func TestBuildURLWithEncodedExpression(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:              models.EntityObservations,
		Expression:          "%3F%24filter%3DDatastream%2F%40iot.id%20eq%201%26%24orderby%3DphenomenonTime%20desc%26%24top%3D1",
		UseGrafanaTimeRange: false,
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	if values.Get("$filter") != "Datastream/@iot.id eq 1" {
		t.Fatalf("unexpected filter %q", values.Get("$filter"))
	}
	if values.Get("$orderby") != "phenomenonTime desc" {
		t.Fatalf("unexpected orderby %q", values.Get("$orderby"))
	}
	if values.Get("$top") != "1" {
		t.Fatalf("unexpected top %q", values.Get("$top"))
	}
}

func TestBuildURLVariableFilterForCurrentEntityBecomesEntityID(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		Filters: []models.FilterCondition{
			{
				Type:         "variable",
				Entity:       "Datastream",
				Field:        "id",
				Operator:     "eq",
				Value:        json.RawMessage(`"1"`),
				VariableName: "$datastream",
			},
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	want := "https://example.test/v1.1/Datastreams(1)"
	if got != want {
		t.Fatalf("unexpected URL\nwant: %s\n got: %s", want, got)
	}
}

func TestBuildURLVariableFilterForRelatedEntityStaysInFilter(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		Filters: []models.FilterCondition{
			{
				Type:         "variable",
				Entity:       "Datastream",
				Field:        "id",
				Operator:     "eq",
				Value:        json.RawMessage(`"1"`),
				VariableName: "$datastream",
			},
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}

	wantFilter := "Datastream/id eq 1"
	if parsed.Query().Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s", wantFilter, parsed.Query().Get("$filter"))
	}
}

func TestBuildURLMatchesAlertStructuredEntityFilter(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:                models.EntityObservations,
		UseGrafanaTimeRange:   true,
		GrafanaTimeRangeField: "phenomenonTime",
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:36:00Z",
			To:   "2026-05-27T07:46:00Z",
		},
		Filters: []models.FilterCondition{
			{
				ID:       "004ac5b8-595c-4fc5-b808-acea34c60586",
				Type:     "entity",
				Field:    "@iot.id",
				Operator: "eq",
				Value:    json.RawMessage(`"1"`),
				Entity:   "Datastreams",
			},
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(got, "from=") || strings.Contains(got, "to=") {
		t.Fatalf("Grafana time range should be folded into $filter only, got %s", got)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()

	wantFilter := "Datastream/@iot.id eq 1 and phenomenonTime ge '2026-05-27T07:36:00Z' and phenomenonTime le '2026-05-27T07:46:00Z'"
	if values.Get("$filter") != wantFilter {
		t.Fatalf("unexpected filter\nwant: %s\n got: %s\n url: %s", wantFilter, values.Get("$filter"), got)
	}
	if values.Get("$orderby") != "phenomenonTime" {
		t.Fatalf("unexpected orderby %q", values.Get("$orderby"))
	}
}

func TestBuildURLStructuredEntityFilterAcceptsSingularEntity(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		Filters: []models.FilterCondition{
			{
				Type:     "entity",
				Field:    "@iot.id",
				Operator: "eq",
				Value:    json.RawMessage(`"1"`),
				Entity:   "Datastream",
			},
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}

	if parsed.Query().Get("$filter") != "Datastream/@iot.id eq 1" {
		t.Fatalf("unexpected filter %q", parsed.Query().Get("$filter"))
	}
}

func TestBuildURLMovesDatastreamObservationFiltersIntoExpand(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		Expand: []models.ExpandOption{
			{Entity: models.EntityObservations},
		},
		Filters: []models.FilterCondition{
			{
				Type:     "observation",
				Field:    "result",
				Operator: "gt",
				Value:    json.RawMessage(`10`),
			},
		},
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}

	wantExpand := "Observations($filter=result gt 10)"
	if parsed.Query().Get("$expand") != wantExpand {
		t.Fatalf("unexpected expand\nwant: %s\n got: %s", wantExpand, parsed.Query().Get("$expand"))
	}
	if parsed.Query().Get("$filter") != "" {
		t.Fatalf("unexpected top-level filter %q", parsed.Query().Get("$filter"))
	}
}
