package sensorthings

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/ist-sos4/ist-sos4-grafana/pkg/models"
)

func BuildURL(baseURL string, query models.IstSOS4Query) (string, error) {
	if strings.TrimSpace(baseURL) == "" {
		return "", fmt.Errorf("base URL is required")
	}
	if query.Entity == "" {
		return "", fmt.Errorf("entity is required")
	}
	query = prepareQuery(query)

	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return "", fmt.Errorf("parse base URL: %w", err)
	}

	entityPath, err := buildEntityPath(query)
	if err != nil {
		return "", err
	}

	entityURL, err := base.Parse(entityPath)
	if err != nil {
		return "", fmt.Errorf("build entity URL: %w", err)
	}

	if strings.TrimSpace(query.Expression) != "" {
		rawExpression := normalizeExpressionQuery(strings.TrimSpace(query.Expression))
		rawExpression = replaceGrafanaTimeMacros(rawExpression, query)
		timeRangeFilter := buildGrafanaTimeRangeFilter(query)
		if expressionHasTimeRangeFilter(rawExpression, query.GrafanaTimeRangeField) {
			timeRangeFilter = ""
		}
		expression := appendFilterToExpression(rawExpression, timeRangeFilter)
		entityURL.RawQuery = encodeExpressionQuery(appendTimeRangeOrderByToExpression(expression, query))
		return entityURL.String(), nil
	}

	values := url.Values{}
	filterExpression := buildFilterExpression(query.Filters)
	timeRangeFilter := buildGrafanaTimeRangeFilter(query)
	if filterExpression != "" && timeRangeFilter != "" {
		filterExpression += " and " + timeRangeFilter
	} else if timeRangeFilter != "" {
		filterExpression = timeRangeFilter
	}
	if filterExpression != "" {
		values.Set("$filter", filterExpression)
	}
	if len(query.Select) > 0 {
		values.Set("$select", strings.Join(query.Select, ","))
	}
	if len(query.OrderBy) > 0 {
		parts := make([]string, 0, len(query.OrderBy))
		for _, order := range query.OrderBy {
			direction := strings.TrimSpace(order.Direction)
			if direction == "" {
				direction = "asc"
			}
			parts = append(parts, strings.TrimSpace(order.Property+" "+direction))
		}
		values.Set("$orderby", strings.Join(parts, ","))
	} else if query.UseGrafanaTimeRange {
		field := query.GrafanaTimeRangeField
		if field == "" {
			field = "phenomenonTime"
		}
		values.Set("$orderby", field)
	}
	if query.Top != nil {
		values.Set("$top", strconv.Itoa(*query.Top))
	}
	if query.Skip != nil {
		values.Set("$skip", strconv.Itoa(*query.Skip))
	}
	if query.Count {
		values.Set("$count", "true")
	}
	if query.ResultFormat != "" && query.ResultFormat != "default" {
		values.Set("$resultFormat", query.ResultFormat)
	}
	if query.AsOf != "" {
		values.Set("asOf", query.AsOf)
	}
	if query.FromTo != nil && !query.UseGrafanaTimeRange && !hasExpandGrafanaTimeRange(query.Expand) {
		values.Set("from", query.FromTo.From)
		values.Set("to", query.FromTo.To)
	}
	if len(query.Expand) > 0 {
		values.Set("$expand", buildExpand(query.Expand, query.FromTo))
	}

	entityURL.RawQuery = encodeQueryValues(values)
	return entityURL.String(), nil
}

func hasExpandGrafanaTimeRange(expands []models.ExpandOption) bool {
	for _, expand := range expands {
		if expand.SubQuery != nil && expand.SubQuery.UseGrafanaTimeRange {
			return true
		}
	}
	return false
}

func buildEntityPath(query models.IstSOS4Query) (string, error) {
	segments := make([]string, 0, len(query.NavigationPath)+1)
	for _, navigation := range query.NavigationPath {
		if !isKnownEntity(navigation.Entity) {
			return "", fmt.Errorf("invalid navigation entity %q", navigation.Entity)
		}
		segment := string(navigation.Entity)
		if len(navigation.EntityID) == 0 || string(navigation.EntityID) == "null" {
			return "", fmt.Errorf("%s navigation entity ID is required", navigation.Entity)
		}
		id, err := navigationEntityID(navigation.EntityID)
		if err != nil {
			return "", fmt.Errorf("invalid %s navigation entity ID: %w", navigation.Entity, err)
		}
		segment += "(" + id + ")"
		segments = append(segments, segment)
	}

	segment := string(query.Entity)
	if query.EntityID != nil {
		segment += "(" + strconv.FormatInt(*query.EntityID, 10) + ")"
	}
	segments = append(segments, segment)
	return strings.Join(segments, "/"), nil
}

func navigationEntityID(raw json.RawMessage) (string, error) {
	if id, ok := rawInt64(raw); ok && id >= 0 {
		return strconv.FormatInt(id, 10), nil
	}
	return "", fmt.Errorf("must be a non-negative integer")
}

func isKnownEntity(entity models.EntityType) bool {
	switch entity {
	case models.EntityThings, models.EntityLocations, models.EntitySensors,
		models.EntityObservedProperties, models.EntityDatastreams, models.EntityObservations,
		models.EntityFeaturesOfInterest, models.EntityHistoricalLocations:
		return true
	default:
		return false
	}
}

func prepareQuery(query models.IstSOS4Query) models.IstSOS4Query {
	if len(query.Filters) == 0 {
		query.Expand = prepareExpands(query.Expand, nil)
		return query
	}

	observationFilters := make([]models.FilterCondition, 0)
	nonObservationFilters := make([]models.FilterCondition, 0, len(query.Filters))
	for _, filter := range query.Filters {
		if filter.Type == "variable" && compareEntityNames(filter.Entity, query.Entity) {
			if id, ok := filterEntityIDValue(filter); ok {
				query.EntityID = &id
			}
			continue
		}
		if filter.Type == "observation" && query.Entity == models.EntityDatastreams {
			observationFilters = append(observationFilters, filter)
			continue
		}
		nonObservationFilters = append(nonObservationFilters, filter)
	}

	query.Filters = nonObservationFilters
	query.Expand = prepareExpands(query.Expand, observationFilters)
	return query
}

func prepareExpands(expands []models.ExpandOption, observationFilters []models.FilterCondition) []models.ExpandOption {
	if len(expands) == 0 {
		return expands
	}

	prepared := make([]models.ExpandOption, len(expands))
	copy(prepared, expands)
	observationFilter := buildFilterExpression(observationFilters)
	for index, expand := range prepared {
		if expand.Entity == models.EntityHistoricalLocations && expand.SubQuery == nil {
			prepared[index].SubQuery = &models.ExpandSubQuery{
				Expand: []models.EntityType{models.EntityLocations},
			}
		}
		if expand.Entity == models.EntityObservations && observationFilter != "" {
			subQuery := expand.SubQuery
			if subQuery == nil {
				subQuery = &models.ExpandSubQuery{}
			} else {
				copied := *subQuery
				subQuery = &copied
			}
			subQuery.Filter = observationFilter
			prepared[index].SubQuery = subQuery
		}
	}

	return prepared
}

func filterEntityIDValue(filter models.FilterCondition) (int64, bool) {
	if len(filter.Value) > 0 && string(filter.Value) != "null" {
		if id, ok := rawInt64(filter.Value); ok {
			return id, true
		}
	}
	if filter.VariableName != "" {
		id, err := strconv.ParseInt(strings.TrimSpace(filter.VariableName), 10, 64)
		if err == nil {
			return id, true
		}
	}
	return 0, false
}

func rawInt64(raw json.RawMessage) (int64, bool) {
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		id, err := strconv.ParseInt(number.String(), 10, 64)
		return id, err == nil
	}

	text := rawString(raw)
	id, err := strconv.ParseInt(text, 10, 64)
	return id, err == nil
}

func buildFilterExpression(filters []models.FilterCondition) string {
	parts := make([]string, 0, len(filters))
	for _, filter := range filters {
		expression := buildFilterCondition(filter)
		if expression != "" {
			parts = append(parts, expression)
		}
	}
	return strings.Join(parts, " and ")
}

func buildFilterCondition(filter models.FilterCondition) string {
	if filter.Operator == "" || filter.Field == "" {
		return ""
	}

	switch filter.Type {
	case "temporal":
		return buildTemporalFilter(filter)
	case "variable":
		return buildVariableFilter(filter)
	case "entity":
		return buildEntityFilter(filter)
	case "basic", "measurement", "observation":
		if len(filter.Value) == 0 || string(filter.Value) == "null" {
			return ""
		}
		return buildSimpleFilter(filter.Field, filter.Operator, filter.Field, filter.Value)
	default:
		if len(filter.Value) == 0 || string(filter.Value) == "null" {
			return ""
		}
		return buildSimpleFilter(filter.Field, filter.Operator, filter.Field, filter.Value)
	}
}

func buildTemporalFilter(filter models.FilterCondition) string {
	if filter.StartDate != "" && filter.EndDate != "" {
		return fmt.Sprintf(
			"%s ge '%s' and %s le '%s'",
			filter.Field,
			escapeODataString(filter.StartDate),
			filter.Field,
			escapeODataString(filter.EndDate),
		)
	}
	if len(filter.Value) == 0 || string(filter.Value) == "null" {
		return ""
	}
	if isDatePartOperator(filter.Operator) {
		value := formatNumericLikeValue(filter.Value)
		if value == "" {
			return ""
		}
		return fmt.Sprintf("%s(%s) eq %s", filter.Operator, filter.Field, value)
	}

	value := formatDateTimeValue(filter.Value)
	if value == "" {
		return ""
	}
	return fmt.Sprintf("%s %s %s", filter.Field, filter.Operator, value)
}

func buildVariableFilter(filter models.FilterCondition) string {
	path := strings.Trim(string(filter.Entity)+"/"+filter.Field, "/")
	if path == "" {
		return ""
	}
	if len(filter.Value) > 0 && string(filter.Value) != "null" {
		return buildSimpleFilter(path, filter.Operator, filter.Field, filter.Value)
	}
	if filter.VariableName != "" {
		return fmt.Sprintf("%s %s %s", path, filter.Operator, filter.VariableName)
	}
	return ""
}

func buildEntityFilter(filter models.FilterCondition) string {
	if filter.Entity == "" || len(filter.Value) == 0 || string(filter.Value) == "null" {
		return ""
	}
	path := normalizeRelatedEntityName(filter.Entity) + "/" + filter.Field
	return buildSimpleFilter(path, filter.Operator, filter.Field, filter.Value)
}

func buildSimpleFilter(path string, operator string, field string, raw json.RawMessage) string {
	if operator == "startswith" || operator == "endswith" {
		value := rawString(raw)
		if value == "" {
			return ""
		}
		return fmt.Sprintf("%s(%s,'%s')", operator, path, escapeODataString(value))
	}
	if operator == "substringof" {
		value := rawString(raw)
		if value == "" {
			return ""
		}
		return fmt.Sprintf("substringof('%s',%s)", escapeODataString(value), path)
	}

	if multi := buildMultiValueFilter(path, operator, field, raw); multi != "" {
		return multi
	}

	value := formatFilterValue(field, raw)
	if value == "" {
		return ""
	}
	return fmt.Sprintf("%s %s %s", path, operator, value)
}

func buildMultiValueFilter(path string, operator string, field string, raw json.RawMessage) string {
	if operator != "eq" && operator != "ne" {
		return ""
	}
	text := rawString(raw)
	if !strings.Contains(text, ",") {
		return ""
	}

	rawParts := strings.Split(text, ",")
	parts := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		part = strings.TrimSpace(part)
		if part == "" {
			return ""
		}
		parts = append(parts, fmt.Sprintf("%s %s %s", path, operator, formatFilterString(field, part)))
	}
	if len(parts) <= 1 {
		return ""
	}

	joinOperator := " or "
	if operator == "ne" {
		joinOperator = " and "
	}
	return "(" + strings.Join(parts, joinOperator) + ")"
}

func formatFilterValue(field string, raw json.RawMessage) string {
	if field == "@iot.id" || field == "id" || field == "result" {
		return formatNumericLikeValue(raw)
	}
	if field == "phenomenonTime" || field == "resultTime" {
		return formatDateTimeValue(raw)
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return ""
	}
	return formatAnyValue(value)
}

func formatFilterString(field string, value string) string {
	if field == "@iot.id" || field == "id" || field == "result" {
		if isNumericLike(value) {
			return value
		}
	}
	return "'" + escapeODataString(value) + "'"
}

func formatNumericLikeValue(raw json.RawMessage) string {
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		return number.String()
	}

	text := rawString(raw)
	if isNumericLike(text) {
		return text
	}
	return formatAnyValue(text)
}

func formatDateTimeValue(raw json.RawMessage) string {
	text := rawString(raw)
	if text == "" {
		return ""
	}
	return "'" + escapeODataString(text) + "'"
}

func formatAnyValue(value any) string {
	switch typed := value.(type) {
	case string:
		return "'" + escapeODataString(typed) + "'"
	case float64, bool:
		return fmt.Sprint(typed)
	case json.Number:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}

func rawString(raw json.RawMessage) string {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(string(raw))
}

func isDatePartOperator(operator string) bool {
	switch operator {
	case "year", "month", "day", "hour", "minute", "second":
		return true
	default:
		return false
	}
}

func isNumericLike(value string) bool {
	if value == "true" || value == "false" {
		return true
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return true
	}
	return false
}

func escapeODataString(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func getSingularEntityName(entity models.EntityType) string {
	switch entity {
	case models.EntityThings:
		return "Thing"
	case models.EntityLocations:
		return "Location"
	case models.EntitySensors:
		return "Sensor"
	case models.EntityObservedProperties:
		return "ObservedProperty"
	case models.EntityDatastreams:
		return "Datastream"
	case models.EntityObservations:
		return "Observation"
	case models.EntityFeaturesOfInterest:
		return "FeatureOfInterest"
	case models.EntityHistoricalLocations:
		return "HistoricalLocation"
	default:
		return strings.TrimSuffix(string(entity), "s")
	}
}

func normalizeRelatedEntityName(entity models.EntityType) string {
	if strings.HasSuffix(string(entity), "s") {
		return getSingularEntityName(entity)
	}
	return string(entity)
}

func compareEntityNames(variableEntity models.EntityType, queryEntity models.EntityType) bool {
	if variableEntity == "" || queryEntity == "" {
		return false
	}
	if queryEntity == models.EntityObservedProperties {
		return string(variableEntity) == "ObservedProperty"
	}
	return string(variableEntity) == strings.TrimSuffix(string(queryEntity), "s")
}

func buildGrafanaTimeRangeFilter(query models.IstSOS4Query) string {
	if !query.UseGrafanaTimeRange {
		return ""
	}

	field := query.GrafanaTimeRangeField
	if field == "" {
		field = "phenomenonTime"
	}

	from := "${__from:date:iso}"
	to := "${__to:date:iso}"
	if query.FromTo != nil {
		if query.FromTo.From != "" {
			from = query.FromTo.From
		}
		if query.FromTo.To != "" {
			to = query.FromTo.To
		}
	}

	return fmt.Sprintf("%s ge '%s' and %s le '%s'", field, from, field, to)
}

func expressionHasTimeRangeFilter(expression, field string) bool {
	if field == "" {
		field = "phenomenonTime"
	}
	normalizedExpression := strings.ToLower(expression)
	normalizedField := strings.ToLower(field)
	return strings.Contains(normalizedExpression, normalizedField+" ge ") &&
		strings.Contains(normalizedExpression, normalizedField+" le ")
}

func normalizeExpressionQuery(expression string) string {
	expression = strings.TrimSpace(expression)
	if expression == "" {
		return expression
	}

	if decoded, err := url.QueryUnescape(expression); err == nil {
		expression = decoded
	}
	if parsed, err := url.Parse(expression); err == nil && parsed.RawQuery != "" {
		return parsed.RawQuery
	}
	if questionIndex := strings.Index(expression, "?"); questionIndex >= 0 {
		return expression[questionIndex+1:]
	}
	return strings.TrimPrefix(expression, "?")
}

func replaceGrafanaTimeMacros(expression string, query models.IstSOS4Query) string {
	if query.FromTo == nil {
		return expression
	}

	if query.FromTo.From != "" {
		expression = strings.ReplaceAll(expression, "${__from:date:iso}", query.FromTo.From)
		expression = strings.ReplaceAll(expression, "$__from", query.FromTo.From)
	}
	if query.FromTo.To != "" {
		expression = strings.ReplaceAll(expression, "${__to:date:iso}", query.FromTo.To)
		expression = strings.ReplaceAll(expression, "$__to", query.FromTo.To)
	}
	return expression
}

func encodeExpressionQuery(expression string) string {
	queryString := strings.TrimPrefix(strings.TrimSpace(expression), "?")
	if queryString == "" {
		return ""
	}

	values := url.Values{}
	for _, part := range strings.Split(queryString, "&") {
		if part == "" {
			continue
		}

		key, value, _ := strings.Cut(part, "=")
		key = queryUnescapeOrOriginal(key)
		value = queryUnescapeOrOriginal(value)
		values.Add(key, value)
	}

	return encodeQueryValues(values)
}

func encodeQueryValues(values url.Values) string {
	return strings.ReplaceAll(values.Encode(), "+", "%20")
}

func queryUnescapeOrOriginal(value string) string {
	unescaped, err := url.QueryUnescape(value)
	if err != nil {
		return value
	}
	return unescaped
}

func appendFilterToExpression(expression string, filterExpression string) string {
	if filterExpression == "" {
		return expression
	}

	prefix := ""
	queryString := expression
	if strings.HasPrefix(expression, "?") {
		prefix = "?"
		queryString = strings.TrimPrefix(expression, "?")
	}

	parts := strings.Split(queryString, "&")
	for index, part := range parts {
		if strings.HasPrefix(part, "$filter=") {
			parts[index] = part + " and " + filterExpression
			return prefix + strings.Join(parts, "&")
		}
	}

	parts = append([]string{"$filter=" + filterExpression}, parts...)
	return prefix + strings.Join(parts, "&")
}

func appendTimeRangeOrderByToExpression(expression string, query models.IstSOS4Query) string {
	if !query.UseGrafanaTimeRange {
		return expression
	}

	prefix := ""
	queryString := expression
	if strings.HasPrefix(expression, "?") {
		prefix = "?"
		queryString = strings.TrimPrefix(expression, "?")
	}

	parts := strings.Split(queryString, "&")
	for _, part := range parts {
		if strings.HasPrefix(part, "$orderby=") {
			return expression
		}
	}

	field := query.GrafanaTimeRangeField
	if field == "" {
		field = "phenomenonTime"
	}

	parts = append(parts, "$orderby="+field)
	return prefix + strings.Join(parts, "&")
}

func buildExpand(expands []models.ExpandOption, timeRange *models.TimeRange) string {
	parts := make([]string, 0, len(expands))
	for _, expand := range expands {
		if expand.SubQuery == nil {
			parts = append(parts, string(expand.Entity))
			continue
		}

		subParts := make([]string, 0, 4)
		if len(expand.SubQuery.Expand) > 0 {
			values := make([]string, 0, len(expand.SubQuery.Expand))
			for _, nestedExpand := range expand.SubQuery.Expand {
				values = append(values, string(nestedExpand))
			}
			subParts = append(subParts, "$expand="+strings.Join(values, ","))
		}
		filter := expand.SubQuery.Filter
		if expand.SubQuery.UseGrafanaTimeRange {
			timeFilter := buildExpandGrafanaTimeRangeFilter(expand.SubQuery, timeRange)
			if filter != "" {
				// Some SensorThings implementations parse a leading parenthesized
				// expression as the end of the expanded entity options.
				filter += " and " + timeFilter
			} else {
				filter = timeFilter
			}
		}
		if filter != "" {
			subParts = append(subParts, "$filter="+filter)
		}
		if len(expand.SubQuery.Select) > 0 {
			subParts = append(subParts, "$select="+strings.Join(expand.SubQuery.Select, ","))
		}
		if len(expand.SubQuery.OrderBy) > 0 {
			orderParts := make([]string, 0, len(expand.SubQuery.OrderBy))
			for _, order := range expand.SubQuery.OrderBy {
				direction := strings.TrimSpace(order.Direction)
				if direction == "" {
					direction = "asc"
				}
				orderParts = append(orderParts, strings.TrimSpace(order.Property+" "+direction))
			}
			subParts = append(subParts, "$orderby="+strings.Join(orderParts, ","))
		} else if expand.SubQuery.UseGrafanaTimeRange {
			field := expand.SubQuery.GrafanaTimeRangeField
			if field == "" {
				field = "phenomenonTime"
			}
			subParts = append(subParts, "$orderby="+field)
		}
		if expand.SubQuery.Top != nil {
			subParts = append(subParts, "$top="+strconv.Itoa(*expand.SubQuery.Top))
		}
		if expand.SubQuery.Skip != nil {
			subParts = append(subParts, "$skip="+strconv.Itoa(*expand.SubQuery.Skip))
		}

		expandValue := string(expand.Entity)
		if len(subParts) > 0 {
			expandValue += "(" + strings.Join(subParts, ";") + ")"
		}
		parts = append(parts, expandValue)
	}

	return strings.Join(parts, ",")
}

func buildExpandGrafanaTimeRangeFilter(subQuery *models.ExpandSubQuery, timeRange *models.TimeRange) string {
	field := subQuery.GrafanaTimeRangeField
	if field == "" {
		field = "phenomenonTime"
	}
	from := "${__from:date:iso}"
	to := "${__to:date:iso}"
	if timeRange != nil {
		if timeRange.From != "" {
			from = timeRange.From
		}
		if timeRange.To != "" {
			to = timeRange.To
		}
	}
	return fmt.Sprintf("%s ge '%s' and %s le '%s'", field, from, field, to)
}
