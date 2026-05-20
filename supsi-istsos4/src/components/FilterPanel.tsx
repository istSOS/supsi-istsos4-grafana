import React, { useState } from 'react';
import { Button, FieldSet, InlineField, InlineFieldRow, Input, Select, TextArea, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { v4 as uuidv4 } from 'uuid';
import {
  FilterCondition,
  FilterType,
  FilterField,
  TemporalFilter,
  BasicFilter,
  MeasurementFilter,
  SpatialFilter,
  EntityType,
  ObservationFilter,
  PolygonCoordinates,
  EntityFilter,
} from '../types';
import {
  COMMON_FIELDS,
  OBSERVATION_FIELDS,
  FILTER_TYPES,
  COMPARISON_OPERATORS,
  STRING_OPERATORS,
  SPATIAL_OPERATORS,
  TEMPORAL_FUNCTIONS,
  GEOMETRY_TYPES,
  MEASUREMENT_FIELDS,
  TEMPORAL_FIELDS,
  SPATIAL_FIELDS,
  ENTITY_OPTIONS,
} from '../utils/constants';
import { ensureClosedRing, parseCoordinateString } from 'utils/utils';
import { MapWithTerraDraw } from './MapWithTerraDraw';
interface FilterPanelProps {
  entityType: EntityType;
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ entityType, filters, onFiltersChange }) => {
  const styles = useStyles2(getStyles);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilterType, setNewFilterType] = useState<FilterType>('basic');
  const [coordinateErrors, setCoordinateErrors] = useState<Record<string, string>>({});

  const getPossibleFilters = (entityType: EntityType): Array<SelectableValue<FilterType>> => {
    let available: Array<string> = [];
    switch (entityType) {
      case 'Datastreams':
        return FILTER_TYPES;
      case 'Locations':
      case 'HistoricalLocations':
        available = ['basic', 'spatial', 'entity'];
        return FILTER_TYPES.filter((filterType) => filterType.value && available.includes(filterType.value));
      case 'Observations':
        available = ['observation', 'entity'];
        return FILTER_TYPES.filter((filterType) => filterType.value && available.includes(filterType.value));
      default:
        available=['basic'];
        return FILTER_TYPES.filter((filterType) => filterType.value && available.includes(filterType.value));
    }
  };

  const getAvailableEntityFilterOptions = (selectedEntity: EntityType): Array<SelectableValue<EntityType>> => {
    let availableOptions: Array<string> = [];
    switch (selectedEntity) {
      case 'Datastreams':
        availableOptions = ['Things', 'Sensors', 'ObservedProperties'];
        return ENTITY_OPTIONS.filter((op) => op.value && availableOptions.includes(op.value));
      case 'Locations':
      case 'HistoricalLocations':
        availableOptions = ['Things'];
        return ENTITY_OPTIONS.filter((op) => op.value && availableOptions.includes(op.value));
      case 'Observations':
        availableOptions = ['Datastreams'];
        return ENTITY_OPTIONS.filter((op) => op.value && availableOptions.includes(op.value));
      default:
        return [];
    }
  };

  const getFieldOptions = (filterType?: FilterType): Array<SelectableValue<FilterField>> => {
    const typeToCheck = filterType || newFilterType;
    if (typeToCheck === 'basic' || typeToCheck === 'entity') return COMMON_FIELDS;
    let availableFields: Array<string> = [];
    switch (entityType) {
      case 'Observations':
        return OBSERVATION_FIELDS;
      case 'Datastreams':
        switch (typeToCheck) {
          case 'measurement':
            return MEASUREMENT_FIELDS;
          case 'temporal':
            return TEMPORAL_FIELDS;
          case 'spatial':
            availableFields = ['observedArea'];
            return SPATIAL_FIELDS.filter((f) => f.value && availableFields.includes(f.value));
          default:
            return COMMON_FIELDS;
        }
      case 'Locations':
        switch (typeToCheck) {
          case 'spatial':
            availableFields = ['location'];
            return SPATIAL_FIELDS.filter((f) => f.value && availableFields.includes(f.value));
          default:
            return COMMON_FIELDS;
        }

      default:
        return COMMON_FIELDS;
    }
  };

  const addFilter = () => {
    const baseFilter: FilterCondition = {
      id: uuidv4(),
      type: newFilterType,
      field: getFieldOptions()[0].value!,
      operator: 'eq',
      value: '',
    };

    let newFilter: FilterCondition;

    switch (newFilterType) {
      case 'temporal':
        newFilter = {
          ...baseFilter,
          // For Observations, default is resultTime, otherwise phenomenonTime
          field: entityType === 'Observations' ? 'resultTime' : 'phenomenonTime',
          operator: 'ge', // Default to range filter
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        } as TemporalFilter;
        break;
      case 'spatial':
        const defaultPolygonRing: [number, number][] = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ];
        newFilter = {
          ...baseFilter,
          field: getFieldOptions('spatial')[0].value!,
          operator: 'st_within',
          geometryType: 'Polygon',
          coordinates: [defaultPolygonRing],
          rings: [{ coordinates: defaultPolygonRing }],
        } as SpatialFilter;
        break;
      case 'observation':
        const defaultField = OBSERVATION_FIELDS[0].value!;
        newFilter = {
          ...baseFilter,
          field: defaultField,
          operator: 'eq',
          value: defaultField === 'result' ? '0' : new Date().toISOString(),
        } as ObservationFilter;
        break;
      default:
        newFilter = baseFilter;
    }

    onFiltersChange([...filters, newFilter]);
    setShowAddFilter(false);
  };

  const updateFilter = (id: string, updates: Partial<FilterCondition>) => {
    const updatedFilters = filters.map((filter) => (filter.id === id ? { ...filter, ...updates } : filter));
    onFiltersChange(updatedFilters);
  };

  const removeFilter = (id: string) => {
    const updatedFilters = filters.filter((filter) => filter.id !== id);
    setCoordinateErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    onFiltersChange(updatedFilters);
  };

  const clearAllFilters = () => {
    setCoordinateErrors({});
    onFiltersChange([]);
  };

  const setCoordinateError = (id: string, message: string) => {
    setCoordinateErrors((current) => ({ ...current, [id]: message }));
  };

  const clearCoordinateError = (id: string) => {
    setCoordinateErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const getDateRangeWarning = (filter: TemporalFilter): string => {
    if (!filter.startDate || !filter.endDate) {
      return '';
    }
    const start = new Date(filter.startDate).getTime();
    const end = new Date(filter.endDate).getTime();
    if (isNaN(start) || isNaN(end)) {
      return 'Enter a valid start and end date.';
    }
    return start > end ? 'Start date must be before end date.' : '';
  };

  const summarizeFilter = (filter: FilterCondition): string => {
    if (filter.type === 'temporal') {
      const temporalFilter = filter as TemporalFilter;
      return `${filter.field} from ${temporalFilter.startDate || '...'} to ${temporalFilter.endDate || '...'}`;
    }
    if (filter.type === 'spatial') {
      const spatialFilter = filter as SpatialFilter;
      return `${filter.field} ${filter.operator} ${spatialFilter.geometryType}`;
    }
    if (filter.type === 'entity') {
      const entityFilter = filter as EntityFilter;
      return `${entityFilter.entity}/${filter.field} ${filter.operator} ${String(filter.value || '...')}`;
    }
    return `${filter.field} ${filter.operator} ${String(filter.value || '...')}`;
  };

  const getOperatorOptions = (filter: FilterCondition): Array<SelectableValue<any>> => {
    if (filter.type === 'spatial') {
      return SPATIAL_OPERATORS;
    } else if (
      filter.type === 'temporal' &&
      ['year', 'month', 'day', 'hour', 'minute', 'second'].includes(filter.operator)
    ) {
      return TEMPORAL_FUNCTIONS;
    } else if (filter.type === 'basic') {
      if (filter.field === '@iot.id') {
        return COMPARISON_OPERATORS;
      }
      return [...COMPARISON_OPERATORS, ...STRING_OPERATORS];
    } else {
      return COMPARISON_OPERATORS;
    }
  };

  const renderFilterForm = (filter: FilterCondition, index: number) => {
    switch (filter.type) {
      case 'temporal':
        return renderTemporalFilter(filter as TemporalFilter, index);
      case 'basic':
        return renderBasicFilter(filter as BasicFilter, index);
      case 'measurement':
        return renderMeasurementFilter(filter as MeasurementFilter, index);
      case 'spatial':
        return renderSpatialFilter(filter as SpatialFilter, index);
      case 'observation':
        return renderObservationFilter(filter as ObservationFilter, index);
      case 'entity':
        return renderEntityFilter(filter as EntityFilter, index);
      default:
        return null;
    }
  };

  const renderTemporalFilter = (filter: TemporalFilter, index: number) => {
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={getFieldOptions(filter.type)}
              value={filter.field}
              onChange={(v) => updateFilter(filter.id, { field: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Filter Type" labelWidth={10}>
            <Select
              options={[
                { label: 'Date Range', value: 'range', description: 'Filter by date range' },
                {
                  label: 'Temporal Function',
                  value: 'function',
                  description: 'Filter by temporal function (year, month, etc.)',
                },
              ]}
              value={
                filter.operator === 'eq' ||
                filter.operator === 'ne' ||
                filter.operator === 'gt' ||
                filter.operator === 'ge' ||
                filter.operator === 'lt' ||
                filter.operator === 'le'
                  ? 'range'
                  : 'function'
              }
              onChange={(v) => {
                if (v.value === 'range') {
                  updateFilter(filter.id, {
                    operator: 'ge',
                    startDate: filter.startDate || new Date().toISOString(),
                    endDate: filter.endDate || new Date().toISOString(),
                  } as Partial<TemporalFilter>);
                } else {
                  updateFilter(filter.id, {
                    operator: 'year',
                    value: new Date().getFullYear(),
                  } as Partial<TemporalFilter>);
                }
              }}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        {(filter.operator === 'eq' ||
          filter.operator === 'ne' ||
          filter.operator === 'gt' ||
          filter.operator === 'ge' ||
          filter.operator === 'lt' ||
          filter.operator === 'le') && (
          <>
            <InlineFieldRow>
              <InlineField label="Start Date" labelWidth={10}>
                <Input
                  type="datetime-local"
                  value={filter.startDate ? new Date(filter.startDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    const date = new Date(e.currentTarget.value);
                    if (!isNaN(date.getTime())) {
                      updateFilter(filter.id, { startDate: date.toISOString() } as Partial<TemporalFilter>);
                    }
                  }}
                  width={20}
                />
              </InlineField>
            </InlineFieldRow>

            <InlineFieldRow>
              <InlineField label="End Date" labelWidth={10}>
                <Input
                  type="datetime-local"
                  value={filter.endDate ? new Date(filter.endDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    const date = new Date(e.currentTarget.value);
                    if (!isNaN(date.getTime())) {
                      updateFilter(filter.id, { endDate: date.toISOString() } as Partial<TemporalFilter>);
                    }
                  }}
                  width={20}
                />
              </InlineField>
            </InlineFieldRow>
          </>
        )}
        {getDateRangeWarning(filter) && <div className={styles.validationMessage}>{getDateRangeWarning(filter)}</div>}

        {(filter.operator === 'year' ||
          filter.operator === 'month' ||
          filter.operator === 'day' ||
          filter.operator === 'hour' ||
          filter.operator === 'minute' ||
          filter.operator === 'second') && (
          <>
            <InlineFieldRow>
              <InlineField label="Function" labelWidth={10}>
                <Select
                  options={TEMPORAL_FUNCTIONS}
                  value={filter.operator}
                  onChange={(v) => updateFilter(filter.id, { operator: v.value! })}
                  width={20}
                />
              </InlineField>
            </InlineFieldRow>

            <InlineFieldRow>
              <InlineField label="Value" labelWidth={10}>
                <Input
                  type="number"
                  value={filter.value as number}
                  onChange={(e) => updateFilter(filter.id, { value: parseInt(e.currentTarget.value, 10) })}
                  width={20}
                />
              </InlineField>
            </InlineFieldRow>
          </>
        )}
      </div>
    );
  };

  const renderBasicFilter = (filter: BasicFilter, index: number) => {
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={getFieldOptions(filter.type)}
              value={filter.field}
              onChange={(v) => updateFilter(filter.id, { field: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={getOperatorOptions(filter)}
              value={filter.operator}
              onChange={(v) => updateFilter(filter.id, { operator: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Value" labelWidth={10}>
            <Input
              value={filter.value as string}
              onChange={(e) => updateFilter(filter.id, { value: e.currentTarget.value })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>
      </div>
    );
  };

  const renderMeasurementFilter = (filter: MeasurementFilter, index: number) => {
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={MEASUREMENT_FIELDS}
              value={filter.field}
              onChange={(v) => updateFilter(filter.id, { field: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={COMPARISON_OPERATORS}
              value={filter.operator}
              onChange={(v) => updateFilter(filter.id, { operator: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Value" labelWidth={10}>
            <Input
              value={filter.value as string}
              onChange={(e) => updateFilter(filter.id, { value: e.currentTarget.value })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>
      </div>
    );
  };

  const renderSpatialFilter = (filter: SpatialFilter, index: number) => {
    const rings = filter.geometryType === 'Polygon' ? filter.rings || [{ coordinates: [] }] : [];
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={getFieldOptions(filter.type)}
              value={filter.field}
              onChange={(v) => updateFilter(filter.id, { field: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={SPATIAL_OPERATORS}
              value={filter.operator}
              onChange={(v) => {
                if (v.value === 'st_within' && filter.geometryType !== 'Polygon') {
                  const defaultRing: [number, number][] = [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                  ];
                  updateFilter(filter.id, {
                    operator: v.value!,
                    geometryType: 'Polygon',
                    coordinates: [defaultRing],
                    rings: [{ coordinates: defaultRing }],
                  } as Partial<SpatialFilter>);
                  return;
                }
                updateFilter(filter.id, { operator: v.value! });
              }}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Type" labelWidth={10}>
            <Select
              options={
                filter.operator === 'st_intersects'
                  ? GEOMETRY_TYPES
                  : GEOMETRY_TYPES.filter((g) => g.value === 'Polygon')
              }
              value={filter.geometryType}
              onChange={(v) => {
                // Reset coordinates to valid defaults based on the selected geometry type
                let defaultCoordinates;
                let defaultRings;
                switch (v.value) {
                  case 'Point':
                    defaultCoordinates = [0, 0];
                    defaultRings = undefined;
                    break;
                  case 'LineString':
                    defaultCoordinates = [
                      [0, 0],
                      [1, 1],
                    ];
                    defaultRings = undefined;
                    break;
                  case 'Polygon':
                    const defaultRing: [number, number][] = [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 0],
                    ];
                    defaultCoordinates = [
                      defaultRing,
                    ];
                    defaultRings = [{ coordinates: defaultRing }];
                    break;
                  default:
                    defaultCoordinates = [0, 0];
                    defaultRings = undefined;
                }
                updateFilter(filter.id, {
                  geometryType: v.value! as any,
                  coordinates: defaultCoordinates,
                  rings: defaultRings,
                } as Partial<SpatialFilter>);
              }}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>
        <div className={styles.mapSection}>
          <label className={styles.mapLabel}>
            Interactive Map - Click to draw the geometry
          </label>
          <div className={styles.mapContainer}>
            <MapWithTerraDraw
              geometryType={filter.geometryType}
              onCoordinatesChange={(coords) => {
                if (filter.geometryType === 'Point') {
                  updateFilter(filter.id, { coordinates: coords } as Partial<SpatialFilter>);
                } else if (filter.geometryType === 'Polygon') {
                  const newRings: PolygonCoordinates[] = [{ coordinates: coords }];
                  updateFilter(filter.id, {
                    rings: newRings,
                    coordinates: [coords],
                  } as Partial<SpatialFilter>);
                } else if (filter.geometryType === 'LineString') {
                  updateFilter(filter.id, { coordinates: coords } as Partial<SpatialFilter>);
                }
              }}
              initialCoordinates={filter.coordinates}
            />
          </div>
        </div>
        {filter.geometryType === 'Polygon' && (
          <>
            {rings.map((ring, ringIndex) => (
              <div
                key={ringIndex}
                className={styles.coordinateRing}
              >
                <InlineFieldRow>
                  <InlineField
                    label="Coordinates"
                    labelWidth={15}
                    tooltip="Enter coordinates as: x1,y1, x2,y2, ..., xn,yn"
                  >
                    <TextArea
                      value={ring.coordinates.map((coord) => `${coord[0]},${coord[1]}`).join(', ')}
                      onChange={(e) => {
                        const coordString = e.currentTarget.value;
                        const parsedCoords = parseCoordinateString(coordString);
                        if (coordString.trim() && parsedCoords.length < 3) {
                          setCoordinateError(filter.id, 'Polygon coordinates need at least three points.');
                          return;
                        }
                        const closedCoords = ensureClosedRing(parsedCoords);
                        const newRings = [...rings];
                        newRings[ringIndex] = { coordinates: closedCoords };
                        const geoJsonCoords = newRings.map((r) => r.coordinates);
                        updateFilter(filter.id, {
                          rings: newRings,
                          coordinates: geoJsonCoords,
                        } as Partial<SpatialFilter>);
                        clearCoordinateError(filter.id);
                      }}
                      rows={3}
                      placeholder="0,0, 1,0, 1,1, 0,1"
                    />
                  </InlineField>
                </InlineFieldRow>
                {coordinateErrors[filter.id] && (
                  <div className={styles.validationMessage}>{coordinateErrors[filter.id]}</div>
                )}
              </div>
            ))}
          </>
        )}
        {filter.geometryType !== 'Polygon' && (
          <InlineFieldRow>
            <InlineField
              label="Coordinates"
              labelWidth={10}
              tooltip={
                filter.geometryType === 'Point'
                  ? 'Enter as [longitude, latitude]'
                  : 'Enter as array of points [[lon1, lat1], [lon2, lat2], ...]'
              }
            >
              <TextArea
                value={JSON.stringify(filter.coordinates)}
                onChange={(e) => {
                  try {
                    const coords = JSON.parse(e.currentTarget.value);
                    if (
                      filter.geometryType === 'Point' &&
                      (!Array.isArray(coords) || coords.length !== 2 || coords.some((coord) => typeof coord !== 'number'))
                    ) {
                      setCoordinateError(filter.id, 'Point coordinates must be [longitude, latitude].');
                      return;
                    }
                    if (
                      filter.geometryType === 'LineString' &&
                      (!Array.isArray(coords) ||
                        coords.length < 2 ||
                        coords.some(
                          (coord) =>
                            !Array.isArray(coord) ||
                            coord.length !== 2 ||
                            coord.some((value) => typeof value !== 'number')
                        ))
                    ) {
                      setCoordinateError(filter.id, 'LineString coordinates must be [[lon1, lat1], [lon2, lat2], ...].');
                      return;
                    }
                    clearCoordinateError(filter.id);
                    updateFilter(filter.id, { coordinates: coords } as Partial<SpatialFilter>);
                  } catch (error) {
                    setCoordinateError(filter.id, 'Coordinates must be valid JSON.');
                  }
                }}
                rows={3}
                placeholder={filter.geometryType === 'Point' ? '[0, 0]' : '[[0, 0], [1, 1]]'}
              />
            </InlineField>
          </InlineFieldRow>
        )}
        {filter.geometryType !== 'Polygon' && coordinateErrors[filter.id] && (
          <div className={styles.validationMessage}>{coordinateErrors[filter.id]}</div>
        )}
      </div>
    );
  };

  const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toISOString().slice(0, 16);
    } catch (e) {
      console.error('Invalid date format:', dateString);
      return '';
    }
  };

  const renderObservationFilter = (filter: ObservationFilter, index: number) => {
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={OBSERVATION_FIELDS}
              value={filter.field}
              onChange={(v) => {
                const newValue = v.value === 'result' ? '0' : new Date().toISOString();
                updateFilter(filter.id, { field: v.value!, value: newValue });
              }}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={COMPARISON_OPERATORS}
              value={filter.operator}
              onChange={(v) => updateFilter(filter.id, { operator: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Value" labelWidth={10}>
            {filter.field === 'result' ? (
              <Input
                value={filter.value as string}
                onChange={(e) => updateFilter(filter.id, { value: e.currentTarget.value })}
                width={20}
              />
            ) : (
              <Input
                type="datetime-local"
                value={formatDateForInput(filter.value as string)}
                onChange={(e) => {
                  try {
                    const date = new Date(e.currentTarget.value);
                    updateFilter(filter.id, { value: date.toISOString() });
                  } catch (error) {
                    console.error('Invalid date input:', error);
                  }
                }}
                width={20}
              />
            )}
          </InlineField>
        </InlineFieldRow>
      </div>
    );
  };

  const renderEntityFilter = (filter: EntityFilter, index: number) => {
    const availableEntities = getAvailableEntityFilterOptions(entityType);

    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Related Entity" labelWidth={10}>
            <Select
              options={availableEntities}
              value={filter.entity}
              onChange={(v) => updateFilter(filter.id, { entity: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Field" labelWidth={10}>
            <Select
              options={getFieldOptions(filter.type)}
              value={filter.field}
              onChange={(v) => updateFilter(filter.id, { field: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={
                filter.field === '@iot.id' ? COMPARISON_OPERATORS : [...COMPARISON_OPERATORS, ...STRING_OPERATORS]
              }
              value={filter.operator}
              onChange={(v) => updateFilter(filter.id, { operator: v.value! })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>

        <InlineFieldRow>
          <InlineField label="Value" labelWidth={10}>
            <Input
              value={filter.value as string}
              onChange={(e) => updateFilter(filter.id, { value: e.currentTarget.value })}
              width={20}
            />
          </InlineField>
        </InlineFieldRow>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h5>Filters</h5>
        <div>
          <Button variant="secondary" size="sm" onClick={clearAllFilters} disabled={filters.length === 0}>
            Clear All
          </Button>
          {!showAddFilter && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddFilter(true)}
              icon="plus"
              className={styles.addButton}
            >
              Add Filter
            </Button>
          )}
        </div>
      </div>

      {showAddFilter && (
        <FieldSet label="New Filter">
          <InlineFieldRow>
            <InlineField label="Filter Type" labelWidth={10}>
              <Select
                options={getPossibleFilters(entityType)}
                value={newFilterType}
                onChange={(v) => setNewFilterType(v.value!)}
                width={20}
              />
            </InlineField>
          </InlineFieldRow>
          <div className={styles.buttonRow}>
            <Button variant="secondary" size="sm" onClick={() => setShowAddFilter(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={addFilter}>
              Add
            </Button>
          </div>
        </FieldSet>
      )}

      {filters.filter((f) => f.type !== 'variable').length === 0 ? (
        <div className={styles.emptyState}>No filters applied. Click "Add Filter" to create one.</div>
      ) : (
        <div className={styles.filterList}>
          {filters
            .filter((f) => f.type !== 'variable')
            .map((filter, index) => (
              <FieldSet
                key={filter.id}
                label={`${filter.type.charAt(0).toUpperCase() + filter.type.slice(1)} Filter`}
                className={styles.filterItem}
              >
                <div className={styles.filterSummary}>{summarizeFilter(filter)}</div>
                {renderFilterForm(filter, index)}
                <div className={styles.filterActions}>
                  <Button variant="destructive" size="sm" onClick={() => removeFilter(filter.id)} icon="trash-alt">
                    Remove
                  </Button>
                </div>
              </FieldSet>
            ))}
        </div>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css`
      margin-top: ${theme.spacing(2)};
    `,
    header: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: ${theme.spacing(1)};
    `,
    addButton: css`
      margin-left: ${theme.spacing(1)};
    `,
    emptyState: css`
      padding: ${theme.spacing(2)};
      text-align: center;
      background-color: ${theme.colors.background.secondary};
      border-radius: ${theme.shape.borderRadius()};
      color: ${theme.colors.text.secondary};
    `,
    filterList: css`
      display: flex;
      flex-direction: column;
      gap: ${theme.spacing(2)};
    `,
    filterItem: css`
      border: 1px solid ${theme.colors.border.medium};
      border-radius: ${theme.shape.borderRadius()};
      background-color: ${theme.colors.background.secondary};
    `,
    filterSummary: css`
      color: ${theme.colors.text.secondary};
      font-family: monospace;
      font-size: ${theme.typography.bodySmall.fontSize};
      margin-bottom: ${theme.spacing(1)};
      overflow-wrap: anywhere;
    `,
    filterForm: css`
      padding: ${theme.spacing(1)} 0;
    `,
    mapSection: css`
      margin: ${theme.spacing(2)} 0;
    `,
    mapLabel: css`
      color: ${theme.colors.text.secondary};
      display: block;
      font-size: ${theme.typography.bodySmall.fontSize};
      font-weight: 500;
      margin-bottom: ${theme.spacing(1)};
    `,
    mapContainer: css`
      width: 100%;
      min-width: 0;
    `,
    coordinateRing: css`
      margin-left: ${theme.spacing(2)};
      margin-bottom: ${theme.spacing(1)};
      padding: ${theme.spacing(1)};
      border: 1px solid ${theme.colors.border.medium};
      border-radius: ${theme.shape.borderRadius()};
    `,
    filterActions: css`
      display: flex;
      justify-content: flex-end;
      gap: ${theme.spacing(1)};
      margin-top: ${theme.spacing(1)};
    `,
    buttonRow: css`
      display: flex;
      justify-content: flex-end;
      gap: ${theme.spacing(1)};
      margin-top: ${theme.spacing(1)};
    `,
    validationMessage: css`
      color: ${theme.colors.error.text};
      font-size: ${theme.typography.bodySmall.fontSize};
      margin-top: ${theme.spacing(0.5)};
    `,
  };
};
