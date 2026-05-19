package sensorthings

import (
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

	want := "https://example.test/FROST-Server/v1.1/Observations?%24orderby=phenomenonTime+desc&%24top=100"
	if got != want {
		t.Fatalf("unexpected URL\nwant: %s\n got: %s", want, got)
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
