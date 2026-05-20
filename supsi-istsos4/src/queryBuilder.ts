import {
  IstSOS4Query,
  EntityType,
  QueryBuilder as MyQueryBuilder,
  OrderByOption,
  FilterCondition,
  TemporalFilter,
  SpatialFilter,
  ObservationFilter,
  VariableFilter,
  EntityFilter,
} from './types';
import { compareEntityNames, getSingularEntityName } from './utils/utils';

/*
This file contains the Query Builder class.
The Query Builder class is used to build the query string for the IstSOS4 API following Query Builder Pattern.
The file also contains Common Filter Expressions for SensorThings API.
*/

export class QueryBuilder implements MyQueryBuilder {
  private query: Partial<IstSOS4Query> = {};

  entity(type: EntityType): QueryBuilder {
    this.query.entity = type;
    return this;
  }

  withId(id: number): QueryBuilder {
    this.query.entityId = id;
    return this;
  }

  expand(entity: EntityType, subQuery?: any): QueryBuilder {
    if (!this.query.expand) {
      this.query.expand = [];
    }
    this.query.expand.push({ entity, subQuery });
    return this;
  }

  select(...properties: string[]): QueryBuilder {
    this.query.select = properties;
    return this;
  }

  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
    if (!this.query.orderby) {
      this.query.orderby = [];
    }
    this.query.orderby.push({ property, direction });
    return this;
  }

  top(count: number): QueryBuilder {
    this.query.top = count;
    return this;
  }

  skip(count: number): QueryBuilder {
    this.query.skip = count;
    return this;
  }

  count(include: boolean = true): QueryBuilder {
    this.query.count = include;
    return this;
  }

  asOf(timestamp: string): QueryBuilder {
    this.query.asOf = timestamp;
    return this;
  }

  fromTo(from: string, to: string): QueryBuilder {
    this.query.fromTo = { from, to };
    return this;
  }

  alias(alias: string): QueryBuilder {
    this.query.alias = alias;
    return this;
  }

  resultFormat(format: 'default' | 'dataArray'): QueryBuilder {
    this.query.resultFormat = format;
    return this;
  }

  build(): IstSOS4Query {
    if (!this.query.entity) {
      throw new Error('Entity type is required');
    }
    return this.query as IstSOS4Query;
  }
}

export function createQueryBuilder(): QueryBuilder {
  return new QueryBuilder();
}

/**
 * Builds the query string from the query object
 */
export function buildODataQuery(query: IstSOS4Query, encode: boolean = true): string {
  const params: string[] = [];
  const timeRangeFilter = buildGrafanaTimeRangeFilter(query);

  // Check if custom query expression exists
  if (query.expression && query.expression.trim()) {
    const expression = query.expression.trim();
    const expressionWithFilter = appendFilterToExpression(
      expression.startsWith('?') ? expression : `?${expression}`,
      timeRangeFilter
    );
    const formattedExpression = appendTimeRangeOrderByToExpression(expressionWithFilter, query);
    return encode ? encodeURIComponent(formattedExpression) : formattedExpression;
  }

  // Fall back to existing filter logic only if no custom expression
  let observationFilters: FilterCondition[] = [];
  let nonObservationFilters: FilterCondition[] = [];

  if (query.filters && query.filters.length > 0) {
    nonObservationFilters = query.filters.filter(
      (f) =>
        !(f.type === 'observation' && query.entity === 'Datastreams') &&
        !(f.type === 'variable' && compareEntityNames(f.entity, query.entity))
    );
  }

  // Handle Datastreams with Observations expand
  let observationsExpand = query.expand?.find((exp) => exp.entity === 'Observations');
  if (query.entity === 'Datastreams' && observationsExpand && query.filters && query.filters.length) {
    observationFilters = query.filters.filter((f) => f.type === 'observation');
    // If we have Observation filters, add them to the Observations expand
    if (observationFilters.length > 0) {
      const observationFilterExpression = buildFilterExpression(observationFilters);
      if (observationFilterExpression) {
        observationsExpand.subQuery = observationsExpand.subQuery || {};
        observationsExpand.subQuery.filter = observationFilterExpression;
        console.log('Applied observation filter to expand:', observationFilterExpression);
      }
    } else {
      // remove the filter from the subQuery
      if (observationsExpand.subQuery?.filter) {
        const newSubQuery = { ...observationsExpand.subQuery };
        delete newSubQuery.filter;
        observationsExpand.subQuery = Object.keys(newSubQuery).length > 0 ? newSubQuery : undefined;
      }
    }
  }

  if (nonObservationFilters.length > 0) {
    const filterExpression = buildFilterExpression(nonObservationFilters);
    if (filterExpression) {
      const combinedFilter = [filterExpression, timeRangeFilter].filter(Boolean).join(' and ');
      params.push(`$filter=${encode ? encodeURIComponent(combinedFilter) : combinedFilter}`);
    }
  } else if (timeRangeFilter) {
    params.push(`$filter=${encode ? encodeURIComponent(timeRangeFilter) : timeRangeFilter}`);
  }

  if (query.select && query.select.length > 0) {
    const idExists = query.select.includes('id');
    idExists?params.push(`$select=${query.select.join(',')}`): params.push(`$select=${['@iot.id', ...query.select].join(',')}`);
  }
  

  if (query.orderby && query.orderby.length > 0) {
    const orderParts = query.orderby.map((o) => `${o.property} ${o.direction}`);
    params.push(`$orderby=${orderParts.join(',')}`);
  } else if (query.useGrafanaTimeRange) {
    params.push(`$orderby=${query.grafanaTimeRangeField || 'phenomenonTime'}`);
  }

  if (query.top !== undefined) {
    params.push(`$top=${query.top}`);
  }

  if (query.skip !== undefined) {
    params.push(`$skip=${query.skip}`);
  }

  if (query.count) {
    params.push('$count=true');
  }

  if (query.resultFormat && query.resultFormat !== 'default') {
    params.push(`$resultFormat=${query.resultFormat}`);
  }

  if (query.asOf) {
    params.push(`asOf=${encode ? encodeURIComponent(query.asOf) : query.asOf}`);
  }

  if (query.fromTo && !query.useGrafanaTimeRange) {
    params.push(`from=${encode ? encodeURIComponent(query.fromTo.from) : query.fromTo.from}`);
    params.push(`to=${encode ? encodeURIComponent(query.fromTo.to) : query.fromTo.to}`);
  }

  if (query.expand && query.expand.length > 0) {
    const expandParts = query.expand.map((exp) => {
      let expandStr = exp.entity;
      if (exp.entity === 'HistoricalLocations') {
        expandStr += '($expand=Locations)';
      }
      if (exp.subQuery) {
        const subParams: string[] = [];
        if (exp.subQuery.filter) {subParams.push(`$filter=${exp.subQuery.filter}`)};
        if (exp.subQuery.select) {subParams.push(`$select=${exp.subQuery.select.join(',')}`)};
        if (exp.subQuery.orderby) {
          const orderParts = exp.subQuery.orderby.map((o: OrderByOption) => `${o.property} ${o.direction}`);
          subParams.push(`$orderby=${orderParts.join(',')}`);
        }
        if (exp.subQuery.top) {subParams.push(`$top=${exp.subQuery.top}`)};
        if (exp.subQuery.skip) {subParams.push(`$skip=${exp.subQuery.skip}`)};

        if (subParams.length > 0) {
          expandStr += `(${subParams.join(';')})`;
        }
      }
      return expandStr;
    });
    params.push(`$expand=${expandParts.join(',')}`);
  }

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';
  return encode ? encodeURIComponent(queryString) : queryString;
}

function buildGrafanaTimeRangeFilter(query: IstSOS4Query): string {
  if (!query.useGrafanaTimeRange) {
    return '';
  }

  const field = query.grafanaTimeRangeField || 'phenomenonTime';
  const from = query.fromTo?.from || '${__from:date:iso}';
  const to = query.fromTo?.to || '${__to:date:iso}';
  return `${field} ge ${formatDateTime(from)} and ${field} le ${formatDateTime(to)}`;
}

function appendFilterToExpression(expression: string, filterExpression: string): string {
  if (!filterExpression) {
    return expression;
  }

  const queryPrefix = expression.startsWith('?') ? '?' : '';
  const queryString = queryPrefix ? expression.slice(1) : expression;
  const parts = queryString.split('&');
  const filterIndex = parts.findIndex((part) => part.startsWith('$filter='));

  if (filterIndex >= 0) {
    const existingFilter = parts[filterIndex].slice('$filter='.length);
    parts[filterIndex] = `$filter=${existingFilter} and ${filterExpression}`;
  } else {
    parts.unshift(`$filter=${filterExpression}`);
  }

  return `${queryPrefix}${parts.join('&')}`;
}

function appendTimeRangeOrderByToExpression(expression: string, query: IstSOS4Query): string {
  if (!query.useGrafanaTimeRange) {
    return expression;
  }

  const queryPrefix = expression.startsWith('?') ? '?' : '';
  const queryString = queryPrefix ? expression.slice(1) : expression;
  const parts = queryString.split('&');

  if (parts.some((part) => part.startsWith('$orderby='))) {
    return expression;
  }

  parts.push(`$orderby=${query.grafanaTimeRangeField || 'phenomenonTime'}`);
  return `${queryPrefix}${parts.join('&')}`;
}

/**
 * Builds a filter expression from structured filter conditions
 */
export function buildFilterExpression(filters: FilterCondition[]): string {
  const expressions = filters
    .map((filter) => {
      switch (filter.type) {
        case 'temporal':
          return buildTemporalFilter(filter as TemporalFilter);
        case 'basic':
          return buildBasicFilter(filter);
        case 'measurement':
          return buildMeasurementFilter(filter);
        case 'spatial':
          return buildSpatialFilter(filter as SpatialFilter);
        case 'observation':
          return buildObservationFilter(filter as ObservationFilter);
        case 'variable':
          return buildVariableFilter(filter as VariableFilter);
        case 'entity':
          return buildEntityFilter(filter as EntityFilter);
        default:
          return '';
      }
    })
    .filter((expr) => expr !== '');

  return expressions.join(' and ');
}

/**
 * Builds a temporal filter expression
 */
function buildTemporalFilter(filter: TemporalFilter): string {
  if (filter.startDate && filter.endDate) {
    return `${filter.field} ge ${formatDateTime(filter.startDate)} and ${filter.field} le ${formatDateTime(
      filter.endDate
    )}`;
  } else if (filter.operator && filter.value !== null && filter.value !== undefined) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(filter.operator)) {
      return `${filter.operator}(${filter.field}) eq ${formatNumericLikeValue(filter.value)}`;
    } else {
      return `${filter.field} ${filter.operator} ${formatDateTime(String(filter.value))}`;
    }
  }
  return '';
}

/**
 * Builds a basic filter expression (name, id, description)
 */
function buildBasicFilter(filter: FilterCondition): string {
  if (filter.operator && filter.value !== null && filter.value !== undefined) {
    if (['startswith', 'endswith'].includes(filter.operator)) {
      return `${filter.operator}(${filter.field},'${String(filter.value)}')`;
    } else if (filter.operator === 'substringof') {
      return `substringof('${String(filter.value)}',${filter.field})`;
    } else {
      const multiValueExpression = buildMultiValueFilter(filter.field, filter.field, filter.operator, filter.value);
      if (multiValueExpression) {
        return multiValueExpression;
      }

      return `${filter.field} ${filter.operator} ${formatFilterValue(filter.field, filter.value)}`;
    }
  }
  return '';
}

/**
 * Builds a measurement filter expression (unitOfMeasurement, result)
 */
function buildMeasurementFilter(filter: FilterCondition): string {
  if (filter.operator && filter.value !== null && filter.value !== undefined) {
    const multiValueExpression = buildMultiValueFilter(filter.field, filter.field, filter.operator, filter.value);
    if (multiValueExpression) {
      return multiValueExpression;
    }

    return `${filter.field} ${filter.operator} ${formatFilterValue(filter.field, filter.value)}`;
  }
  return '';
}

function buildVariableFilter(filter: VariableFilter): string {
  if (filter.operator && filter.value !== null && filter.value !== undefined) {
    const path = `${filter.entity}/${filter.field}`;
    const multiValueExpression = buildMultiValueFilter(path, filter.field, filter.operator, filter.value);
    if (multiValueExpression) {
      return multiValueExpression;
    }

    return `${path} ${filter.operator} ${formatFilterValue(filter.field, filter.value)}`;
  }
  if (filter.variableName) {
    return `${filter.entity}/${filter.field} ${filter.operator} ${filter.variableName}`;
  }
  return '';
}

/**
 * Builds an entity filter expression
 */
function buildEntityFilter(filter: EntityFilter): string {
  if (
    !filter.operator ||
    !filter.entity ||
    filter.value === null ||
    filter.value === undefined ||
    filter.value === ''
  ) {
    return '';
  }
  let entityPath: string = getSingularEntityName(filter.entity);
  const path = `${entityPath}/${filter.field}`;
  const multiValueExpression = buildMultiValueFilter(path, filter.field, filter.operator, filter.value);
  if (multiValueExpression) {
    return multiValueExpression;
  }

  const value = formatEntityFilterValue(filter.field, filter.value);
  return `${path} ${filter.operator} ${value}`;
}

function buildMultiValueFilter(path: string, field: string, operator: string, value: any): string {
  if (typeof value !== 'string' || !['eq', 'ne'].includes(operator)) {
    return '';
  }

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1 || parts.length !== value.split(',').length) {
    return '';
  }

  const joinOperator = operator === 'eq' ? ' or ' : ' and ';
  return `(${parts.map((part) => `${path} ${operator} ${formatFilterValue(field, part)}`).join(joinOperator)})`;
}

function formatEntityFilterValue(field: string, value: any): string {
  return formatFilterValue(field, value);
}

/**
 * Builds a spatial filter expression
 */
function buildSpatialFilter(filter: SpatialFilter): string {
  if (!filter.operator || !filter.geometryType) {
    return '';
  }

  let geometryString = '';
  if (filter.geometryType === 'Point') {
    if (!filter.coordinates || filter.coordinates.length < 2) {
      console.warn('Invalid Point coordinates for spatial filter, length less than 2');
      return '';
    }
    geometryString = `geography'POINT (${filter.coordinates[0]} ${filter.coordinates[1]})'`;
  } else if (filter.geometryType === 'Polygon') {
    if (!filter.rings || filter.rings.length === 0) {
      console.warn('Invalid Polygon rings for spatial filter, no rings provided');
      return '';
    }
    const ringsString = filter.rings
      .map((ring) => {
        if (!ring.coordinates || ring.coordinates.length < 4) {
          return '';
        }
        const coords = [...ring.coordinates];
        const firstPoint = coords[0];
        const lastPoint = coords[coords.length - 1];
        if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
          coords.push([firstPoint[0], firstPoint[1]]);
        }
        return coords.map((point) => `${point[0]} ${point[1]}`).join(', ');
      })
      .join('), (');

    if (ringsString.length === 0) {
      return '';
    }

    geometryString = `geography'POLYGON ((${ringsString}))'`;
  } else if (filter.geometryType === 'LineString') {
    if (!filter.coordinates || filter.coordinates.length < 2) {
      return '';
    }
    const coordsString = filter.coordinates.map((point: number[]) => `${point[0]} ${point[1]}`).join(', ');
    geometryString = `geography'LINESTRING (${coordsString})'`;
  }

  if (filter.operator === 'st_distance' && typeof filter.value === 'number') {
    return `${filter.operator}(${filter.field}, ${geometryString}) le ${filter.value}`;
  } else {
    return `${filter.operator}(${filter.field}, ${geometryString})`;
  }
}

/**
 * Builds an observation filter expression
 */
function buildObservationFilter(filter: ObservationFilter): string {
  if (filter.operator && filter.value !== null && filter.value !== undefined) {
    if (filter.field === 'phenomenonTime' || filter.field === 'resultTime') {
      return `${filter.field} ${filter.operator} ${formatDateTime(filter.value as string)}`;
    } else {
      const multiValueExpression = buildMultiValueFilter(filter.field, filter.field, filter.operator, filter.value);
      if (multiValueExpression) {
        return multiValueExpression;
      }

      return `${filter.field} ${filter.operator} ${formatFilterValue(filter.field, filter.value)}`;
    }
  }
  return '';
}

function formatFilterValue(field: string, value: any): string {
  if (field === '@iot.id' || field === 'id' || field === 'result') {
    return formatNumericLikeValue(value);
  }

  return formatValue(value);
}

function formatNumericLikeValue(value: any): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed) || trimmed === 'true' || trimmed === 'false') {
      return trimmed;
    }
  }

  return formatValue(value);
}

/**
 * Formats a value for use in a filter expression
 */
function formatValue(value: any): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  } else if (value instanceof Date) {
    return formatDateTime(value.toISOString());
  } else {
    return String(value);
  }
}

/**
 * Formats a date-time string for use in a filter expression
 */
function formatDateTime(dateTime: string): string {
  return `'${dateTime}'`;
}

/**
 * Builds the complete API URL for the query
 */
export function buildApiUrl(baseUrl: string, query: IstSOS4Query): string {
  let url = `${baseUrl}/${query.entity}`;

  if (query.entityId !== undefined) {
    url += `(${query.entityId})`;
  }

  url += buildODataQuery(query);

  return url;
}
