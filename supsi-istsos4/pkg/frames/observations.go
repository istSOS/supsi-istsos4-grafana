package frames

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/sensorthings"
)

func Observations(response *sensorthings.Response, query models.IstSOS4Query) (*data.Frame, error) {
	frame := data.NewFrame(query.DisplayName("Observations"))
	if response == nil || len(response.Value) == 0 {
		return frame, nil
	}

	times := make([]time.Time, 0, len(response.Value))
	values := make([]float64, 0, len(response.Value))

	for _, raw := range response.Value {
		var observation sensorthings.Observation
		if err := json.Unmarshal(raw, &observation); err != nil {
			return nil, fmt.Errorf("decode observation: %w", err)
		}

		ts, err := observationTime(observation)
		if err != nil {
			return nil, err
		}

		value, err := numericResult(observation.Result)
		if err != nil {
			return nil, err
		}

		times = append(times, ts)
		values = append(values, value)
	}

	frame.Fields = append(frame.Fields,
		data.NewField("time", nil, times),
		data.NewField("value", nil, values),
	)
	return frame, nil
}

func observationTime(observation sensorthings.Observation) (time.Time, error) {
	rawTime := observation.PhenomenonTime
	if rawTime == "" {
		rawTime = observation.ResultTime
	}
	if rawTime == "" {
		return time.Time{}, fmt.Errorf("observation %d has no phenomenonTime or resultTime", observation.ID)
	}

	ts, err := time.Parse(time.RFC3339Nano, rawTime)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse observation time %q: %w", rawTime, err)
	}
	return ts, nil
}

func numericResult(raw json.RawMessage) (float64, error) {
	var number float64
	if err := json.Unmarshal(raw, &number); err == nil {
		return number, nil
	}

	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		number, err := strconv.ParseFloat(text, 64)
		if err == nil {
			return number, nil
		}
	}

	return 0, fmt.Errorf("observation result is not numeric")
}
