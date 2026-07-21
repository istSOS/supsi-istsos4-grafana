package models

import "encoding/json"

type EntityType string

const (
	EntityThings              EntityType = "Things"
	EntityLocations           EntityType = "Locations"
	EntitySensors             EntityType = "Sensors"
	EntityObservedProperties  EntityType = "ObservedProperties"
	EntityDatastreams         EntityType = "Datastreams"
	EntityObservations        EntityType = "Observations"
	EntityFeaturesOfInterest  EntityType = "FeaturesOfInterest"
	EntityHistoricalLocations EntityType = "HistoricalLocations"
)

type IstSOS4Query struct {
	RefID                 string              `json:"refId,omitempty"`
	Entity                EntityType          `json:"entity"`
	EntityID              *int64              `json:"entityId,omitempty"`
	NavigationPath        []NavigationSegment `json:"navigationPath,omitempty"`
	Filters               []FilterCondition   `json:"filters,omitempty"`
	Expand                []ExpandOption      `json:"expand,omitempty"`
	Select                []string            `json:"select,omitempty"`
	OrderBy               []OrderByOption     `json:"orderby,omitempty"`
	Top                   *int                `json:"top,omitempty"`
	Skip                  *int                `json:"skip,omitempty"`
	Count                 bool                `json:"count,omitempty"`
	ResultFormat          string              `json:"resultFormat,omitempty"`
	Expression            string              `json:"expression,omitempty"`
	FollowNextLink        *bool               `json:"followNextLink,omitempty"`
	AsOf                  string              `json:"asOf,omitempty"`
	FromTo                *TimeRange          `json:"fromTo,omitempty"`
	UseGrafanaTimeRange   bool                `json:"useGrafanaTimeRange,omitempty"`
	GrafanaTimeRangeField string              `json:"grafanaTimeRangeField,omitempty"`
	Alias                 string              `json:"alias,omitempty"`
	Hide                  bool                `json:"hide,omitempty"`
	QueryType             string              `json:"queryType,omitempty"`
}

type NavigationSegment struct {
	Entity   EntityType      `json:"entity"`
	EntityID json.RawMessage `json:"entityId,omitempty"`
}

type TimeRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type ExpandOption struct {
	Entity   EntityType      `json:"entity"`
	SubQuery *ExpandSubQuery `json:"subQuery,omitempty"`
}

type ExpandSubQuery struct {
	Expand                []EntityType    `json:"expand,omitempty"`
	Filter                string          `json:"filter,omitempty"`
	Select                []string        `json:"select,omitempty"`
	OrderBy               []OrderByOption `json:"orderby,omitempty"`
	Top                   *int            `json:"top,omitempty"`
	Skip                  *int            `json:"skip,omitempty"`
	UseGrafanaTimeRange   bool            `json:"useGrafanaTimeRange,omitempty"`
	GrafanaTimeRangeField string          `json:"grafanaTimeRangeField,omitempty"`
}

type OrderByOption struct {
	Property  string `json:"property"`
	Direction string `json:"direction"`
}

type FilterCondition struct {
	ID           string          `json:"id,omitempty"`
	Type         string          `json:"type"`
	Field        string          `json:"field"`
	Operator     string          `json:"operator"`
	Value        json.RawMessage `json:"value,omitempty"`
	Entity       EntityType      `json:"entity,omitempty"`
	VariableName string          `json:"variableName,omitempty"`
	StartDate    string          `json:"startDate,omitempty"`
	EndDate      string          `json:"endDate,omitempty"`
}

func (q IstSOS4Query) DisplayName(fallback string) string {
	if q.Alias != "" {
		return q.Alias
	}
	if q.Entity != "" {
		return string(q.Entity)
	}
	return fallback
}

func (q IstSOS4Query) ShouldFollowNextLink() bool {
	if q.FollowNextLink == nil {
		return true
	}
	return *q.FollowNextLink
}
