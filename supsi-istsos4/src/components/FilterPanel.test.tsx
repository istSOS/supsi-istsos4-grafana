import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FilterPanel } from './FilterPanel';
import { FilterCondition, FilterGroup, EntityType } from '../types';
import { buildGroupedFilterExpression } from '../queryBuilder';

jest.mock('uuid', () => {
  let next = 0;
  return { v4: () => `new-${++next}` };
});
jest.mock('./MapWithTerraDraw', () => ({ MapWithTerraDraw: () => <div>Drawing map</div> }));
jest.mock('@grafana/ui', () => {
  const React = require('react') as typeof import('react');
  const container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Button = ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
  const InlineField = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  );
  type Option = { label?: string; value?: string };
  const Select = ({
    options = [],
    value,
    onChange,
    'aria-label': ariaLabel,
  }: {
    options?: Option[];
    value?: string;
    onChange: (option: Option) => void;
    'aria-label'?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(event) => onChange(options.find((option) => option.value === event.target.value)!)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return {
    Button,
    InlineField,
    InlineFieldRow: container,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Select,
    TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    useStyles2: () => ({}),
  };
});

const initial: FilterCondition[] = [
  { id: 'a', type: 'basic', field: 'name', operator: 'eq', value: 'A' },
  { id: 'b', type: 'basic', field: 'description', operator: 'eq', value: 'B' },
];
function Harness({
  entity = 'Things',
  startingFilters = initial,
  startingGroup,
}: {
  entity?: EntityType;
  startingFilters?: FilterCondition[];
  startingGroup?: FilterGroup;
}) {
  const [state, setState] = useState<{
    filters: FilterCondition[];
    filterGroup?: FilterGroup;
    observationFilterGroup?: FilterGroup;
  }>({ filters: startingFilters, filterGroup: startingGroup });
  return (
    <>
      <FilterPanel
        entityType={entity}
        {...state}
        onFiltersChange={(filters, filterGroup, observationFilterGroup) =>
          setState({ filters, filterGroup, observationFilterGroup })
        }
      />
      <output data-testid="expression">{buildGroupedFilterExpression(state.filters, state.filterGroup)}</output>
    </>
  );
}

describe('FilterPanel rule editor', () => {
  it('loads legacy filters as All and changes them to Any without losing values', () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Match' })).toHaveValue('and');
    fireEvent.change(screen.getByRole('combobox', { name: 'Match' }), { target: { value: 'or' } });
    expect(screen.getByTestId('expression')).toHaveTextContent("((name eq 'A') or (description eq 'B'))");
    expect(screen.getByLabelText('Filter summary')).toHaveTextContent('(Name equals "A" OR Description equals "B")');
  });

  it('adds conditions in place and supports nested groups and removing their conditions', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    let group = within(screen.getByRole('group', { name: 'Condition group' }));
    expect(group.getByRole('combobox', { name: 'Match' })).toHaveValue('or');
    fireEvent.click(group.getByRole('button', { name: 'Add condition' }));
    fireEvent.change(group.getByRole('textbox', { name: 'Value' }), { target: { value: 'C' } });
    fireEvent.click(group.getByRole('button', { name: 'Add condition' }));
    fireEvent.change(group.getAllByRole('textbox', { name: 'Value' })[1], { target: { value: 'D' } });
    expect(screen.getByTestId('expression')).toHaveTextContent(
      "((name eq 'A') and (description eq 'B') and ((name eq 'C') or (name eq 'D')))"
    );
    fireEvent.click(group.getByRole('button', { name: 'Remove group' }));
    expect(screen.getByTestId('expression')).toHaveTextContent("((name eq 'A') and (description eq 'B'))");
    expect(screen.queryByDisplayValue('C')).not.toBeInTheDocument();
  });

  it('offers suitable operators, dates and maps after choosing a field', () => {
    render(<Harness entity="Datastreams" startingFilters={[initial[0]]} />);
    const field = screen.getByRole('combobox', { name: 'Field' });
    fireEvent.change(field, { target: { value: 'basic::@iot.id' } });
    expect(screen.queryByRole('option', { name: 'Contains' })).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'entity:Sensors:name' } });
    expect(screen.getByRole('option', { name: 'Contains' })).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'temporal::phenomenonTime' } });
    expect(screen.getByLabelText('From (UTC)')).toHaveAttribute('type', 'datetime-local');
    fireEvent.change(screen.getByRole('combobox', { name: 'Operator' }), { target: { value: 'year' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '2026' } });
    expect(screen.getByTestId('expression')).toHaveTextContent('year(phenomenonTime) eq 2026');
    expect(screen.queryByLabelText('From (UTC)')).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'spatial::observedArea' } });
    expect(screen.getByText('Drawing map')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'basic::name' } });
    expect(screen.queryByText('Drawing map')).not.toBeInTheDocument();
  });

  it('keeps expanded observation logic separate and preserves variable constraints when clearing', () => {
    const variable: FilterCondition = {
      id: 'variable',
      type: 'variable',
      field: 'id',
      entity: 'Things',
      operator: 'eq',
      value: 3,
    };
    render(<Harness entity="Datastreams" startingFilters={[...initial, variable]} />);
    const observations = within(screen.getByRole('group', { name: 'Expanded observation conditions' }));
    fireEvent.change(observations.getByRole('combobox', { name: 'Match' }), { target: { value: 'or' } });
    fireEvent.click(observations.getByRole('button', { name: 'Add condition' }));
    expect(observations.getByRole('combobox', { name: 'Field' })).toHaveValue('observation::result');
    expect(
      within(screen.getByRole('group', { name: 'Filter conditions' })).getByRole('combobox', { name: 'Match' })
    ).toHaveValue('and');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByTestId('expression')).toHaveTextContent('Things/id eq 3');
    expect(screen.queryByRole('textbox', { name: 'Value' })).not.toBeInTheDocument();
  });

  it('restores saved groups and removes deleted rules from the expression', () => {
    render(
      <Harness
        startingGroup={{
          id: 'root',
          combinator: 'and',
          filterIds: [],
          groups: [{ id: 'saved', combinator: 'or', filterIds: ['a', 'b'], groups: [] }],
        }}
      />
    );
    const group = within(screen.getByRole('group', { name: 'Condition group' }));
    fireEvent.click(group.getAllByRole('button', { name: 'Remove condition' })[0]);
    expect(screen.queryByDisplayValue('A')).not.toBeInTheDocument();
    expect(screen.getByTestId('expression')).toHaveTextContent("(((description eq 'B')))");
  });
});
