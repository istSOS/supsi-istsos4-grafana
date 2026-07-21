package frames

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
	"github.com/ist-sos4/ist-sos4-grafana/pkg/sensorthings"
)

type entity map[string]any

type measurementUnit struct {
	Name       string
	Symbol     string
	Definition string
}

// Transform converts a SensorThings response into the same Grafana frame shapes
// used by dashboards, Explore, variables, and alerting.
func Transform(response *sensorthings.Response, query models.IstSOS4Query) ([]*data.Frame, error) {
	entities, err := decodeEntities(response)
	if err != nil {
		return nil, err
	}
	if query.QueryType == "variable" {
		return []*data.Frame{variableFrame(entities, query)}, nil
	}
	if len(entities) == 0 {
		return []*data.Frame{emptyFrame(query.DisplayName(string(query.Entity)), query.RefID)}, nil
	}

	switch query.Entity {
	case models.EntityObservations:
		return observationFrames(entities, query)
	case models.EntityDatastreams:
		return datastreamFrames(entities, query)
	case models.EntityThings:
		return thingFrames(entities, query), nil
	case models.EntityLocations:
		return []*data.Frame{locationFrame(entities, query)}, nil
	case models.EntitySensors, models.EntityObservedProperties:
		if hasExpanded(query, models.EntityDatastreams) {
			return []*data.Frame{entityDatastreamFrame(entities, query)}, nil
		}
		return []*data.Frame{basicEntityFrame(entities, query)}, nil
	case models.EntityFeaturesOfInterest:
		return []*data.Frame{featureOfInterestFrame(entities, query)}, nil
	case models.EntityHistoricalLocations:
		return []*data.Frame{historicalLocationFrame(entities, query)}, nil
	default:
		return []*data.Frame{basicEntityFrame(entities, query)}, nil
	}
}

func decodeEntities(response *sensorthings.Response) ([]entity, error) {
	if response == nil {
		return nil, nil
	}
	result := make([]entity, 0, len(response.Value))
	for _, raw := range response.Value {
		var item entity
		decoder := json.NewDecoder(strings.NewReader(string(raw)))
		decoder.UseNumber()
		if err := decoder.Decode(&item); err != nil {
			return nil, fmt.Errorf("decode %s entity: %w", "SensorThings", err)
		}
		result = append(result, item)
	}
	return result, nil
}

func emptyFrame(name, refID string) *data.Frame {
	frame := data.NewFrame(name)
	frame.RefID = refID
	return frame
}

func variableFrame(entities []entity, query models.IstSOS4Query) *data.Frame {
	texts := make([]string, 0, len(entities))
	values := make([]string, 0, len(entities))
	for _, item := range entities {
		value := stringValue(item["@iot.id"])
		text := stringValue(item["name"])
		if text == "" {
			text = value
		}
		texts = append(texts, text)
		values = append(values, value)
	}
	frame := data.NewFrame(query.DisplayName("Variables"),
		data.NewField("text", nil, texts),
		data.NewField("value", nil, values),
	)
	frame.RefID = query.RefID
	return frame
}

func basicEntityFrame(entities []entity, query models.IstSOS4Query) *data.Frame {
	singular := singularEntity(query.Entity)
	ids, names, descriptions := basicColumns(entities)
	frame := data.NewFrame(query.DisplayName(string(query.Entity)),
		data.NewField(strings.ToLower(singular)+"_id", nil, ids),
		data.NewField(strings.ToLower(singular)+"_name", nil, names),
		data.NewField(strings.ToLower(singular)+"_description", nil, descriptions),
	)
	frame.RefID = query.RefID
	return frame
}

func basicColumns(entities []entity) ([]int64, []string, []string) {
	ids := make([]int64, 0, len(entities))
	names := make([]string, 0, len(entities))
	descriptions := make([]string, 0, len(entities))
	for _, item := range entities {
		ids = append(ids, intValue(item["@iot.id"]))
		names = append(names, stringValue(item["name"]))
		descriptions = append(descriptions, stringValue(item["description"]))
	}
	return ids, names, descriptions
}

func entityDatastreamFrame(entities []entity, query models.IstSOS4Query) *data.Frame {
	singular := strings.ToLower(singularEntity(query.Entity))
	ids := []int64{}
	names := []string{}
	descriptions := []string{}
	datastreamIDs := []int64{}
	datastreamNames := []string{}
	datastreamDescriptions := []string{}
	resultTimes := []string{}
	for _, item := range entities {
		for _, datastream := range entitySlice(item["Datastreams"]) {
			ids = append(ids, intValue(item["@iot.id"]))
			names = append(names, stringValue(item["name"]))
			descriptions = append(descriptions, stringValue(item["description"]))
			datastreamIDs = append(datastreamIDs, intValue(datastream["@iot.id"]))
			datastreamNames = append(datastreamNames, stringValue(datastream["name"]))
			datastreamDescriptions = append(datastreamDescriptions, stringValue(datastream["description"]))
			resultTimes = append(resultTimes, stringValue(datastream["resultTime"]))
		}
	}
	frame := data.NewFrame(query.DisplayName(string(query.Entity)+" Datastreams"),
		data.NewField(singular+"_id", nil, ids),
		data.NewField(singular+"_name", nil, names),
		data.NewField(singular+"_description", nil, descriptions),
		data.NewField("datastream_id", nil, datastreamIDs),
		data.NewField("datastream_name", nil, datastreamNames),
		data.NewField("datastream_description", nil, datastreamDescriptions),
		data.NewField("datastream_resultTime", nil, resultTimes),
	)
	frame.RefID = query.RefID
	return frame
}

func observationFrames(observations []entity, query models.IstSOS4Query) ([]*data.Frame, error) {
	if !hasExpanded(query, models.EntityDatastreams) {
		frame, err := observationSeries(observations, query.DisplayName("Observations"), query.RefID, measurementUnit{})
		return []*data.Frame{frame}, err
	}

	groups := map[string][]entity{}
	datastreams := map[string]entity{}
	for _, observation := range observations {
		datastream, ok := observation["Datastream"].(map[string]any)
		if !ok {
			continue
		}
		key := stringValue(datastream["@iot.id"])
		if key == "" {
			continue
		}
		groups[key] = append(groups[key], observation)
		datastreams[key] = datastream
	}
	if len(groups) == 0 {
		frame, err := observationSeries(observations, query.DisplayName("Observations"), query.RefID, measurementUnit{})
		return []*data.Frame{frame}, err
	}
	if allGroupsAreLatest(groups) {
		return []*data.Frame{latestObservationsFrame(groups, datastreams, query, nil)}, nil
	}

	keys := sortedKeys(groups)
	frames := make([]*data.Frame, 0, len(keys))
	for _, key := range keys {
		datastream := datastreams[key]
		name := stringValue(datastream["name"])
		if name == "" {
			name = "Datastream " + key
		}
		if query.Alias != "" {
			name = query.Alias
		}
		frame, err := observationSeries(groups[key], name, query.RefID, datastreamUnit(datastream))
		if err != nil {
			return nil, err
		}
		frames = append(frames, frame)
	}
	return frames, nil
}

func observationSeries(observations []entity, name, refID string, unit measurementUnit) (*data.Frame, error) {
	times := make([]time.Time, 0, len(observations))
	values := make([]float64, 0, len(observations))
	for _, observation := range observations {
		rawTime := stringValue(observation["phenomenonTime"])
		if rawTime == "" {
			rawTime = stringValue(observation["resultTime"])
		}
		if rawTime == "" {
			continue
		}
		timestamp, err := time.Parse(time.RFC3339Nano, rawTime)
		if err != nil {
			return nil, fmt.Errorf("parse observation time %q: %w", rawTime, err)
		}
		value, err := anyNumber(observation["result"])
		if err != nil {
			return nil, err
		}
		times = append(times, timestamp)
		values = append(values, value)
	}
	valueField := data.NewField("value", nil, values)
	config := unit.fieldConfig()
	if config == nil {
		config = &data.FieldConfig{}
	}
	config.DisplayNameFromDS = name
	valueField.SetConfig(config)
	frame := data.NewFrame(name,
		data.NewField("time", nil, times),
		valueField,
	)
	frame.RefID = refID
	return frame, nil
}

func datastreamFrames(datastreams []entity, query models.IstSOS4Query) ([]*data.Frame, error) {
	if hasExpanded(query, models.EntityObservations) {
		groups := make(map[string][]entity, len(datastreams))
		byID := make(map[string]entity, len(datastreams))
		responseOrder := make([]string, 0, len(datastreams))
		for index, datastream := range datastreams {
			key := stringValue(datastream["@iot.id"])
			if key == "" {
				// @iot.id may legitimately be omitted by $select. Keep each
				// Datastream distinct instead of collapsing all missing IDs.
				key = fmt.Sprintf("selected-row-%08d", index)
			}
			groups[key] = entitySlice(datastream["Observations"])
			byID[key] = datastream
			responseOrder = append(responseOrder, key)
		}
		frameOrder := sortedKeys(groups)
		if ordersDatastreamsByName(query) {
			frameOrder = responseOrder
		}
		if allGroupsAreLatest(groups) {
			return []*data.Frame{latestObservationsFrame(groups, byID, query, frameOrder)}, nil
		}
		frames := []*data.Frame{}
		for _, key := range frameOrder {
			if len(groups[key]) == 0 {
				continue
			}
			datastream := byID[key]
			name := stringValue(datastream["name"])
			if name == "" {
				name = "Datastream " + key
			}
			if query.Alias != "" {
				name = query.Alias
			}
			frame, err := observationSeries(groups[key], name, query.RefID, datastreamUnit(datastream))
			if err != nil {
				return nil, err
			}
			frames = append(frames, frame)
		}
		if len(frames) > 0 {
			return frames, nil
		}
	}

	ids := []int64{}
	names := []string{}
	descriptions := []string{}
	unitSymbols := []string{}
	unitNames := []string{}
	unitDefinitions := []string{}
	phenomenonTimes := []string{}
	for _, datastream := range datastreams {
		unit, _ := datastream["unitOfMeasurement"].(map[string]any)
		ids = append(ids, intValue(datastream["@iot.id"]))
		names = append(names, stringValue(datastream["name"]))
		descriptions = append(descriptions, stringValue(datastream["description"]))
		unitSymbols = append(unitSymbols, stringValue(unit["symbol"]))
		unitNames = append(unitNames, stringValue(unit["name"]))
		unitDefinitions = append(unitDefinitions, stringValue(unit["definition"]))
		phenomenonTimes = append(phenomenonTimes, stringValue(datastream["phenomenonTime"]))
	}
	frame := data.NewFrame(query.DisplayName("Datastreams"),
		data.NewField("id", nil, ids), data.NewField("name", nil, names),
		data.NewField("description", nil, descriptions), data.NewField("unit_symbol", nil, unitSymbols),
		data.NewField("unit_name", nil, unitNames), data.NewField("unit_definition", nil, unitDefinitions),
		data.NewField("phenomenon_time", nil, phenomenonTimes),
	)
	frame.RefID = query.RefID
	return []*data.Frame{frame}, nil
}

func latestObservationsFrame(
	groups map[string][]entity,
	datastreams map[string]entity,
	query models.IstSOS4Query,
	orderedKeys []string,
) *data.Frame {
	times := []time.Time{}
	fields := []string{}
	values := []float64{}
	units := []string{}
	if len(orderedKeys) == 0 {
		orderedKeys = sortedKeys(groups)
	}
	for _, key := range orderedKeys {
		observations := groups[key]
		if len(observations) == 0 {
			continue
		}
		rawTime := stringValue(observations[0]["phenomenonTime"])
		timestamp, err := time.Parse(time.RFC3339Nano, rawTime)
		if err != nil {
			continue
		}
		value, err := anyNumber(observations[0]["result"])
		if err != nil {
			continue
		}
		datastream := datastreams[key]
		name := stringValue(datastream["name"])
		if name == "" {
			name = "Datastream " + key
		}
		times = append(times, timestamp)
		fields = append(fields, name)
		values = append(values, value)
		units = append(units, unitSymbol(datastream))
	}
	frame := data.NewFrame(query.DisplayName("Latest observations"),
		data.NewField("datetime", nil, times), data.NewField("field", nil, fields),
		data.NewField("value", nil, values), data.NewField("unit", nil, units),
	)
	frame.RefID = query.RefID
	return frame
}

func ordersDatastreamsByName(query models.IstSOS4Query) bool {
	for _, order := range query.OrderBy {
		if strings.EqualFold(strings.TrimSpace(order.Property), "name") {
			return true
		}
	}
	expression := strings.ToLower(strings.ReplaceAll(query.Expression, " ", ""))
	return strings.Contains(expression, "$orderby=name")
}

func thingFrames(things []entity, query models.IstSOS4Query) []*data.Frame {
	if hasExpanded(query, models.EntityDatastreams) {
		return []*data.Frame{entityDatastreamFrame(things, query)}
	}
	if hasExpanded(query, models.EntityLocations) {
		return []*data.Frame{thingLocationFrame(things, query, false)}
	}
	if hasExpanded(query, models.EntityHistoricalLocations) {
		return []*data.Frame{thingLocationFrame(things, query, true)}
	}
	return []*data.Frame{basicEntityFrame(things, query)}
}

func thingLocationFrame(things []entity, query models.IstSOS4Query, historical bool) *data.Frame {
	geometries := []string{}
	thingIDs := []int64{}
	thingNames := []string{}
	thingDescriptions := []string{}
	locationNames := []string{}
	locationTypes := []string{}
	times := []time.Time{}
	for _, thing := range things {
		if historical {
			for _, history := range entitySlice(thing["HistoricalLocations"]) {
				for _, location := range entitySlice(history["Locations"]) {
					if !appendThingLocation(&geometries, &thingIDs, &thingNames, &thingDescriptions, &locationNames, &locationTypes, thing, location) {
						continue
					}
					if timestamp, ok := parseTime(history["time"]); ok {
						times = append(times, timestamp)
					} else {
						times = append(times, time.Time{})
					}
				}
			}
			continue
		}
		for _, location := range entitySlice(thing["Locations"]) {
			appendThingLocation(&geometries, &thingIDs, &thingNames, &thingDescriptions, &locationNames, &locationTypes, thing, location)
		}
	}
	name := "Things with Locations"
	locationField := "location_name"
	if historical {
		name = "Things Historical Locations"
		locationField = "historical_location_name"
	}
	frame := data.NewFrame(query.DisplayName(name),
		data.NewField("geojson", nil, geometries), data.NewField("thing_id", nil, thingIDs),
		data.NewField("thing_name", nil, thingNames), data.NewField("thing_description", nil, thingDescriptions),
		data.NewField(locationField, nil, locationNames), data.NewField("location_type", nil, locationTypes),
	)
	if historical {
		frame.Fields = append(frame.Fields, data.NewField("time", nil, times))
	}
	frame.RefID = query.RefID
	return frame
}

func appendThingLocation(geometries *[]string, ids *[]int64, names, descriptions, locationNames, locationTypes *[]string, thing, location entity) bool {
	geometry, ok := geometryJSON(location["location"])
	if !ok {
		return false
	}
	*geometries = append(*geometries, geometry)
	*ids = append(*ids, intValue(thing["@iot.id"]))
	*names = append(*names, stringValue(thing["name"]))
	*descriptions = append(*descriptions, stringValue(thing["description"]))
	*locationNames = append(*locationNames, stringValue(location["name"]))
	geometryMap, _ := location["location"].(map[string]any)
	*locationTypes = append(*locationTypes, stringValue(geometryMap["type"]))
	return true
}

func locationFrame(locations []entity, query models.IstSOS4Query) *data.Frame {
	geometries := []string{}
	ids := []int64{}
	names := []string{}
	descriptions := []string{}
	types := []string{}
	thingIDs := []int64{}
	thingNames := []string{}
	thingDescriptions := []string{}
	hasThings := false
	for _, location := range locations {
		geometry, ok := geometryJSON(location["location"])
		if !ok {
			continue
		}
		things := entitySlice(location["Things"])
		if len(things) == 0 {
			things = []entity{{}}
		}
		for _, thing := range things {
			geometries = append(geometries, geometry)
			ids = append(ids, intValue(location["@iot.id"]))
			names = append(names, stringValue(location["name"]))
			descriptions = append(descriptions, stringValue(location["description"]))
			geometryMap, _ := location["location"].(map[string]any)
			types = append(types, stringValue(geometryMap["type"]))
			thingIDs = append(thingIDs, intValue(thing["@iot.id"]))
			thingNames = append(thingNames, stringValue(thing["name"]))
			thingDescriptions = append(thingDescriptions, stringValue(thing["description"]))
			if len(thing) > 0 {
				hasThings = true
			}
		}
	}
	frame := data.NewFrame(query.DisplayName("Locations"),
		data.NewField("geojson", nil, geometries), data.NewField("location_id", nil, ids),
		data.NewField("location_name", nil, names), data.NewField("location_description", nil, descriptions),
		data.NewField("location_type", nil, types),
	)
	if hasThings {
		frame.Fields = append(frame.Fields, data.NewField("thing_id", nil, thingIDs),
			data.NewField("thing_name", nil, thingNames), data.NewField("thing_description", nil, thingDescriptions))
	}
	frame.RefID = query.RefID
	return frame
}

func featureOfInterestFrame(features []entity, query models.IstSOS4Query) *data.Frame {
	if query.EntityID != nil && hasExpanded(query, models.EntityObservations) && len(features) > 0 {
		frame, err := observationSeries(entitySlice(features[0]["Observations"]), query.DisplayName(stringValue(features[0]["name"])), query.RefID, measurementUnit{})
		if err == nil {
			return frame
		}
		return emptyFrame(query.DisplayName("Feature of Interest"), query.RefID)
	}
	geometries := []string{}
	ids := []int64{}
	names := []string{}
	descriptions := []string{}
	types := []string{}
	for _, feature := range features {
		geometry, ok := geometryJSON(feature["feature"])
		if !ok {
			continue
		}
		geometryMap, _ := feature["feature"].(map[string]any)
		geometries = append(geometries, geometry)
		ids = append(ids, intValue(feature["@iot.id"]))
		names = append(names, stringValue(feature["name"]))
		descriptions = append(descriptions, stringValue(feature["description"]))
		types = append(types, stringValue(geometryMap["type"]))
	}
	frame := data.NewFrame(query.DisplayName("Features of Interest"),
		data.NewField("geojson", nil, geometries), data.NewField("feature_id", nil, ids),
		data.NewField("feature_name", nil, names), data.NewField("feature_description", nil, descriptions),
		data.NewField("feature_type", nil, types),
	)
	frame.RefID = query.RefID
	return frame
}

func historicalLocationFrame(history []entity, query models.IstSOS4Query) *data.Frame {
	geometries := []string{}
	ids := []int64{}
	types := []string{}
	times := []time.Time{}
	hasGeometry := false
	for _, item := range history {
		locations := entitySlice(item["Locations"])
		if len(locations) == 0 {
			locations = []entity{{}}
		}
		for _, location := range locations {
			geometry, ok := geometryJSON(location["location"])
			geometries = append(geometries, geometry)
			ids = append(ids, intValue(item["@iot.id"]))
			geometryMap, _ := location["location"].(map[string]any)
			types = append(types, stringValue(geometryMap["type"]))
			timestamp, _ := parseTime(item["time"])
			times = append(times, timestamp)
			hasGeometry = hasGeometry || ok
		}
	}
	frame := data.NewFrame(query.DisplayName("Historical Locations"))
	if hasGeometry {
		frame.Fields = append(frame.Fields, data.NewField("geojson", nil, geometries))
	}
	frame.Fields = append(frame.Fields, data.NewField("location_id", nil, ids), data.NewField("time", nil, times))
	if hasGeometry {
		frame.Fields = append(frame.Fields, data.NewField("location_type", nil, types))
	}
	frame.RefID = query.RefID
	return frame
}

func hasExpanded(query models.IstSOS4Query, wanted models.EntityType) bool {
	for _, expand := range query.Expand {
		if expand.Entity == wanted {
			return true
		}
	}
	return strings.Contains(strings.ToLower(query.Expression), strings.ToLower(string(wanted)))
}

func singularEntity(entityType models.EntityType) string {
	switch entityType {
	case models.EntityObservedProperties:
		return "observedProperty"
	case models.EntityFeaturesOfInterest:
		return "featureOfInterest"
	case models.EntityHistoricalLocations:
		return "historicalLocation"
	default:
		return strings.TrimSuffix(string(entityType), "s")
	}
}

func entitySlice(value any) []entity {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]entity, 0, len(items))
	for _, item := range items {
		if mapped, ok := item.(map[string]any); ok {
			result = append(result, mapped)
		}
	}
	return result
}

func geometryJSON(value any) (string, bool) {
	geometry, ok := value.(map[string]any)
	if !ok || stringValue(geometry["type"]) == "" {
		return "", false
	}
	// Grafana's GeoJSON field consumes the geometry object directly. CRS
	// conversion remains the responsibility of a standards-compliant API.
	clean := map[string]any{"type": geometry["type"], "coordinates": geometry["coordinates"]}
	raw, err := json.Marshal(clean)
	return string(raw), err == nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(typed, 10)
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func intValue(value any) int64 {
	parsed, _ := strconv.ParseInt(stringValue(value), 10, 64)
	return parsed
}

func anyNumber(value any) (float64, error) {
	parsed, err := strconv.ParseFloat(stringValue(value), 64)
	if err != nil {
		return 0, fmt.Errorf("observation result %q is not numeric", stringValue(value))
	}
	return parsed, nil
}

func parseTime(value any) (time.Time, bool) {
	timestamp, err := time.Parse(time.RFC3339Nano, stringValue(value))
	return timestamp, err == nil
}

func unitSymbol(datastream entity) string {
	return datastreamUnit(datastream).Symbol
}

func datastreamUnit(datastream entity) measurementUnit {
	unit, _ := datastream["unitOfMeasurement"].(map[string]any)
	return measurementUnit{
		Name:       stringValue(unit["name"]),
		Symbol:     stringValue(unit["symbol"]),
		Definition: stringValue(unit["definition"]),
	}
}

func (unit measurementUnit) fieldConfig() *data.FieldConfig {
	if unit.Name == "" && unit.Symbol == "" && unit.Definition == "" {
		return nil
	}

	description := unit.Name
	if unit.Definition != "" {
		if description != "" {
			description += "\n"
		}
		description += "Definition: " + unit.Definition
	}

	return &data.FieldConfig{
		Unit:        grafanaUnit(unit.Symbol),
		Description: description,
	}
}

func grafanaUnit(symbol string) string {
	switch strings.TrimSpace(symbol) {
	case "":
		return ""
	case "%":
		return "percent"
	case "°C":
		return "celsius"
	case "°F":
		return "fahrenheit"
	case "K":
		return "kelvin"
	default:
		return "suffix:" + symbol
	}
}

func allGroupsAreLatest(groups map[string][]entity) bool {
	if len(groups) == 0 {
		return false
	}
	for _, observations := range groups {
		if len(observations) > 1 {
			return false
		}
	}
	return true
}

func sortedKeys(groups map[string][]entity) []string {
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
