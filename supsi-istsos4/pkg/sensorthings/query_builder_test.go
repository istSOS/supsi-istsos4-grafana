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

func TestBuildURLWithNavigationPathAndObservationParameters(t *testing.T) {
	top := 25
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		NavigationPath: []models.NavigationSegment{
			{Entity: models.EntityDatastreams, EntityID: json.RawMessage(`16`)},
		},
		Filters: []models.FilterCondition{
			{Type: "measurement", Field: "result", Operator: "gt", Value: json.RawMessage(`10`)},
		},
		OrderBy: []models.OrderByOption{{Property: "phenomenonTime", Direction: "desc"}},
		Select:  []string{"phenomenonTime", "result"},
		Top:     &top,
	}

	got, err := BuildURL("https://example.test/v1.1", query)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Path != "/v1.1/Datastreams(16)/Observations" {
		t.Fatalf("unexpected navigation path %q", parsed.Path)
	}
	values := parsed.Query()
	if values.Get("$filter") != "result gt 10" {
		t.Fatalf("unexpected filter %q", values.Get("$filter"))
	}
	if values.Get("$orderby") != "phenomenonTime desc" {
		t.Fatalf("unexpected orderby %q", values.Get("$orderby"))
	}
	if values.Get("$select") != "phenomenonTime,result" {
		t.Fatalf("unexpected select %q", values.Get("$select"))
	}
	if values.Get("$top") != "25" {
		t.Fatalf("unexpected top %q", values.Get("$top"))
	}
}

func TestBuildURLWithNavigationPathAndGrafanaAlertTimeRange(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		NavigationPath: []models.NavigationSegment{
			{Entity: models.EntityDatastreams, EntityID: json.RawMessage(`"16"`)},
		},
		UseGrafanaTimeRange:   true,
		GrafanaTimeRangeField: "phenomenonTime",
		FromTo: &models.TimeRange{
			From: "2026-05-27T07:36:00Z",
			To:   "2026-05-27T07:46:00Z",
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
	if parsed.Path != "/v1.1/Datastreams(16)/Observations" {
		t.Fatalf("unexpected navigation path %q", parsed.Path)
	}
	wantFilter := "phenomenonTime ge '2026-05-27T07:36:00Z' and phenomenonTime le '2026-05-27T07:46:00Z'"
	if parsed.Query().Get("$filter") != wantFilter {
		t.Fatalf("unexpected alert time filter\nwant: %s\n got: %s", wantFilter, parsed.Query().Get("$filter"))
	}
}

func TestBuildURLRejectsUnresolvedNavigationVariable(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityObservations,
		NavigationPath: []models.NavigationSegment{
			{Entity: models.EntityDatastreams, EntityID: json.RawMessage(`"$datastream"`)},
		},
	}

	_, err := BuildURL("https://example.test/v1.1", query)
	if err == nil || !strings.Contains(err.Error(), "non-negative integer") {
		t.Fatalf("expected unresolved navigation ID error, got %v", err)
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

func TestBuildURLWithExpressionDoesNotDuplicateNestedGrafanaTimeRange(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:                models.EntityDatastreams,
		Expression:            "$filter=(id eq 172 or id eq 186)&$select=id,name,unitOfMeasurement&$orderby=name&$top=2000&$expand=Observations($select=result,phenomenonTime;$filter=phenomenonTime ge '2026-07-18T13:14:46.827Z' and phenomenonTime le '2026-07-20T13:14:46.827Z' and result ge -998 and result le 400;$top=2000)",
		UseGrafanaTimeRange:   true,
		GrafanaTimeRangeField: "phenomenonTime",
		FromTo: &models.TimeRange{
			From: "2026-07-18T13:14:46.827Z",
			To:   "2026-07-20T13:14:46.827Z",
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

	if values.Get("$filter") != "(id eq 172 or id eq 186)" {
		t.Fatalf("unexpected root filter %q", values.Get("$filter"))
	}
	wantExpand := "Observations($select=result,phenomenonTime;$filter=phenomenonTime ge '2026-07-18T13:14:46.827Z' and phenomenonTime le '2026-07-20T13:14:46.827Z' and result ge -998 and result le 400;$top=2000)"
	if values.Get("$expand") != wantExpand {
		t.Fatalf("unexpected expand\nwant: %s\n got: %s", wantExpand, values.Get("$expand"))
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

func TestBuildURLAppliesResultOptionsToExpandedObservations(t *testing.T) {
	top := 2000
	skip := 10
	query := models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		FromTo: &models.TimeRange{
			From: "2026-07-18T13:14:46.827Z",
			To:   "2026-07-20T13:14:46.827Z",
		},
		Expand: []models.ExpandOption{
			{
				Entity: models.EntityObservations,
				SubQuery: &models.ExpandSubQuery{
					Filter:                "result ge -998 and result le 400",
					Select:                []string{"result", "phenomenonTime"},
					OrderBy:               []models.OrderByOption{{Property: "phenomenonTime", Direction: "desc"}},
					Top:                   &top,
					Skip:                  &skip,
					UseGrafanaTimeRange:   true,
					GrafanaTimeRangeField: "phenomenonTime",
				},
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
	values := parsed.Query()
	wantExpand := "Observations($filter=result ge -998 and result le 400 and phenomenonTime ge '2026-07-18T13:14:46.827Z' and phenomenonTime le '2026-07-20T13:14:46.827Z';$select=result,phenomenonTime;$orderby=phenomenonTime desc;$top=2000;$skip=10)"
	if values.Get("$expand") != wantExpand {
		t.Fatalf("unexpected expand\nwant: %s\n got: %s", wantExpand, values.Get("$expand"))
	}
	if values.Has("from") || values.Has("to") {
		t.Fatalf("expanded time range must not also emit top-level from/to parameters: %s", got)
	}
}

func TestBuildURLAddsDefaultOrderByForExpandedGrafanaTimeRange(t *testing.T) {
	query := models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		FromTo: &models.TimeRange{
			From: "2026-07-18T13:14:46.827Z",
			To:   "2026-07-20T13:14:46.827Z",
		},
		Expand: []models.ExpandOption{
			{
				Entity: models.EntityObservations,
				SubQuery: &models.ExpandSubQuery{
					UseGrafanaTimeRange:   true,
					GrafanaTimeRangeField: "resultTime",
				},
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
	wantExpand := "Observations($filter=resultTime ge '2026-07-18T13:14:46.827Z' and resultTime le '2026-07-20T13:14:46.827Z';$orderby=resultTime)"
	if parsed.Query().Get("$expand") != wantExpand {
		t.Fatalf("unexpected expand\nwant: %s\n got: %s", wantExpand, parsed.Query().Get("$expand"))
	}
}

func TestBuildURLKeepsRootNameAndExpandedObservationOrderingSeparate(t *testing.T) {
	query := models.IstSOS4Query{
		Entity:  models.EntityDatastreams,
		OrderBy: []models.OrderByOption{{Property: "name", Direction: "asc"}},
		Expand: []models.ExpandOption{{
			Entity: models.EntityObservations,
			SubQuery: &models.ExpandSubQuery{
				OrderBy: []models.OrderByOption{{Property: "phenomenonTime", Direction: "desc"}},
			},
		}},
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
	if values.Get("$orderby") != "name asc" {
		t.Fatalf("unexpected root orderby %q", values.Get("$orderby"))
	}
	if values.Get("$expand") != "Observations($orderby=phenomenonTime desc)" {
		t.Fatalf("unexpected expand %q", values.Get("$expand"))
	}
}
