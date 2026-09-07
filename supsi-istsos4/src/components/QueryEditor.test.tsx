import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryEditor } from './QueryEditor';
import { IstSOS4Query } from '../types';
import type { DataSource } from '../datasource';

jest.mock('uuid', () => {
  let next = 0;
  return { v4: () => `filter-${++next}` };
});
jest.mock('./MapWithTerraDraw', () => ({ MapWithTerraDraw: () => null }));

jest.mock('@grafana/ui', () => {
  const React = require('react') as typeof import('react');

  const container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const InlineField = ({
    label,
    children,
    invalid,
    error,
  }: {
    label: string;
    children?: React.ReactNode;
    invalid?: boolean;
    error?: React.ReactNode;
  }) => (
    <label>
      <span>{label}</span>
      {children}
      {invalid && error && <span role="alert">{error}</span>}
    </label>
  );
  const FieldSet = ({
    label,
    children,
    className,
  }: {
    label: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <section className={className}>
      <h2>{label}</h2>
      {children}
    </section>
  );
  const Input = ({ width: _width, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { width?: number }) => (
    <input {...props} />
  );
  const Select = ({
    options = [],
    value,
    onChange,
    isDisabled,
  }: {
    options?: Array<{ label?: string; value?: unknown }>;
    value?: string | { value?: unknown };
    onChange: (value: { label?: string; value?: unknown }) => void;
    isDisabled?: boolean;
  }) => {
    const selectedValue = typeof value === 'object' ? value?.value : value;
    return (
      <select
        value={String(selectedValue ?? '')}
        disabled={isDisabled}
        onChange={(event) =>
          onChange(options.find((option) => String(option.value ?? '') === event.target.value) || {})
        }
      >
        {options.map((option) => (
          <option key={String(option.value ?? '')} value={String(option.value ?? '')}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
  const MultiSelect = ({ onChange }: { onChange: (values: Array<{ label: string; value: string }>) => void }) => (
    <div>
      <button type="button" onClick={() => onChange([{ label: 'Observations', value: 'Observations' }])}>
        Select Observations
      </button>
      <button
        type="button"
        onClick={() =>
          onChange([
            { label: 'Observations', value: 'Observations' },
            { label: 'Sensors', value: 'Sensors' },
          ])
        }
      >
        Select Observations and Sensor
      </button>
    </div>
  );
  const Button = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  );
  const Collapse = ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null;
  const Alert = ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <div>
      {title} {children}
    </div>
  );

  return {
    InlineField,
    InlineFieldRow: container,
    Input,
    Select,
    FieldSet,
    MultiSelect,
    Button,
    Collapse,
    Alert,
    useStyles2: () => ({
      queryEditorGrid: 'query-editor-grid',
      entitySection: 'entity-section',
      queryModeSection: 'query-mode-section',
      resultOptionsSection: 'result-options-section',
      expandResultOptionsSection: 'expand-result-options-section',
      filtersSection: 'filters-section',
      validationMessage: '',
      filterButton: '',
      queryPreview: '',
    }),
  };
});

const datasource = {} as DataSource;

function EditorHarness({ initialQuery, onChange }: { initialQuery: IstSOS4Query; onChange: jest.Mock }) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <QueryEditor
      query={query}
      datasource={datasource}
      onRunQuery={jest.fn()}
      onChange={(nextQuery) => {
        onChange(nextQuery);
        setQuery(nextQuery);
      }}
    />
  );
}

describe('QueryEditor expanded Observation result options', () => {
  const baseQuery: IstSOS4Query = {
    refId: 'A',
    entity: 'Datastreams',
    useGrafanaTimeRange: false,
  };

  it('shows Expand Result Options only when Observations is expanded', () => {
    const { rerender } = render(
      <QueryEditor query={baseQuery} datasource={datasource} onRunQuery={jest.fn()} onChange={jest.fn()} />
    );
    expect(screen.queryByRole('heading', { name: 'Expand Result Options' })).not.toBeInTheDocument();

    rerender(
      <QueryEditor
        query={{ ...baseQuery, expand: [{ entity: 'Sensors' }] }}
        datasource={datasource}
        onRunQuery={jest.fn()}
        onChange={jest.fn()}
      />
    );
    expect(screen.queryByRole('heading', { name: 'Expand Result Options' })).not.toBeInTheDocument();

    rerender(
      <QueryEditor
        query={{ ...baseQuery, expand: [{ entity: 'Observations' }] }}
        datasource={datasource}
        onRunQuery={jest.fn()}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Expand Result Options' })).toBeInTheDocument();
  });

  it('assigns stable grid positions to Entity, Result Options, Expand Result Options, and Filters', () => {
    render(
      <QueryEditor
        query={{ ...baseQuery, expand: [{ entity: 'Observations' }] }}
        datasource={datasource}
        onRunQuery={jest.fn()}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Entity' }).closest('section')).toHaveClass('entity-section');
    expect(screen.getByRole('heading', { name: 'Query Mode' }).closest('section')).toHaveClass('query-mode-section');
    expect(screen.getByRole('heading', { name: 'Result Options' }).closest('section')).toHaveClass(
      'result-options-section'
    );
    expect(screen.getByRole('heading', { name: 'Expand Result Options' }).closest('section')).toHaveClass(
      'expand-result-options-section'
    );
    expect(screen.getByRole('heading', { name: 'Filters' }).closest('section')).toHaveClass('filters-section');
  });

  it('initializes Observation options and disables the root time range when Observations is selected', () => {
    const onChange = jest.fn();
    render(
      <QueryEditor
        query={{ ...baseQuery, useGrafanaTimeRange: true, grafanaTimeRangeField: 'phenomenonTime' }}
        datasource={datasource}
        onRunQuery={jest.fn()}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Select Observations'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        useGrafanaTimeRange: false,
        grafanaTimeRangeField: undefined,
        expand: [
          {
            entity: 'Observations',
            subQuery: {
              useGrafanaTimeRange: true,
              grafanaTimeRangeField: 'phenomenonTime',
            },
          },
        ],
      })
    );
  });

  it('updates all shared expanded result options through the editor', () => {
    const onChange = jest.fn();
    render(
      <EditorHarness
        initialQuery={{
          ...baseQuery,
          expand: [
            {
              entity: 'Observations',
              subQuery: {
                useGrafanaTimeRange: true,
                grafanaTimeRangeField: 'phenomenonTime',
              },
            },
          ],
        }}
        onChange={onChange}
      />
    );

    const timeRangeFields = screen.getAllByLabelText('Time range');
    const orderByFields = screen.getAllByLabelText('$orderby');
    const selectFields = screen.getAllByLabelText('$select');
    const topFields = screen.getAllByLabelText('$top');
    const skipFields = screen.getAllByLabelText('$skip');
    const intervalTimestamp = screen.getByLabelText('Interval timestamp');

    fireEvent.change(timeRangeFields[1], { target: { value: 'resultTime' } });
    fireEvent.change(orderByFields[1], { target: { value: 'result:desc' } });
    fireEvent.change(selectFields[1], { target: { value: 'result, phenomenonTime' } });
    fireEvent.blur(selectFields[1]);
    fireEvent.change(topFields[1], { target: { value: '2000' } });
    fireEvent.change(skipFields[1], { target: { value: '10' } });
    fireEvent.change(intervalTimestamp, { target: { value: 'start' } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phenomenonTimeEndpoint: 'start',
        expand: [
          {
            entity: 'Observations',
            subQuery: {
              useGrafanaTimeRange: true,
              grafanaTimeRangeField: 'resultTime',
              orderby: [{ property: 'result', direction: 'desc' }],
              select: ['result', 'phenomenonTime'],
              top: 2000,
              skip: 10,
            },
          },
        ],
      })
    );
  });

  it('preserves select punctuation while editing and validates the comma-separated format', () => {
    const onChange = jest.fn();
    render(
      <EditorHarness
        initialQuery={{
          ...baseQuery,
          expand: [{ entity: 'Observations', subQuery: { select: ['result'] } }],
        }}
        onChange={onChange}
      />
    );

    const selectField = screen.getAllByLabelText('$select')[1];

    fireEvent.change(selectField, { target: { value: 'result, ' } });
    expect(selectField).toHaveValue('result, ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(selectField);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use comma-separated property names, for example: result, phenomenonTime.'
    );
    expect(selectField).toHaveValue('result, ');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(selectField, { target: { value: 'result phenomenonTime' } });
    fireEvent.blur(selectField);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use comma-separated property names, for example: result, phenomenonTime.'
    );
    expect(selectField).toHaveValue('result phenomenonTime');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(selectField, { target: { value: 'result, phenomenonTime' } });
    fireEvent.blur(selectField);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expand: [{ entity: 'Observations', subQuery: { select: ['result', 'phenomenonTime'] } }],
      })
    );
  });

  it('preserves Observation result options when another expanded entity is selected', () => {
    const onChange = jest.fn();
    const observationSubQuery = {
      useGrafanaTimeRange: true,
      grafanaTimeRangeField: 'phenomenonTime' as const,
      select: ['result', 'phenomenonTime'],
      orderby: [{ property: 'phenomenonTime', direction: 'asc' as const }],
      top: 2000,
      skip: 10,
    };
    render(
      <QueryEditor
        query={{
          ...baseQuery,
          expand: [{ entity: 'Observations', subQuery: observationSubQuery }, { entity: 'Sensors' }],
        }}
        datasource={datasource}
        onRunQuery={jest.fn()}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Select Observations and Sensor'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expand: [{ entity: 'Observations', subQuery: observationSubQuery }, { entity: 'Sensors' }],
      })
    );
  });

  it('offers name ordering for Datastreams and keeps it separate from Observation ordering', () => {
    const onChange = jest.fn();
    render(
      <EditorHarness
        initialQuery={{
          ...baseQuery,
          expand: [
            {
              entity: 'Observations',
              subQuery: {
                orderby: [{ property: 'phenomenonTime', direction: 'desc' }],
              },
            },
          ],
        }}
        onChange={onChange}
      />
    );

    const orderByFields = screen.getAllByLabelText('$orderby');
    expect(screen.getByRole('option', { name: 'name asc' })).toBeInTheDocument();
    fireEvent.change(orderByFields[0], { target: { value: 'name:asc' } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderby: [{ property: 'name', direction: 'asc' }],
        expand: [
          {
            entity: 'Observations',
            subQuery: {
              orderby: [{ property: 'phenomenonTime', direction: 'desc' }],
            },
          },
        ],
      })
    );
  });
});

it('adds an Observation expansion with a time range and persists independent group choices', () => {
  const onChange = jest.fn();
  render(
    <EditorHarness
      initialQuery={{ refId: 'A', entity: 'Datastreams', useGrafanaTimeRange: true }}
      onChange={onChange}
    />
  );
  const scope = within(screen.getByRole('group', { name: 'Expanded observation conditions' }));
  fireEvent.change(scope.getByRole('combobox', { name: 'Match' }), { target: { value: 'or' } });
  fireEvent.click(scope.getByRole('button', { name: 'Add condition' }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      useGrafanaTimeRange: false,
      filterGroup: expect.objectContaining({ combinator: 'and' }),
      observationFilterGroup: expect.objectContaining({ combinator: 'or', filterIds: [expect.any(String)] }),
      expand: [
        { entity: 'Observations', subQuery: { useGrafanaTimeRange: true, grafanaTimeRangeField: 'phenomenonTime' } },
      ],
    })
  );
  expect(screen.getByRole('heading', { name: 'Expand Result Options' })).toBeInTheDocument();
});
