import React, { useState } from 'react';
import { Button, InlineField, InlineFieldRow, Input, Select, TextArea, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { v4 as uuidv4 } from 'uuid';
import {
  FilterCondition,
  FilterGroup,
  FilterType,
  TemporalFilter,
  SpatialFilter,
  EntityType,
  PolygonCoordinates,
} from '../types';
import {
  COMMON_FIELDS,
  OBSERVATION_FIELDS,
  COMPARISON_OPERATORS,
  STRING_OPERATORS,
  SPATIAL_OPERATORS,
  TEMPORAL_FUNCTIONS,
  GEOMETRY_TYPES,
  MEASUREMENT_FIELDS,
  TEMPORAL_FIELDS,
} from '../utils/constants';
import { ensureClosedRing, parseCoordinateString, getSingularEntityName } from '../utils/utils';
import { normalizeFilterGroup, updateFilterGroup, groupFilterIds } from '../utils/filterGroups';
import { MapWithTerraDraw } from './MapWithTerraDraw';

interface FilterPanelProps {
  entityType: EntityType;
  filters: FilterCondition[];
  filterGroup?: FilterGroup;
  observationFilterGroup?: FilterGroup;
  onFiltersChange: (
    filters: FilterCondition[],
    filterGroup?: FilterGroup,
    observationFilterGroup?: FilterGroup
  ) => void;
}

type FieldChoice = SelectableValue<string> & { type: FilterType; field: string; entity?: EntityType };
const fieldKey = (filter: Pick<FilterCondition, 'type' | 'entity' | 'field'>) =>
  `${filter.type}:${filter.entity || ''}:${filter.field}`;
const matchOptions = [
  { label: 'All conditions (AND)', value: 'and' as const },
  { label: 'Any condition (OR)', value: 'or' as const },
];
const dateValue = (value: unknown) => {
  if (!value) {
    return '';
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
  entityType,
  filters,
  filterGroup,
  observationFilterGroup,
  onFiltersChange,
}) => {
  const styles = useStyles2(getStyles);
  const [coordinateErrors, setCoordinateErrors] = useState<Record<string, string>>({});
  const isObservationScope = (filter: FilterCondition) => entityType === 'Datastreams' && filter.type === 'observation';
  const visible = filters.filter((filter) => filter.type !== 'variable');
  const main = normalizeFilterGroup(
    visible.filter((filter) => !isObservationScope(filter)),
    filterGroup
  );
  const observations = normalizeFilterGroup(visible.filter(isObservationScope), observationFilterGroup);

  const fieldChoices = (observationScope: boolean): FieldChoice[] => {
    const choices: FieldChoice[] = [];
    const add = (fields: Array<SelectableValue<string>>, type: FilterType, entity?: EntityType) => {
      fields.forEach((field) => {
        const choice = { type, field: field.value!, entity };
        choices.push({
          ...choice,
          value: fieldKey(choice),
          label: `${entity ? getSingularEntityName(entity) + ' → ' : ''}${field.label}`,
        });
      });
    };
    if (observationScope) {
      add(OBSERVATION_FIELDS, 'observation');
      return choices;
    }
    if (entityType === 'Observations') {
      add(OBSERVATION_FIELDS, 'observation');
      add(COMMON_FIELDS, 'entity', 'Datastreams');
    } else {
      add(COMMON_FIELDS, 'basic');
      if (entityType === 'Datastreams') {
        add(MEASUREMENT_FIELDS, 'measurement');
        add(TEMPORAL_FIELDS, 'temporal');
        add([{ label: 'Observed area', value: 'observedArea' }], 'spatial');
        (['Things', 'Sensors', 'ObservedProperties'] as EntityType[]).forEach((entity) =>
          add(COMMON_FIELDS, 'entity', entity)
        );
      }
      if (entityType === 'Locations' || entityType === 'HistoricalLocations') {
        add([{ label: 'Location', value: 'location' }], 'spatial');
        add(COMMON_FIELDS, 'entity', 'Things');
      }
    }
    return choices;
  };

  const newCondition = (choice: FieldChoice, id = uuidv4()): FilterCondition => {
    const base: FilterCondition = {
      id,
      type: choice.type,
      field: choice.field,
      entity: choice.entity,
      operator: 'eq',
      value: '',
    };
    if (choice.type === 'temporal') {
      return {
        ...base,
        operator: 'ge',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      } as TemporalFilter;
    }
    if (choice.type === 'spatial') {
      const ring: Array<[number, number]> = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ];
      return {
        ...base,
        operator: 'st_within',
        geometryType: 'Polygon',
        coordinates: [ring],
        rings: [{ coordinates: ring }],
      } as SpatialFilter;
    }
    if (choice.type === 'observation') {
      base.value = choice.field === 'result' ? '0' : new Date().toISOString();
    }
    return base;
  };
  const commitGroup = (root: FilterGroup, observationScope: boolean, nextFilters = filters) => {
    onFiltersChange(nextFilters, observationScope ? main : root, observationScope ? root : observations);
  };
  const updateFilter = (id: string, updates: Partial<FilterCondition>) => {
    onFiltersChange(
      filters.map((filter) => (filter.id === id ? { ...filter, ...updates } : filter)),
      main,
      observations
    );
  };
  const setCoordinateError = (id: string, message: string) =>
    setCoordinateErrors((current) => ({ ...current, [id]: message }));
  const clearCoordinateError = (id: string) =>
    setCoordinateErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

  const renderRule = (filter: FilterCondition, observationScope: boolean) => {
    const choices = fieldChoices(observationScope);
    if (!choices.some((choice) => choice.value === fieldKey(filter))) {
      choices.push({
        value: fieldKey(filter),
        label: filter.field,
        type: filter.type,
        field: filter.field,
        entity: filter.entity,
      });
    }
    const temporal = filter as TemporalFilter;
    const isRange =
      filter.type === 'temporal' && !TEMPORAL_FUNCTIONS.some((option) => option.value === filter.operator);
    const isDate = filter.type === 'observation' && ['phenomenonTime', 'resultTime'].includes(filter.field);
    const textField = !['@iot.id', 'id', 'result', 'phenomenonTime', 'resultTime'].includes(filter.field);
    const operators =
      filter.type === 'temporal'
        ? [
            { label: 'Between', value: 'range' },
            ...TEMPORAL_FUNCTIONS.map((option) => ({ ...option, label: `${option.label} equals` })),
          ]
        : [
            ...COMPARISON_OPERATORS,
            ...(textField
              ? STRING_OPERATORS.map((option) => ({
                  ...option,
                  label: option.value === 'substringof' ? 'Contains' : option.label,
                }))
              : []),
          ];
    const updateDate = (value: string, key?: 'startDate' | 'endDate') => {
      const date = value ? new Date(`${value}Z`).toISOString() : '';
      updateFilter(filter.id, key ? { [key]: date } : { value: date });
    };
    return (
      <div key={filter.id} className={styles.rule}>
        <div className={styles.ruleRow}>
          <InlineField label="Field">
            <Select
              aria-label="Field"
              options={choices}
              value={fieldKey(filter)}
              width={27}
              onChange={(option) => {
                const choice = choices.find((item) => item.value === option.value);
                if (choice) {
                  onFiltersChange(
                    filters.map((item) => (item.id === filter.id ? newCondition(choice, item.id) : item)),
                    main,
                    observations
                  );
                  clearCoordinateError(filter.id);
                }
              }}
            />
          </InlineField>
          {filter.type !== 'spatial' && (
            <>
              <InlineField label="Operator">
                <Select
                  aria-label="Operator"
                  options={operators}
                  value={isRange ? 'range' : filter.operator}
                  width={25}
                  onChange={(option) => {
                    if (filter.type === 'temporal') {
                      updateFilter(
                        filter.id,
                        option.value === 'range'
                          ? ({
                              operator: 'ge',
                              startDate: temporal.startDate || new Date().toISOString(),
                              endDate: temporal.endDate || new Date().toISOString(),
                            } as Partial<TemporalFilter>)
                          : ({
                              operator: option.value,
                              value: '',
                              startDate: undefined,
                              endDate: undefined,
                            } as Partial<TemporalFilter>)
                      );
                    } else {
                      updateFilter(filter.id, { operator: option.value as FilterCondition['operator'] });
                    }
                  }}
                />
              </InlineField>
              {isRange ? (
                <>
                  <InlineField label="From (UTC)">
                    <Input
                      aria-label="From (UTC)"
                      type="datetime-local"
                      value={dateValue(temporal.startDate)}
                      onChange={(event) => updateDate(event.currentTarget.value, 'startDate')}
                    />
                  </InlineField>
                  <InlineField label="To (UTC)">
                    <Input
                      aria-label="To (UTC)"
                      type="datetime-local"
                      value={dateValue(temporal.endDate)}
                      onChange={(event) => updateDate(event.currentTarget.value, 'endDate')}
                    />
                  </InlineField>
                </>
              ) : (
                <InlineField label={isDate ? 'Value (UTC)' : 'Value'}>
                  <Input
                    aria-label={isDate ? 'Value (UTC)' : 'Value'}
                    type={isDate ? 'datetime-local' : 'text'}
                    value={isDate ? dateValue(filter.value) : String(filter.value ?? '')}
                    placeholder={textField ? 'Enter a value or $variable' : 'Enter a number or $variable'}
                    onChange={(event) =>
                      isDate
                        ? updateDate(event.currentTarget.value)
                        : updateFilter(filter.id, { value: event.currentTarget.value })
                    }
                  />
                </InlineField>
              )}
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon="trash-alt"
            aria-label="Remove condition"
            title="Remove condition"
            onClick={() => {
              const next = filters.filter((item) => item.id !== filter.id);
              onFiltersChange(
                next,
                normalizeFilterGroup(
                  next.filter((item) => item.type !== 'variable' && !isObservationScope(item)),
                  main
                ),
                normalizeFilterGroup(next.filter(isObservationScope), observations)
              );
              clearCoordinateError(filter.id);
            }}
          >
            Remove
          </Button>
        </div>
        {isRange &&
          temporal.startDate &&
          temporal.endDate &&
          new Date(temporal.startDate) > new Date(temporal.endDate) && (
            <div role="alert" className={styles.validationMessage}>
              Start date must be before end date.
            </div>
          )}
        {filter.type === 'spatial' && renderSpatialFilter(filter as SpatialFilter)}
      </div>
    );
  };

  const renderGroup = (
    group: FilterGroup,
    root: FilterGroup,
    observationScope: boolean,
    nested = false
  ): React.ReactNode => {
    const change = (update: (node: FilterGroup) => FilterGroup, nextFilters = filters) =>
      commitGroup(updateFilterGroup(root, group.id, update), observationScope, nextFilters);
    return (
      <div
        key={group.id}
        className={styles.group}
        role="group"
        aria-label={
          nested ? 'Condition group' : observationScope ? 'Expanded observation conditions' : 'Filter conditions'
        }
      >
        <div className={styles.groupHeader}>
          <InlineField label="Match">
            <Select
              aria-label="Match"
              options={matchOptions}
              value={group.combinator}
              width={27}
              onChange={(option) => change((node) => ({ ...node, combinator: option.value! }))}
            />
          </InlineField>
          {nested && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const removed = new Set(groupFilterIds(group));
                const remove = (node: FilterGroup): FilterGroup => ({
                  ...node,
                  groups: node.groups.filter((child) => child.id !== group.id).map(remove),
                });
                commitGroup(
                  remove(root),
                  observationScope,
                  filters.filter((filter) => !removed.has(filter.id))
                );
              }}
            >
              Remove group
            </Button>
          )}
        </div>
        {!group.filterIds.length && !group.groups.length && (
          <p className={styles.hint}>Add a condition to choose which records to include.</p>
        )}
        {group.filterIds.map((id, index) => {
          const filter = filters.find((item) => item.id === id);
          return (
            filter && (
              <React.Fragment key={id}>
                {index > 0 && <div className={styles.connector}>{group.combinator.toUpperCase()}</div>}
                {renderRule(filter, observationScope)}
              </React.Fragment>
            )
          );
        })}
        {group.groups.map((child, index) => (
          <React.Fragment key={child.id}>
            {(group.filterIds.length > 0 || index > 0) && (
              <div className={styles.connector}>{group.combinator.toUpperCase()}</div>
            )}
            {renderGroup(child, root, observationScope, true)}
          </React.Fragment>
        ))}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => {
              const filter = newCondition(fieldChoices(observationScope)[0]);
              change((node) => ({ ...node, filterIds: [...node.filterIds, filter.id] }), [...filters, filter]);
            }}
          >
            Add condition
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() =>
              change((node) => ({
                ...node,
                groups: [
                  ...node.groups,
                  { id: uuidv4(), combinator: node.combinator === 'and' ? 'or' : 'and', filterIds: [], groups: [] },
                ],
              }))
            }
          >
            Add group
          </Button>
        </div>
      </div>
    );
  };

  const summarizeGroup = (group: FilterGroup): string => {
    const parts = group.filterIds
      .map((id) => {
        const filter = filters.find((item) => item.id === id);
        if (!filter) {
          return '';
        }
        const field =
          [...fieldChoices(false), ...fieldChoices(true)].find((choice) => choice.value === fieldKey(filter))?.label ||
          filter.field;
        if (filter.type === 'spatial') {
          return `${field} ${
            SPATIAL_OPERATORS.find((option) => option.value === filter.operator)?.label?.toLowerCase() ||
            filter.operator
          } drawn geometry`;
        }
        const temporal = filter as TemporalFilter;
        if (filter.type === 'temporal' && temporal.startDate && temporal.endDate) {
          return `${field} between ${temporal.startDate} and ${temporal.endDate}`;
        }
        const operator =
          [...COMPARISON_OPERATORS, ...STRING_OPERATORS, ...TEMPORAL_FUNCTIONS].find(
            (option) => option.value === filter.operator
          )?.label || filter.operator;
        return `${field} ${filter.operator === 'substringof' ? 'contains' : operator.toLowerCase()} ${JSON.stringify(
          filter.value ?? ''
        )}`;
      })
      .filter(Boolean);
    parts.push(...group.groups.map(summarizeGroup).filter(Boolean));
    return parts.length ? `(${parts.join(` ${group.combinator.toUpperCase()} `)})` : '';
  };
  const renderSpatialFilter = (filter: SpatialFilter) => {
    const rings = filter.geometryType === 'Polygon' ? filter.rings || [{ coordinates: [] }] : [];
    return (
      <div className={styles.filterForm}>
        <InlineFieldRow>
          <InlineField label="Operator" labelWidth={10}>
            <Select
              options={SPATIAL_OPERATORS}
              value={filter.operator}
              onChange={(v) => {
                if (v.value === 'st_within' && filter.geometryType !== 'Polygon') {
                  const defaultRing: Array<[number, number]> = [
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
                    const defaultRing: Array<[number, number]> = [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 0],
                    ];
                    defaultCoordinates = [defaultRing];
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
          <label className={styles.mapLabel}>Interactive Map - Click to draw the geometry</label>
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
              <div key={ringIndex} className={styles.coordinateRing}>
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
                      (!Array.isArray(coords) ||
                        coords.length !== 2 ||
                        coords.some((coord) => typeof coord !== 'number'))
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
                      setCoordinateError(
                        filter.id,
                        'LineString coordinates must be [[lon1, lat1], [lon2, lat2], ...].'
                      );
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.hint}>Choose fields and match all or any conditions. Use groups to combine both.</p>
        <Button
          variant="secondary"
          size="sm"
          disabled={!visible.length && !main.groups.length && !observations.groups.length}
          onClick={() => {
            setCoordinateErrors({});
            onFiltersChange(
              filters.filter((filter) => filter.type === 'variable'),
              undefined,
              undefined
            );
          }}
        >
          Clear all
        </Button>
      </div>
      {renderGroup(main, main, false)}
      {summarizeGroup(main) && (
        <div className={styles.preview} aria-label="Filter summary">
          {summarizeGroup(main)}
        </div>
      )}
      {entityType === 'Datastreams' && (
        <>
          <h6 className={styles.scopeTitle}>Expanded observations</h6>
          <p className={styles.hint}>These conditions filter the observations included with each datastream.</p>
          {renderGroup(observations, observations, true)}
          {summarizeGroup(observations) && (
            <div className={styles.preview} aria-label="Observation filter summary">
              {summarizeGroup(observations)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    margin-top: ${theme.spacing(1)};
    min-width: 0;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(2)};
    margin-bottom: ${theme.spacing(1)};
  `,
  hint: css`
    color: ${theme.colors.text.secondary};
    margin: ${theme.spacing(1)} 0;
  `,
  group: css`
    border-left: 3px solid ${theme.colors.border.strong};
    border-radius: ${theme.shape.borderRadius()};
    background: ${theme.colors.background.secondary};
    padding: ${theme.spacing(1.5)};
    margin-top: ${theme.spacing(1)};
    min-width: 0;
  `,
  groupHeader: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(1)};
  `,
  rule: css`
    min-width: 0;
  `,
  ruleRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(0.5)};
    align-items: center;
    > * {
      max-width: 100%;
    }
  `,
  connector: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: 600;
    padding: ${theme.spacing(0.5)} 0;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(1.5)};
  `,
  preview: css`
    color: ${theme.colors.text.secondary};
    overflow-wrap: anywhere;
    padding: ${theme.spacing(1)} 0;
  `,
  scopeTitle: css`
    margin: ${theme.spacing(3)} 0 ${theme.spacing(0.5)};
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
    margin-bottom: ${theme.spacing(1)};
  `,
  mapContainer: css`
    width: 100%;
    min-width: 0;
  `,
  coordinateRing: css`
    margin: ${theme.spacing(1)} 0;
    padding: ${theme.spacing(1)};
    border: 1px solid ${theme.colors.border.medium};
  `,
  validationMessage: css`
    color: ${theme.colors.error.text};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-top: ${theme.spacing(0.5)};
  `,
});
