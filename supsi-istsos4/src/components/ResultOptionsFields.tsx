import React, { ChangeEvent } from 'react';
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
  onSelectChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTopChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSkipChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
  disabled = false,
  orderByDisabled = disabled,
  validationWarnings = [],
  validationClassName,
}: Props) {
  const expanded = scope === 'expandedObservations';

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
        >
          <Input
            value={selectValue}
            onChange={onSelectChange}
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
