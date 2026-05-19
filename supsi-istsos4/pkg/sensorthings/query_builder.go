package sensorthings

import (
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

	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return "", fmt.Errorf("parse base URL: %w", err)
	}

	entityPath := string(query.Entity)
	if query.EntityID != nil {
		entityPath += "(" + strconv.FormatInt(*query.EntityID, 10) + ")"
	}

	entityURL, err := base.Parse(entityPath)
	if err != nil {
		return "", fmt.Errorf("build entity URL: %w", err)
	}

	if strings.TrimSpace(query.Expression) != "" {
		rawExpression := strings.TrimSpace(query.Expression)
		expression := appendFilterToExpression(rawExpression, buildGrafanaTimeRangeFilter(query))
		entityURL.RawQuery = strings.TrimPrefix(appendTimeRangeOrderByToExpression(expression, query), "?")
		return entityURL.String(), nil
	}

	values := url.Values{}
	filterExpression := buildGrafanaTimeRangeFilter(query)
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
	if query.FromTo != nil {
		values.Set("from", query.FromTo.From)
		values.Set("to", query.FromTo.To)
	}
	if len(query.Expand) > 0 {
		values.Set("$expand", buildExpand(query.Expand))
	}

	entityURL.RawQuery = values.Encode()
	return entityURL.String(), nil
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

func buildExpand(expands []models.ExpandOption) string {
	parts := make([]string, 0, len(expands))
	for _, expand := range expands {
		if expand.SubQuery == nil {
			parts = append(parts, string(expand.Entity))
			continue
		}

		subParts := make([]string, 0, 4)
		if expand.SubQuery.Filter != "" {
			subParts = append(subParts, "$filter="+expand.SubQuery.Filter)
		}
		if len(expand.SubQuery.Select) > 0 {
			subParts = append(subParts, "$select="+strings.Join(expand.SubQuery.Select, ","))
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
