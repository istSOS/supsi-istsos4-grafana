import React, { ChangeEvent, useState } from 'react';
import {
  InlineField,
  Input,
  Select,
  Stack,
  InlineFieldRow,
  FieldSet,
  MultiSelect,
  Button,
  useStyles2,
  Collapse,
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
    const value = event.target.value;
    onChange({
      ...currentQuery,
      entityId: value ? parseInt(value, 10) : undefined,
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
    onChange({
      ...currentQuery,
      top: value ? parseInt(value, 10) : undefined,
    });
  };

  const onSkipChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange({
      ...currentQuery,
      skip: value ? parseInt(value, 10) : undefined,
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
  return (
    <div>
      <Stack gap={1}>
        <FieldSet label="Entity Type">
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
                value={currentQuery.entityId || ''}
                onChange={onEntityIdChange}
                width={20}
                type="number"
                placeholder="Enter entity ID"
              />
            </InlineField>
          </InlineFieldRow>
          <InlineFieldRow>
            {expandOptions.length > 0 && (
              <InlineField
              label="Expand Entities"
              labelWidth={18}
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
                placeholder="Select entities to expand..."
              />
              </InlineField>
            )}
          </InlineFieldRow>
          <div style={{ height: '10px' }} />
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

          {/* Filter By Button */}
          <InlineFieldRow>
            {currentQuery.expression && currentQuery.expression.trim() ? (
              <div style={{ 
                padding: '8px 12px', 
                backgroundColor: '#1f2328', 
                border: '1px solid #30363d', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#7d8590'
              }}>
                ℹ️ Using custom query expression. This Expression only will be applied to the entire query.
              </div>
            ) : null}
            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
              icon={showFilters ? 'angle-down' : 'angle-right'}
              className={styles.filterButton}
              disabled={!!(currentQuery.expression && currentQuery.expression.trim())}
            >
              Filter By{' '}
              {currentQuery.filters && currentQuery.filters.filter((f) => f.type !== 'variable').length > 0
                ? `(${currentQuery.filters.filter((f) => f.type !== 'variable').length})`
                : ''}
            </Button>
          </InlineFieldRow>

          {/* Filter Panel */}
          <Collapse isOpen={showFilters} collapsible label="">
            <FilterPanel
              entityType={currentQuery.entity}
              filters={currentQuery.filters || []}
              onFiltersChange={onFiltersChange}
            />
          </Collapse>

          {/* Variables Button */}
          <InlineFieldRow>
            <Button
              variant={showVariables ? 'primary' : 'secondary'}
              onClick={() => setShowVariables(!showVariables)}
              icon={showVariables ? 'angle-down' : 'angle-right'}
              className={styles.filterButton}
              disabled={!!(currentQuery.expression && currentQuery.expression.trim())}
            >
              Variables{' '}
              {(() => {
                const variableFilters = (currentQuery.filters || []).filter((f) => f.type === 'variable');
                return variableFilters.length > 0 ? `(${variableFilters.length})` : '';
              })()}
            </Button>
          </InlineFieldRow>

          {/* Variables Panel */}
          <Collapse isOpen={showVariables} collapsible label="">
            <VariablesPanel filters={currentQuery.filters || []} onFiltersChange={onFiltersChange} />
          </Collapse>
        </FieldSet>

        {/* Advanced Options */}
        <FieldSet label="Advanced Options">
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
                value={currentQuery.top || ''}
                onChange={onTopChange}
                width={10}
                type="number"
                placeholder="e.g., 100"
              />
            </InlineField>
            <InlineField label="$skip" labelWidth={12} tooltip="Skip number of results">
              <Input
                value={currentQuery.skip || ''}
                onChange={onSkipChange}
                width={10}
                type="number"
                placeholder="e.g., 0"
              />
            </InlineField>
          </InlineFieldRow>
        </FieldSet>
      </Stack>
      <div style={{ width: '100%' }}>
        <FieldSet label="Query Preview">
          <div className={styles.queryPreview}>{previewQuery()}</div>
        </FieldSet>
      </div>
    </div>
  );
}
