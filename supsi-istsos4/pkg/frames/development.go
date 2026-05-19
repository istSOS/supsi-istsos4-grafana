package frames

import (
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
)

func Development(query backend.DataQuery, parsedQuery models.IstSOS4Query) *data.Frame {
	return data.NewFrame(parsedQuery.DisplayName("response"),
		data.NewField("time", nil, []time.Time{query.TimeRange.From, query.TimeRange.To}),
		data.NewField("value", nil, []int64{10, 20}),
	)
}
