import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryEditor } from './QueryEditor';
import { IstSOS4Query } from '../types';
import type { DataSource } from '../datasource';

jest.mock('@grafana/ui', () => {
  const React = require('react') as typeof import('react');

  const container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const InlineField = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
  const FieldSet = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <section>
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
    useStyles2: () => ({ queryEditorGrid: '', validationMessage: '', filterButton: '', queryPreview: '' }),
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

    fireEvent.change(timeRangeFields[1], { target: { value: 'resultTime' } });
    fireEvent.change(orderByFields[1], { target: { value: 'result:desc' } });
    fireEvent.change(selectFields[1], { target: { value: 'result, phenomenonTime' } });
    fireEvent.change(topFields[1], { target: { value: '2000' } });
    fireEvent.change(skipFields[1], { target: { value: '10' } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
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
