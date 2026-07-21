import React, { ChangeEvent, useState } from 'react';
import {
  InlineField,
  Input,
  Select,
  InlineFieldRow,
  FieldSet,
  MultiSelect,
  Button,
  useStyles2,
  Collapse,
  Alert,
} from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, IstSOS4Query, EntityType, ExpandOption, FilterCondition } from '../types';
import { buildEntityResourcePath, buildODataQuery } from '../queryBuilder';
import { FilterPanel } from './FilterPanel';
import { ENTITY_OPTIONS, RESULT_FORMAT_OPTIONS } from '../utils/constants';
import { compareEntityNames, getStyles, getExpandOptions } from '../utils/utils';

type Props = QueryEditorProps<DataSource, IstSOS4Query, MyDataSourceOptions>;

const FOLLOW_NEXT_LINK_OPTIONS: Array<SelectableValue<boolean>> = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

const TIME_RANGE_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Disabled', value: '' },
  { label: 'phenomenonTime', value: 'phenomenonTime' },
  { label: 'resultTime', value: 'resultTime' },
];

const OBSERVATION_ORDER_BY_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Disabled', value: '' },
  { label: 'phenomenonTime asc', value: 'phenomenonTime:asc' },
  { label: 'phenomenonTime desc', value: 'phenomenonTime:desc' },
  { label: 'result asc', value: 'result:asc' },
  { label: 'result desc', value: 'result:desc' },
];

type ExpandSubQuery = NonNullable<ExpandOption['subQuery']>;

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const [showFilters, setShowFilters] = useState(false);

  const styles = useStyles2(getStyles);

  const expandOptions = getExpandOptions(query.entity);
  const useGrafanaTimeRange = query.useGrafanaTimeRange ?? true;

  const currentQuery: IstSOS4Query = {
    ...query,
    entity: query.entity || 'Things',
    count: query.count || false,
    resultFormat: query.resultFormat || 'default',
    filters: query.filters || [],
    followNextLink: query.followNextLink ?? true,
    useGrafanaTimeRange,
    grafanaTimeRangeField: useGrafanaTimeRange
      ? query.grafanaTimeRangeField || 'phenomenonTime'
      : query.grafanaTimeRangeField,
  };

  const onEntityChange = (value: SelectableValue<EntityType>) => {
    const newQuery = { ...currentQuery, entity: value.value!, entityId: undefined };

    if (value.value === 'HistoricalLocations') {
      newQuery.expand = newQuery.expand || [];
      if (!newQuery.expand.some((exp) => exp.entity === 'Locations')) {
        newQuery.expand.push({ entity: 'Locations' });
      }
    }
    onChange(newQuery);
  };

  const onEntityIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    const parsedValue = Number(value);
    let entityId: number | string | undefined;

    if (value) {
      entityId = Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : value;
    }

    onChange({
      ...currentQuery,
      entityId,
    });
  };

  const onSelectChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange({
      ...currentQuery,
      select: value ? value.split(',').map((s) => s.trim()) : undefined,
    });
  };

  const onTopChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const parsedValue = parseInt(value, 10);
    onChange({
      ...currentQuery,
      top: value && !isNaN(parsedValue) ? parsedValue : undefined,
    });
  };

  const onSkipChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const parsedValue = parseInt(value, 10);
    onChange({
      ...currentQuery,
      skip: value && !isNaN(parsedValue) ? parsedValue : undefined,
    });
  };

  const onResultFormatChange = (value: SelectableValue<string>) => {
    onChange({ ...currentQuery, resultFormat: value.value as 'default' | 'dataArray' });
  };

  const onFollowNextLinkChange = (value: SelectableValue<boolean>) => {
    onChange({ ...currentQuery, followNextLink: value.value ?? true });
  };

  const onGrafanaTimeRangeChange = (value: SelectableValue<string>) => {
    if (!value.value) {
      onChange({
        ...currentQuery,
        useGrafanaTimeRange: false,
        grafanaTimeRangeField: undefined,
      });
      return;
    }

    onChange({
      ...currentQuery,
      useGrafanaTimeRange: true,
      grafanaTimeRangeField: value.value as 'phenomenonTime' | 'resultTime',
    });
  };

  const onOrderByChange = (value: SelectableValue<string>) => {
    const remainingOrderBy = (currentQuery.orderby || []).filter(
      (order) => order.property !== 'phenomenonTime' && order.property !== 'result'
    );
    const [property, rawDirection] = (value.value || '').split(':');
    const isSupportedProperty = property === 'phenomenonTime' || property === 'result';
    const direction = rawDirection === 'asc' || rawDirection === 'desc' ? rawDirection : undefined;

    onChange({
      ...currentQuery,
      orderby:
        isSupportedProperty && direction
          ? [...remainingOrderBy, { property, direction }]
          : remainingOrderBy.length > 0
          ? remainingOrderBy
          : undefined,
    });
  };

  const onAliasChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...currentQuery, alias: event.target.value });
  };

  const onCustomQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...currentQuery, expression: event.target.value });
  };

  const onExpandChange = (values: Array<SelectableValue<EntityType>>) => {
    const hadObservations = currentQuery.expand?.some((expand) => expand.entity === 'Observations') ?? false;
    const expandOptions: ExpandOption[] = values.map((value) => {
      const existing = currentQuery.expand?.find((expand) => expand.entity === value.value);
      if (existing) {
        return existing;
      }
      if (value.value === 'Observations') {
        return {
          entity: value.value,
          subQuery: {
            useGrafanaTimeRange: true,
            grafanaTimeRangeField: 'phenomenonTime',
          },
        };
      }
      return { entity: value.value! };
    });
    const addedObservations = !hadObservations && expandOptions.some((expand) => expand.entity === 'Observations');
    onChange({
      ...currentQuery,
      expand: expandOptions.length > 0 ? expandOptions : undefined,
      useGrafanaTimeRange: addedObservations ? false : currentQuery.useGrafanaTimeRange,
      grafanaTimeRangeField: addedObservations ? undefined : currentQuery.grafanaTimeRangeField,
    });
  };

  const updateObservationsExpandSubQuery = (patch: Partial<ExpandSubQuery>) => {
    const expand = currentQuery.expand?.map((option) => {
      if (option.entity !== 'Observations') {
        return option;
      }
      const subQuery: ExpandSubQuery = { ...option.subQuery, ...patch };
      for (const key of Object.keys(subQuery) as Array<keyof ExpandSubQuery>) {
        const value = subQuery[key];
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
          delete subQuery[key];
        }
      }
      return { ...option, subQuery: Object.keys(subQuery).length > 0 ? subQuery : undefined };
    });
    onChange({ ...currentQuery, expand });
  };

  const onExpandTimeRangeChange = (value: SelectableValue<string>) => {
    updateObservationsExpandSubQuery({
      useGrafanaTimeRange: !!value.value,
      grafanaTimeRangeField: value.value ? (value.value as 'phenomenonTime' | 'resultTime') : undefined,
    });
  };

  const onExpandOrderByChange = (value: SelectableValue<string>) => {
    const observationsExpand = currentQuery.expand?.find((option) => option.entity === 'Observations');
    const remainingOrderBy = (observationsExpand?.subQuery?.orderby || []).filter(
      (order) => order.property !== 'phenomenonTime' && order.property !== 'result'
    );
    const [property, rawDirection] = (value.value || '').split(':');
    const isSupportedProperty = property === 'phenomenonTime' || property === 'result';
    const direction = rawDirection === 'asc' || rawDirection === 'desc' ? rawDirection : undefined;
    updateObservationsExpandSubQuery({
      orderby:
        isSupportedProperty && direction
          ? [...remainingOrderBy, { property, direction }]
          : remainingOrderBy.length > 0
          ? remainingOrderBy
          : undefined,
    });
  };

  const onExpandSelectChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    updateObservationsExpandSubQuery({
      select: value
        ? value
            .split(',')
            .map((property) => property.trim())
            .filter(Boolean)
        : undefined,
    });
  };

  const onExpandTopChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const parsedValue = parseInt(value, 10);
    updateObservationsExpandSubQuery({ top: value && !isNaN(parsedValue) ? parsedValue : undefined });
  };

  const onExpandSkipChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const parsedValue = parseInt(value, 10);
    updateObservationsExpandSubQuery({ skip: value && !isNaN(parsedValue) ? parsedValue : undefined });
  };

  const onFiltersChange = (filters: FilterCondition[]) => {
    const currentFilters = currentQuery.filters || [];
    const hadObservationFilters = currentFilters.some((f) => f.type === 'observation');
    const hasObservationFilters = filters.some((f) => f.type === 'observation');
    if (hadObservationFilters && !hasObservationFilters && currentQuery.entity === 'Datastreams') {
      const newExpand = currentQuery.expand?.map((exp) => {
        if (exp.entity === 'Observations' && exp.subQuery?.filter) {
          const newSubQuery = { ...exp.subQuery };
          delete newSubQuery.filter;
          return { ...exp, subQuery: Object.keys(newSubQuery).length > 0 ? newSubQuery : undefined };
        }
        return exp;
      });
      onChange({ ...currentQuery, filters, expand: newExpand });
    } else {
      onChange({ ...currentQuery, filters });
    }
  };

  const previewQuery = () => {
    const queryString = buildODataQuery(currentQuery, false);
    const variableFilters = (currentQuery.filters || []).filter((f) => f.type === 'variable');
    const matchingVariable = variableFilters.find((vf) => compareEntityNames(vf.entity, currentQuery.entity));
    const previewModel = matchingVariable
      ? { ...currentQuery, entityId: (matchingVariable as any).variableName }
      : currentQuery;
    let fullUrl = buildEntityResourcePath(previewModel);
    fullUrl += queryString;
    return fullUrl;
  };

  const hasCustomExpression = !!(currentQuery.expression && currentQuery.expression.trim());
  const isTemplatedEntityId = typeof currentQuery.entityId === 'string' && currentQuery.entityId.includes('$');
  const numericEntityId =
    typeof currentQuery.entityId === 'number' ? currentQuery.entityId : Number(currentQuery.entityId);
  const isInvalidEntityId =
    currentQuery.entityId !== undefined && !isTemplatedEntityId && !Number.isInteger(numericEntityId);
  const numericWarnings = [
    isInvalidEntityId ? 'Entity ID must be a number or a Grafana variable.' : '',
    currentQuery.entityId !== undefined && !isTemplatedEntityId && numericEntityId < 0
      ? 'Entity ID should be zero or greater.'
      : '',
    currentQuery.top !== undefined && currentQuery.top <= 0 ? '$top should be greater than zero.' : '',
    currentQuery.skip !== undefined && currentQuery.skip < 0 ? '$skip should be zero or greater.' : '',
  ].filter(Boolean);
  const selectedOrderBy = currentQuery.orderby?.find(
    (order) => order.property === 'phenomenonTime' || order.property === 'result'
  );
  const orderByValue = selectedOrderBy ? `${selectedOrderBy.property}:${selectedOrderBy.direction}` : '';
  const observationsExpand = currentQuery.expand?.find((option) => option.entity === 'Observations');
  const expandSubQuery = observationsExpand?.subQuery;
  const selectedExpandOrderBy = expandSubQuery?.orderby?.find(
    (order) => order.property === 'phenomenonTime' || order.property === 'result'
  );
  const expandOrderByValue = selectedExpandOrderBy
    ? `${selectedExpandOrderBy.property}:${selectedExpandOrderBy.direction}`
    : '';
  const expandTimeRangeValue = expandSubQuery?.useGrafanaTimeRange
    ? expandSubQuery.grafanaTimeRangeField || 'phenomenonTime'
    : '';
  const expandNumericWarnings = [
    expandSubQuery?.top !== undefined && expandSubQuery.top <= 0
      ? 'Expanded Observations $top should be greater than zero.'
      : '',
    expandSubQuery?.skip !== undefined && expandSubQuery.skip < 0
      ? 'Expanded Observations $skip should be zero or greater.'
      : '',
  ].filter(Boolean);
  const followNextLinkOption = FOLLOW_NEXT_LINK_OPTIONS.find((opt) => opt.value === currentQuery.followNextLink);

  return (
    <div>
      <div className={styles.queryEditorGrid}>
        <FieldSet label="Entity">
          <InlineFieldRow>
            <InlineField label="Entity" labelWidth={12} tooltip="Select the SensorThings API entity type">
              <Select
                options={ENTITY_OPTIONS}
                value={ENTITY_OPTIONS.find((opt) => opt.value === currentQuery.entity)}
                onChange={onEntityChange}
                width={20}
              />
            </InlineField>
            <InlineField label="Entity ID" labelWidth={12} tooltip="Enter a specific entity ID">
              <Input
                value={currentQuery.entityId ?? ''}
                onChange={onEntityIdChange}
                width={20}
                placeholder="ID or $variable"
              />
            </InlineField>
          </InlineFieldRow>
          {numericWarnings.length > 0 && <div className={styles.validationMessage}>{numericWarnings.join(' ')}</div>}
          <InlineFieldRow>
            {expandOptions.length > 0 && (
              <InlineField
                label="Expand"
                labelWidth={12}
                tooltip="Select related entities to include in the response"
                grow
              >
                <MultiSelect
                  options={expandOptions}
                  value={
                    (currentQuery.expand
                      ?.map((exp) => expandOptions.find((opt) => opt.value === exp.entity))
                      .filter(Boolean) as Array<SelectableValue<EntityType>>) || []
                  }
                  onChange={onExpandChange}
                  placeholder="Select related entities..."
                />
              </InlineField>
            )}
          </InlineFieldRow>
        </FieldSet>

        <FieldSet label="Query Mode">
          <InlineFieldRow>
            <InlineField label="Alias" labelWidth={12} tooltip="Display name for this query">
              <Input value={currentQuery.alias || ''} onChange={onAliasChange} width={20} placeholder="Query alias" />
            </InlineField>
            <InlineField label="Result Format" labelWidth={16} tooltip="Format of the response">
              <Select
                options={RESULT_FORMAT_OPTIONS}
                value={RESULT_FORMAT_OPTIONS.find((opt) => opt.value === currentQuery.resultFormat)}
                onChange={onResultFormatChange}
                width={15}
              />
            </InlineField>
            <InlineField
              label="Follow nextLink"
              labelWidth={16}
              tooltip="Automatically request paginated nextLink pages until the response is complete"
            >
              <Select
                options={FOLLOW_NEXT_LINK_OPTIONS}
                value={followNextLinkOption}
                onChange={onFollowNextLinkChange}
                width={12}
              />
            </InlineField>
          </InlineFieldRow>

          {/* Custom Query Field */}
          <InlineFieldRow>
            <InlineField
              label="Custom Query"
              labelWidth={16}
              tooltip="Enter a complete ISTSOS query fragment (e.g., $filter=name eq 'sensor1')"
              grow
            >
              <Input
                value={currentQuery.expression || ''}
                onChange={onCustomQueryChange}
                placeholder="e.g., $filter=name eq 'sensor1'"
              />
            </InlineField>
          </InlineFieldRow>
          {hasCustomExpression && (
            <Alert title="Custom query mode is active" severity="info">
              Structured filters are disabled. The custom expression is applied to the whole query.
            </Alert>
          )}
        </FieldSet>

        <FieldSet label="Filters">
          <InlineFieldRow>
            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
              icon={showFilters ? 'angle-down' : 'angle-right'}
              className={styles.filterButton}
              disabled={hasCustomExpression}
            >
              Filter By{' '}
              {currentQuery.filters && currentQuery.filters.filter((f) => f.type !== 'variable').length > 0
                ? `(${currentQuery.filters.filter((f) => f.type !== 'variable').length})`
                : ''}
            </Button>
          </InlineFieldRow>
          <Collapse isOpen={showFilters} collapsible label="">
            <FilterPanel
              entityType={currentQuery.entity}
              filters={currentQuery.filters || []}
              onFiltersChange={onFiltersChange}
            />
          </Collapse>
        </FieldSet>

        <FieldSet label="Result Options">
          <InlineFieldRow>
            <InlineField
              label="Time range"
              labelWidth={12}
              tooltip="Add a $filter that limits observations to the Grafana time picker range"
            >
              <Select
                options={TIME_RANGE_OPTIONS}
                value={currentQuery.useGrafanaTimeRange ? currentQuery.grafanaTimeRangeField || 'phenomenonTime' : ''}
                onChange={onGrafanaTimeRangeChange}
                width={20}
              />
            </InlineField>
            <InlineField label="$orderby" labelWidth={12} tooltip="Order observations by phenomenonTime or result">
              <Select
                options={OBSERVATION_ORDER_BY_OPTIONS}
                value={orderByValue}
                onChange={onOrderByChange}
                width={22}
                isDisabled={hasCustomExpression}
              />
            </InlineField>
          </InlineFieldRow>

          <InlineFieldRow>
            <InlineField label="$select" labelWidth={12} tooltip="Comma-separated list of properties to return" grow>
              <Input
                value={currentQuery.select?.join(', ') || ''}
                onChange={onSelectChange}
                placeholder="e.g., name, description, @iot.id"
              />
            </InlineField>
          </InlineFieldRow>

          <InlineFieldRow>
            <InlineField label="$top" labelWidth={12} tooltip="Limit number of results">
              <Input
                value={currentQuery.top ?? ''}
                onChange={onTopChange}
                width={10}
                type="number"
                placeholder="e.g., 100"
              />
            </InlineField>
            <InlineField label="$skip" labelWidth={12} tooltip="Skip number of results">
              <Input
                value={currentQuery.skip ?? ''}
                onChange={onSkipChange}
                width={10}
                type="number"
                placeholder="e.g., 0"
              />
            </InlineField>
          </InlineFieldRow>
        </FieldSet>

        {observationsExpand && (
          <FieldSet label="Expand Result Options">
            <InlineFieldRow>
              <InlineField
                label="Time range"
                labelWidth={12}
                tooltip="Limit expanded Observations to the Grafana time picker range"
              >
                <Select
                  options={TIME_RANGE_OPTIONS}
                  value={expandTimeRangeValue}
                  onChange={onExpandTimeRangeChange}
                  width={20}
                  isDisabled={hasCustomExpression}
                />
              </InlineField>
              <InlineField
                label="$orderby"
                labelWidth={12}
                tooltip="Order the expanded Observations by phenomenonTime or result"
              >
                <Select
                  options={OBSERVATION_ORDER_BY_OPTIONS}
                  value={expandOrderByValue}
                  onChange={onExpandOrderByChange}
                  width={22}
                  isDisabled={hasCustomExpression}
                />
              </InlineField>
            </InlineFieldRow>

            <InlineFieldRow>
              <InlineField
                label="$select"
                labelWidth={12}
                tooltip="Comma-separated Observation properties to return"
                grow
              >
                <Input
                  value={expandSubQuery?.select?.join(', ') || ''}
                  onChange={onExpandSelectChange}
                  placeholder="e.g., result, phenomenonTime"
                  disabled={hasCustomExpression}
                />
              </InlineField>
            </InlineFieldRow>

            <InlineFieldRow>
              <InlineField label="$top" labelWidth={12} tooltip="Limit expanded Observations per entity">
                <Input
                  value={expandSubQuery?.top ?? ''}
                  onChange={onExpandTopChange}
                  width={10}
                  type="number"
                  placeholder="e.g., 2000"
                  disabled={hasCustomExpression}
                />
              </InlineField>
              <InlineField label="$skip" labelWidth={12} tooltip="Skip expanded Observations per entity">
                <Input
                  value={expandSubQuery?.skip ?? ''}
                  onChange={onExpandSkipChange}
                  width={10}
                  type="number"
                  placeholder="e.g., 0"
                  disabled={hasCustomExpression}
                />
              </InlineField>
            </InlineFieldRow>
            {expandNumericWarnings.length > 0 && (
              <div className={styles.validationMessage}>{expandNumericWarnings.join(' ')}</div>
            )}
          </FieldSet>
        )}
      </div>
      <div style={{ width: '100%' }}>
        <FieldSet label="Query Preview">
          <div className={styles.queryPreview}>{previewQuery()}</div>
        </FieldSet>
      </div>
    </div>
  );
}
