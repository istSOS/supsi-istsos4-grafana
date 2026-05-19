package frames

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/sensorthings"
)

func TestObservationsFrame(t *testing.T) {
	response := &sensorthings.Response{
		Value: []json.RawMessage{
			json.RawMessage(`{"@iot.id":1,"phenomenonTime":"2026-01-02T03:04:05Z","result":12.5}`),
			json.RawMessage(`{"@iot.id":2,"phenomenonTime":"2026-01-02T03:05:05Z","result":"13.5"}`),
		},
	}

	frame, err := Observations(response, models.IstSOS4Query{
		Entity: models.EntityObservations,
		Alias:  "Temperature",
	})
	if err != nil {
		t.Fatal(err)
	}

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
