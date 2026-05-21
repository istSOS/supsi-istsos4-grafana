import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
/*
This file contains the IstSOS4 Query Interface.
This interface defines the query parameters for the IstSOS4 datasource.
The Query Interface is used to build the query string for the IstSOS4 API following Query Builder Pattern.
*/
export interface IstSOS4Query extends DataQuery {
  // Entity selection
  entity: EntityType;
  entityId?: number | string;
  // Query parameters
  filters?: FilterCondition[];
  expand?: ExpandOption[];
  select?: string[];
  orderby?: OrderByOption[];
  top?: number;
  skip?: number;
  count?: boolean;
  resultFormat?: ResultFormat;
  expression?: string
  
  // Time-related queries
  asOf?: string;
  fromTo?: {
    from: string;
    to: string;
  };
  useGrafanaTimeRange?: boolean;
  grafanaTimeRangeField?: 'phenomenonTime' | 'resultTime';
  
  // Grafana-specific
  alias?: string;
  hide?: boolean;
}
// Variable interface (it basically filters)
export interface Variable {
  name: string;
  entity: EntityType;
  entityId?: number | string;
}

// Legacy query interface for backward compatibility
export interface MyQuery extends DataQuery {
  queryText?: string;
  constant: number;
}

export const DEFAULT_QUERY: Partial<IstSOS4Query> = {
  entity: 'Things',
  count: false,
  resultFormat: 'default',
  filters: [],
  expression: '',
  useGrafanaTimeRange: true,
  grafanaTimeRangeField: 'phenomenonTime',
};

export interface Entity {
  '@iot.id': number;
  name?: string;
  description?: string;
}

// Entity types
export type EntityType = 
  | 'Things'
  | 'Locations' 
  | 'Sensors'
  | 'ObservedProperties'
  | 'Datastreams'
  | 'Observations'
  | 'FeaturesOfInterest'
  | 'HistoricalLocations';

// Expand options
export interface ExpandOption {
  entity: EntityType;
  subQuery?: {
    filter?: string;
    select?: string[];
    orderby?: OrderByOption[];
    top?: number;
    skip?: number;
  };
}

// Order by options
export interface OrderByOption {
  property: string;
  direction: 'asc' | 'desc';
}

// Result format options
export type ResultFormat = 'default' | 'dataArray';

// Filter operators
export type FilterOperator = 
  | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
  | 'and' | 'or' | 'not'
  | 'startswith' | 'endswith' | 'substringof'
  | 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'
  | 'st_within' | 'st_intersects' | 'st_distance';

export type FilterType = 
  | 'temporal' 
  | 'basic' 
  | 'measurement' 
  | 'spatial' 
  | 'observation'
  | 'variable'
  | 'entity';

export type FilterField = 
  | 'name'
  | '@iot.id'
  | 'description'
  | 'resultTime'
  | 'phenomenonTime'
  | 'unitOfMeasurement/name'
  | 'unitOfMeasurement/symbol'
  | 'observedArea'
  | 'result'
  | 'observationType'
  | 'properties'
  | string; 

export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';
export type StringOperator = 'startswith' | 'endswith' | 'substringof';
export type SpatialOperator = 'st_within' | 'st_intersects' | 'st_distance' | 'geo.distance' | 'geo.length' | 'geo.intersects';
export type TemporalFunction = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export interface FilterCondition {
  id: string;
  type: FilterType;
  field: FilterField;
  operator: ComparisonOperator | StringOperator | SpatialOperator | TemporalFunction;
  value: string | number | boolean | object | null;
  // for variable filter
  entity?: EntityType;
}

export interface TemporalFilter extends FilterCondition {
  type: 'temporal';
  field: 'resultTime' | 'phenomenonTime';
  startDate?: string;
  endDate?: string;
}

export interface BasicFilter extends FilterCondition {
  type: 'basic';
  field: 'name' | '@iot.id' | 'description' | string;
  operator: ComparisonOperator | StringOperator;
}

export interface MeasurementFilter extends FilterCondition {
  type: 'measurement';
  field: 'unitOfMeasurement/name' | 'unitOfMeasurement/symbol' | 'result';
  operator: ComparisonOperator;
}

export interface PolygonCoordinates {
  coordinates: Array<[number, number]>;
}

export interface SpatialFilter extends FilterCondition {
  type: 'spatial';
  field: 'observedArea' | 'location';
  operator: SpatialOperator;
  geometryType: 'Point' | 'Polygon' | 'LineString';
  coordinates: any;
  rings?: PolygonCoordinates[];
}

export interface ObservationFilter extends FilterCondition {
  type: 'observation';
  field: 'result' | 'phenomenonTime' | 'resultTime';
  operator: ComparisonOperator;
}

export interface VariableFilter extends FilterCondition {
  type: 'variable';
  field: 'id';
  entity: EntityType;
  operator: ComparisonOperator;
  variableName: string;
}

export interface EntityFilter extends FilterCondition {
  type: 'entity';
  field: '@iot.id' | 'name' | 'description';
  operator: ComparisonOperator;
  entity: EntityType;
}

// Query builder interface
export interface QueryBuilder {
  entity(type: EntityType): QueryBuilder;
  withId(id: number): QueryBuilder;
  expand(entity: EntityType, subQuery?: any): QueryBuilder;
  select(...properties: string[]): QueryBuilder;
  orderBy(property: string, direction?: 'asc' | 'desc'): QueryBuilder;
  top(count: number): QueryBuilder;
  skip(count: number): QueryBuilder;
  count(include?: boolean): QueryBuilder;
  asOf(timestamp: string): QueryBuilder;
  build(): IstSOS4Query;
}

// Response interfaces
export interface SensorThingsResponse<T = any> {
  '@iot.count'?: number;
  '@iot.nextLink'?: string;
  value: T[];
}

export interface Thing {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  description: string;
  properties?: Record<string, any>;
  'Locations@iot.navigationLink'?: string;
  'Datastreams@iot.navigationLink'?: string;
  'HistoricalLocations@iot.navigationLink'?: string;
}

export interface Observation {
  '@iot.id': number;
  '@iot.selfLink': string;
  phenomenonTime: string;
  result: number | string | boolean | object;
  resultTime?: string;
  resultQuality?: any;
  validTime?: string;
  parameters?: Record<string, any>;
  'Datastream@iot.navigationLink'?: string;
  'FeatureOfInterest@iot.navigationLink'?: string;
}

export interface Datastream {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  description: string;
  unitOfMeasurement: {
    name: string;
    symbol: string;
    definition?: string;
  };
  Obsevations?: Observation[];
  observationType: string;
  observedArea?: any;
  phenomenonTime?: string;
  resultTime?: string;
  properties?: Record<string, any>;
  'Thing@iot.navigationLink'?: string;
  'Sensor@iot.navigationLink'?: string;
  'ObservedProperty@iot.navigationLink'?: string;
  'Observations@iot.navigationLink'?: string;
}

export interface Location {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  description: string;
  encodingType: string;
  location: any;
  properties?: Record<string, any>;
  'Things@iot.navigationLink'?: string;
  'HistoricalLocations@iot.navigationLink'?: string;
}

export interface Sensor {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  description: string;
  encodingType: string;
  metadata: any;
  properties?: Record<string, any>;
  'Datastreams@iot.navigationLink'?: string;
}

export interface ObservedProperty {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  definition: string;
  description: string;
  properties?: Record<string, any>;
  'Datastreams@iot.navigationLink'?: string;
}

export interface FeatureOfInterest {
  '@iot.id': number;
  '@iot.selfLink': string;
  name: string;
  description: string;
  encodingType: string;
  feature: any;
  properties?: Record<string, any>;
  'Observations@iot.navigationLink'?: string;
}

export interface HistoricalLocation {
  '@iot.id': number;
  '@iot.selfLink': string;
  time: string;
  'Thing@iot.navigationLink'?: string;
  'Locations@iot.navigationLink'?: string;
}

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  path?: string;
  apiUrl?: string;
  authType?: 'anonymous' | 'oauth2';
  // OAuth2 configuration (non-sensitive)
  oauth2TokenUrl?: string;
  oauth2RefreshUrl?: string;
  oauth2Username?: string;
  oauth2ClientId?: string;
  // Default pagination size
  defaultTop?: number;
  // Default pagination size for expanded Observations
  defaultExpandedObservationsTop?: number;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  // OAuth2 secure fields
  oauth2Password?: string;
  oauth2ClientSecret?: string;
}
