import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterPanel } from './FilterPanel';
import { FilterCondition } from '../types';

jest.mock('uuid', () => ({ v4: () => 'new-filter' }));
jest.mock('./MapWithTerraDraw', () => ({ MapWithTerraDraw: () => null }));

jest.mock('@grafana/ui', () => {
  const React = require('react') as typeof import('react');
  const container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Button = ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
  const FieldSet = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  );
  const InlineField = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  );
  const Select = ({ options = [], value }: { options?: Array<{ label?: string; value?: string }>; value?: string }) => (
    <select value={value ?? ''} onChange={() => undefined}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />;
  const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />;

  return {
    Button,
    FieldSet,
    InlineField,
    InlineFieldRow: container,
    Input,
    Select,
    TextArea,
    useStyles2: () => ({}),
  };
});

describe('FilterPanel filter ordering', () => {
  it('places a newly added filter before all existing filters', () => {
    const existingFilters: FilterCondition[] = [
      { id: 'older-filter', type: 'basic', field: 'name', operator: 'eq', value: 'older' },
      { id: 'oldest-filter', type: 'basic', field: 'description', operator: 'eq', value: 'oldest' },
    ];
    const onFiltersChange = jest.fn();
    render(<FilterPanel entityType="Datastreams" filters={existingFilters} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const nextFilters = onFiltersChange.mock.calls[0][0] as FilterCondition[];
    expect(nextFilters.map((filter) => filter.id)).toEqual(['new-filter', 'older-filter', 'oldest-filter']);
  });
});
