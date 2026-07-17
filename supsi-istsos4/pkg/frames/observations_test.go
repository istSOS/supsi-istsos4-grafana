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
