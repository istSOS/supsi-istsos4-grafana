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
import { buildODataQuery } from '../queryBuilder';
import { FilterPanel } from './FilterPanel';
import { VariablesPanel } from './VariablesPanel';
import { ENTITY_OPTIONS, RESULT_FORMAT_OPTIONS } from '../utils/constants';
import { compareEntityNames, getStyles, getExpandOptions } from '../utils/utils';

type Props = QueryEditorProps<DataSource, IstSOS4Query, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const styles = useStyles2(getStyles);

  const expandOptions = getExpandOptions(query.entity);

  const currentQuery: IstSOS4Query = {
    ...query,
    entity: query.entity || 'Things',
    count: query.count || false,
    resultFormat: query.resultFormat || 'default',
    filters: query.filters || [],
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

  const onAliasChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...currentQuery, alias: event.target.value });
  };

  const onCustomQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...currentQuery, expression: event.target.value });
  };

  const onExpandChange = (values: Array<SelectableValue<EntityType>>) => {
    const expandOptions: ExpandOption[] = values.map((value) => ({
      entity: value.value!,
    }));
    onChange({ ...currentQuery, expand: expandOptions.length > 0 ? expandOptions : undefined });
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
    let fullUrl = `/${currentQuery.entity}`;
    const variableFilters = (currentQuery.filters || []).filter((f) => f.type === 'variable');
    const matchingVariable = variableFilters.find((vf) => compareEntityNames(vf.entity, currentQuery.entity));
    if (matchingVariable) {
      fullUrl += `(${(matchingVariable as any).variableName})`;
    } else if (currentQuery.entityId !== undefined) {
      fullUrl += `(${currentQuery.entityId})`;
    }
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
              Structured filters and variables are disabled. The custom expression is applied to the whole query.
            </Alert>
          )}
        </FieldSet>

        <FieldSet label="Filters and Variables">
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
            <Button
              variant={showVariables ? 'primary' : 'secondary'}
              onClick={() => setShowVariables(!showVariables)}
              icon={showVariables ? 'angle-down' : 'angle-right'}
              className={styles.filterButton}
              disabled={hasCustomExpression}
            >
              Variables{' '}
              {(() => {
                const variableFilters = (currentQuery.filters || []).filter((f) => f.type === 'variable');
                return variableFilters.length > 0 ? `(${variableFilters.length})` : '';
              })()}
            </Button>
          </InlineFieldRow>
          <Collapse isOpen={showFilters} collapsible label="">
            <FilterPanel
              entityType={currentQuery.entity}
              filters={currentQuery.filters || []}
              onFiltersChange={onFiltersChange}
            />
          </Collapse>
          <Collapse isOpen={showVariables} collapsible label="">
            <VariablesPanel filters={currentQuery.filters || []} onFiltersChange={onFiltersChange} />
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
                options={[
                  { label: 'Disabled', value: '' },
                  { label: 'phenomenonTime', value: 'phenomenonTime' },
                  { label: 'resultTime', value: 'resultTime' },
                ]}
                value={
                  currentQuery.useGrafanaTimeRange
                    ? currentQuery.grafanaTimeRangeField || 'phenomenonTime'
                    : ''
                }
                onChange={onGrafanaTimeRangeChange}
                width={20}
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
      </div>
      <div style={{ width: '100%' }}>
        <FieldSet label="Query Preview">
          <div className={styles.queryPreview}>{previewQuery()}</div>
        </FieldSet>
      </div>
    </div>
  );
}
