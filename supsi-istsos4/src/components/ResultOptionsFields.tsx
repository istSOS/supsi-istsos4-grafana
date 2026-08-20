import React, { ChangeEvent, KeyboardEvent, useEffect, useState } from 'react';
import { InlineField, InlineFieldRow, Input, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';

export const TIME_RANGE_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Disabled', value: '' },
  { label: 'phenomenonTime', value: 'phenomenonTime' },
  { label: 'resultTime', value: 'resultTime' },
];

export const OBSERVATION_ORDER_BY_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Disabled', value: '' },
  { label: 'phenomenonTime asc', value: 'phenomenonTime:asc' },
  { label: 'phenomenonTime desc', value: 'phenomenonTime:desc' },
  { label: 'result asc', value: 'result:asc' },
  { label: 'result desc', value: 'result:desc' },
];

export const PHENOMENON_TIME_ENDPOINT_OPTIONS: Array<SelectableValue<'start' | 'end'>> = [
  { label: 'End (right)', value: 'end' },
  { label: 'Start (left)', value: 'start' },
];

interface Props {
  scope: 'root' | 'expandedObservations';
  timeRangeValue: string;
  orderByValue: string;
  orderByOptions?: Array<SelectableValue<string>>;
  selectValue: string;
  topValue: number | '';
  skipValue: number | '';
  onTimeRangeChange: (value: SelectableValue<string>) => void;
  onOrderByChange: (value: SelectableValue<string>) => void;
  onSelectChange: (properties: string[] | undefined) => void;
  onTopChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSkipChange: (event: ChangeEvent<HTMLInputElement>) => void;
  phenomenonTimeEndpoint?: 'start' | 'end';
  onPhenomenonTimeEndpointChange?: (value: SelectableValue<'start' | 'end'>) => void;
  disabled?: boolean;
  orderByDisabled?: boolean;
  validationWarnings?: string[];
  validationClassName?: string;
}

export function ResultOptionsFields({
  scope,
  timeRangeValue,
  orderByValue,
  orderByOptions = OBSERVATION_ORDER_BY_OPTIONS,
  selectValue,
  topValue,
  skipValue,
  onTimeRangeChange,
  onOrderByChange,
  onSelectChange,
  onTopChange,
  onSkipChange,
  phenomenonTimeEndpoint,
  onPhenomenonTimeEndpointChange,
  disabled = false,
  orderByDisabled = disabled,
  validationWarnings = [],
  validationClassName,
}: Props) {
  const expanded = scope === 'expandedObservations';
  const [selectDraft, setSelectDraft] = useState(selectValue);
  const [selectError, setSelectError] = useState<string>();

  useEffect(() => {
    setSelectDraft(selectValue);
    setSelectError(undefined);
  }, [selectValue]);

  const commitSelect = () => {
    const value = selectDraft.trim();
    if (!value) {
      setSelectDraft('');
      setSelectError(undefined);
      if (selectValue) {
        onSelectChange(undefined);
      }
      return;
    }

    const properties = value.split(',').map((property) => property.trim());
    if (properties.some((property) => !property || /\s/.test(property))) {
      setSelectError('Use comma-separated property names, for example: result, phenomenonTime.');
      return;
    }

    const normalizedValue = properties.join(', ');
    setSelectDraft(normalizedValue);
    setSelectError(undefined);
    if (normalizedValue !== selectValue) {
      onSelectChange(properties);
    }
  };

  const onSelectKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSelect();
    }
  };

  return (
    <>
      <InlineFieldRow>
        <InlineField
          label="Time range"
          labelWidth={12}
          tooltip={
            expanded
              ? 'Limit expanded Observations to the Grafana time picker range'
              : 'Add a $filter that limits observations to the Grafana time picker range'
          }
        >
          <Select
            options={TIME_RANGE_OPTIONS}
            value={timeRangeValue}
            onChange={onTimeRangeChange}
            width={20}
            isDisabled={disabled}
          />
        </InlineField>
        <InlineField
          label="$orderby"
          labelWidth={12}
          tooltip={
            expanded ? 'Order the expanded Observations by phenomenonTime or result' : 'Order the returned entities'
          }
        >
          <Select
            options={orderByOptions}
            value={orderByValue}
            onChange={onOrderByChange}
            width={22}
            isDisabled={orderByDisabled}
          />
        </InlineField>
      </InlineFieldRow>

      {phenomenonTimeEndpoint && onPhenomenonTimeEndpointChange && (
        <InlineFieldRow>
          <InlineField
            label="Interval timestamp"
            labelWidth={18}
            tooltip="Choose which endpoint Grafana uses when phenomenonTime is an interval"
          >
            <Select
              options={PHENOMENON_TIME_ENDPOINT_OPTIONS}
              value={phenomenonTimeEndpoint}
              onChange={onPhenomenonTimeEndpointChange}
              width={20}
              isDisabled={disabled}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      <InlineFieldRow>
        <InlineField
          label="$select"
          labelWidth={12}
          tooltip={
            expanded
              ? 'Comma-separated Observation properties to return'
              : 'Comma-separated list of properties to return'
          }
          grow
          invalid={!!selectError}
          error={selectError}
        >
          <Input
            value={selectDraft}
            onChange={(event) => {
              setSelectDraft(event.currentTarget.value);
              setSelectError(undefined);
            }}
            onBlur={commitSelect}
            onKeyDown={onSelectKeyDown}
            placeholder={expanded ? 'e.g., result, phenomenonTime' : 'e.g., name, description, @iot.id'}
            disabled={disabled}
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField
          label="$top"
          labelWidth={12}
          tooltip={expanded ? 'Limit expanded Observations per entity' : 'Limit number of results'}
        >
          <Input
            value={topValue}
            onChange={onTopChange}
            width={10}
            type="number"
            placeholder={expanded ? 'e.g., 2000' : 'e.g., 100'}
            disabled={disabled}
          />
        </InlineField>
        <InlineField
          label="$skip"
          labelWidth={12}
          tooltip={expanded ? 'Skip expanded Observations per entity' : 'Skip number of results'}
        >
          <Input
            value={skipValue}
            onChange={onSkipChange}
            width={10}
            type="number"
            placeholder="e.g., 0"
            disabled={disabled}
          />
        </InlineField>
      </InlineFieldRow>

      {validationWarnings.length > 0 && <div className={validationClassName}>{validationWarnings.join(' ')}</div>}
    </>
  );
}
