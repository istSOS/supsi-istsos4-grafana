package frames

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/sensorthings"
)

func TestTransformObservationsFrame(t *testing.T) {
	response := &sensorthings.Response{
		Value: []json.RawMessage{
			json.RawMessage(`{"@iot.id":1,"phenomenonTime":"2026-01-02T03:04:05Z","result":12.5}`),
			json.RawMessage(`{"@iot.id":2,"phenomenonTime":"2026-01-02T03:05:05Z","result":"13.5"}`),
		},
	}

	frames, err := Transform(response, models.IstSOS4Query{
		Entity: models.EntityObservations,
		Alias:  "Temperature",
		RefID:  "A",
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(frames) != 1 {
		t.Fatalf("expected one frame, got %d", len(frames))
	}
	frame := frames[0]
	if frame.Name != "Temperature" {
		t.Fatalf("unexpected frame name %q", frame.Name)
	}
	if len(frame.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(frame.Fields))
	}

	times := frame.Fields[0].At(0).(time.Time)
	if !times.Equal(time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)) {
		t.Fatalf("unexpected first timestamp %s", times)
	}

	value := frame.Fields[1].At(1).(float64)
	if value != 13.5 {
		t.Fatalf("unexpected second value %f", value)
	}
}

func TestTransformBasicEntityFrame(t *testing.T) {
	response := &sensorthings.Response{Value: []json.RawMessage{
		json.RawMessage(`{"@iot.id":7,"name":"Station","description":"Weather station"}`),
	}}

	frames, err := Transform(response, models.IstSOS4Query{Entity: models.EntityThings, RefID: "B"})
	if err != nil {
		t.Fatal(err)
	}
	frame := frames[0]
	if frame.RefID != "B" {
		t.Fatalf("unexpected ref id %q", frame.RefID)
	}
	if got := frame.Fields[0].At(0).(int64); got != 7 {
		t.Fatalf("unexpected thing id %d", got)
	}
	if got := frame.Fields[1].At(0).(string); got != "Station" {
		t.Fatalf("unexpected thing name %q", got)
	}
}

func TestTransformVariableFrame(t *testing.T) {
	response := &sensorthings.Response{Value: []json.RawMessage{
		json.RawMessage(`{"@iot.id":12,"name":"Temperature"}`),
		json.RawMessage(`{"@iot.id":13}`),
	}}

	frames, err := Transform(response, models.IstSOS4Query{
		Entity: models.EntityDatastreams, QueryType: "variable", RefID: "VariableQuery",
	})
	if err != nil {
		t.Fatal(err)
	}
	frame := frames[0]
	if got := frame.Fields[0].At(0).(string); got != "Temperature" {
		t.Fatalf("unexpected variable text %q", got)
	}
	if got := frame.Fields[0].At(1).(string); got != "13" {
		t.Fatalf("unexpected fallback variable text %q", got)
	}
	if got := frame.Fields[1].At(0).(string); got != "12" {
		t.Fatalf("unexpected variable value %q", got)
	}
}

func TestTransformCustomDatastreamQueryUsesDatastreamNamesForSeries(t *testing.T) {
	response := &sensorthings.Response{Value: []json.RawMessage{
		json.RawMessage(`{
			"@iot.id": 172,
			"name": "Air temperature",
			"unitOfMeasurement": {
				"name": "degree Celsius",
				"symbol": "°C",
				"definition": "http://unitsofmeasure.org/ucum.html#para-30"
			},
			"Observations": [
				{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 21.5},
				{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 22.0}
			]
		}`),
		json.RawMessage(`{
			"@iot.id": 186,
			"name": "Relative humidity",
			"unitOfMeasurement": {"symbol": "%"},
			"Observations": [
				{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 61.0},
				{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 60.0}
			]
		}`),
	}}

	frames, err := Transform(response, models.IstSOS4Query{
		Entity:     models.EntityDatastreams,
		Expression: `$expand=Observations($select=result,phenomenonTime;$top=10000)`,
		RefID:      "A",
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(frames) != 2 {
		t.Fatalf("expected two datastream series, got %d", len(frames))
	}
	if frames[0].Name != "Air temperature" {
		t.Fatalf("unexpected first series name %q", frames[0].Name)
	}
	if frames[1].Name != "Relative humidity" {
		t.Fatalf("unexpected second series name %q", frames[1].Name)
	}
	if frames[0].Fields[1].Name != "value" {
		t.Fatalf("unexpected value field name %q", frames[0].Fields[1].Name)
	}
	if frames[0].Fields[1].Config == nil {
		t.Fatal("expected unit metadata on temperature value field")
	}
	if got := frames[0].Fields[1].Config.Unit; got != "celsius" {
		t.Fatalf("unexpected temperature Grafana unit %q", got)
	}
	if got := frames[0].Fields[1].Config.DisplayNameFromDS; got != "Air temperature" {
		t.Fatalf("unexpected temperature display name %q", got)
	}
	wantDescription := "degree Celsius\nDefinition: http://unitsofmeasure.org/ucum.html#para-30"
	if got := frames[0].Fields[1].Config.Description; got != wantDescription {
		t.Fatalf("unexpected temperature unit description %q", got)
	}
	if frames[1].Fields[1].Config == nil {
		t.Fatal("expected unit metadata on humidity value field")
	}
	if got := frames[1].Fields[1].Config.Unit; got != "percent" {
		t.Fatalf("unexpected humidity Grafana unit %q", got)
	}
}

func TestTransformExpandedDatastreamsRemainDistinctWhenIDIsNotSelected(t *testing.T) {
	response := &sensorthings.Response{Value: []json.RawMessage{
		json.RawMessage(`{
			"name": "Air temperature",
			"unitOfMeasurement": {"name": "degree Celsius", "symbol": "°C"},
			"Observations": [
				{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 21.5},
				{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 22.0}
			]
		}`),
		json.RawMessage(`{
			"name": "Relative humidity",
			"unitOfMeasurement": {"name": "percent", "symbol": "%"},
			"Observations": [
				{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 61.0},
				{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 60.0}
			]
		}`),
	}}

	frames, err := Transform(response, models.IstSOS4Query{
		Entity: models.EntityDatastreams,
		Expand: []models.ExpandOption{{
			Entity:   models.EntityObservations,
			SubQuery: &models.ExpandSubQuery{Select: []string{"result", "phenomenonTime"}},
		}},
		Select: []string{"name", "unitOfMeasurement"},
		RefID:  "A",
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(frames) != 2 {
		t.Fatalf("expected two Datastream series without selected IDs, got %d", len(frames))
	}
	if frames[0].Name != "Air temperature" || frames[1].Name != "Relative humidity" {
		t.Fatalf("unexpected series names %q and %q", frames[0].Name, frames[1].Name)
	}
}

func TestTransformCustomDatastreamQueryPreservesAlias(t *testing.T) {
	response := &sensorthings.Response{Value: []json.RawMessage{
		json.RawMessage(`{
			"@iot.id": 172,
			"name": "Air temperature",
			"Observations": [
				{"phenomenonTime": "2026-07-20T10:00:00Z", "result": 21.5},
				{"phenomenonTime": "2026-07-20T11:00:00Z", "result": 22.0}
			]
		}`),
	}}

	frames, err := Transform(response, models.IstSOS4Query{
		Entity:     models.EntityDatastreams,
		Expression: `$expand=Observations($select=result,phenomenonTime;$top=10000)`,
		Alias:      "Outdoor temperature",
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(frames) != 1 {
		t.Fatalf("expected one datastream series, got %d", len(frames))
	}
	if frames[0].Name != "Outdoor temperature" {
		t.Fatalf("unexpected aliased series name %q", frames[0].Name)
	}
	if got := frames[0].Fields[1].Config.DisplayNameFromDS; got != "Outdoor temperature" {
		t.Fatalf("unexpected aliased field display name %q", got)
	}
}

func TestGrafanaUnitUsesCustomSuffixForSensorThingsUnit(t *testing.T) {
	if got := grafanaUnit("µg/m³"); got != "suffix:µg/m³" {
		t.Fatalf("unexpected custom Grafana unit %q", got)
	}
}
