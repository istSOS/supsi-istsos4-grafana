package sensorthings

import "encoding/json"

type Response struct {
	Count    *int64             `json:"@iot.count,omitempty"`
	NextLink string             `json:"@iot.nextLink,omitempty"`
	Value    []json.RawMessage  `json:"value"`
}

type Observation struct {
	ID             int64           `json:"@iot.id"`
	PhenomenonTime string          `json:"phenomenonTime"`
	ResultTime     string          `json:"resultTime,omitempty"`
	Result         json.RawMessage `json:"result"`
}
