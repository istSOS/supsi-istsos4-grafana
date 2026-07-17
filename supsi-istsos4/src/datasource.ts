import {
  CoreApp,
  DataQueryRequest,
  DataSourceInstanceSettings,
  dateTime,
  MetricFindValue,
  ScopedVars,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';

import { compareEntityNames } from './utils/utils';
import { DEFAULT_QUERY, IstSOS4Query, MyDataSourceOptions } from './types';

export class DataSource extends DataSourceWithBackend<IstSOS4Query, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  getDefaultQuery(_: CoreApp): Partial<IstSOS4Query> {
    return DEFAULT_QUERY;
  }

  filterQuery(query: IstSOS4Query): boolean {
    return Boolean(query.entity) && !query.hide;
  }

  applyTemplateVariables(query: IstSOS4Query, scopedVars: ScopedVars): IstSOS4Query {
    const modifiedQuery: IstSOS4Query = {
      ...query,
      alias: query.alias ? getTemplateSrv().replace(query.alias, scopedVars) : query.alias,
      entityId: this.applyEntityIdVariableSubstitution(query.entityId, scopedVars),
      navigationPath: query.navigationPath?.map((segment) => ({
        ...segment,
        entityId: this.applyEntityIdVariableSubstitution(segment.entityId, scopedVars),
      })),
    };

    if (modifiedQuery.expression) {
      modifiedQuery.expression = this.applyCustomVariableSubstitution(modifiedQuery.expression, scopedVars);
    }

    if (modifiedQuery.filters) {
      modifiedQuery.filters = modifiedQuery.filters
        .map((filter) => {
          const filterWithVariables = {
            ...filter,
            value: this.applyFilterValueVariableSubstitution(filter.value, scopedVars),
          } as typeof filter & { startDate?: string; endDate?: string };

          if (filterWithVariables.startDate) {
            filterWithVariables.startDate = this.applyFilterValueVariableSubstitution(
              filterWithVariables.startDate,
              scopedVars
            );
          }
          if (filterWithVariables.endDate) {
            filterWithVariables.endDate = this.applyFilterValueVariableSubstitution(
              filterWithVariables.endDate,
              scopedVars
            );
          }

          if (filter.type !== 'variable') {
            return filterWithVariables;
          }

          const variableFilter = filterWithVariables as typeof filterWithVariables & {
            variableName: string;
            entity: IstSOS4Query['entity'];
          };
          const variableValue = getTemplateSrv().replace(variableFilter.variableName, scopedVars);
          if (!variableValue || variableValue === variableFilter.variableName) {
            return { ...variableFilter, value: null };
          }

          if (compareEntityNames(variableFilter.entity, query.entity)) {
            if (!/^\d+$/.test(variableValue)) {
              throw new Error(`Variable ${variableFilter.variableName} must resolve to a single numeric entity ID.`);
            }
            modifiedQuery.entityId = Number(variableValue);
            return null;
          }
          return { ...variableFilter, value: variableValue };
        })
        .filter((filter): filter is NonNullable<typeof filter> => filter !== null);
    }

    return modifiedQuery;
  }

  async metricFindQuery(query: IstSOS4Query, options?: { scopedVars?: ScopedVars; range?: DataQueryRequest['range'] }): Promise<MetricFindValue[]> {
    const scopedVars = options?.scopedVars ?? {};
    const target: IstSOS4Query = {
      ...this.applyTemplateVariables(query, scopedVars),
      refId: query.refId || 'VariableQuery',
      queryType: 'variable',
    };
    const now = dateTime();
    const range = options?.range ?? { from: dateTime(now).subtract(1, 'hour'), to: now, raw: { from: 'now-1h', to: 'now' } };
    const request: DataQueryRequest<IstSOS4Query> = {
      requestId: `istsos4-variable-${Date.now()}`,
      interval: '1s',
      intervalMs: 1000,
      range,
      rangeRaw: range.raw,
      scopedVars,
      targets: [target],
      timezone: 'browser',
      app: CoreApp.Dashboard,
      startTime: Date.now(),
    };

    const response = await firstValueFrom(super.query(request));
    const frame = response.data[0];
    if (!frame) {
      return [];
    }
    const textField = frame.fields.find((field: { name: string }) => field.name === 'text');
    const valueField = frame.fields.find((field: { name: string }) => field.name === 'value');
    if (!textField || !valueField) {
      return [];
    }
    return textField.values.map((text: unknown, index: number) => ({
      text: String(text ?? ''),
      value: String(valueField.values[index] ?? ''),
    }));
  }

  private applyCustomVariableSubstitution(expression: string, scopedVars: ScopedVars): string {
    const expandedComparisons = expression.replace(
      /([A-Za-z_][A-Za-z0-9_/@.]*)\s+(eq|ne)\s+'([^']*\$[^']*)'/g,
      (match, field, operator, quotedContent) => {
        const substituted = getTemplateSrv().replace(quotedContent, scopedVars, 'csv');
        if (!substituted.includes(',')) {
          return `${field} ${operator} ${this.formatCustomExpressionValue(field, substituted)}`;
        }
        const values = substituted.split(',').map((value) => value.trim()).filter(Boolean);
        if (values.length === 0) {
          return match;
        }
        const joinOperator = operator === 'eq' ? ' or ' : ' and ';
        return `(${values
          .map((value) => `${field} ${operator} ${this.formatCustomExpressionValue(field, value)}`)
          .join(joinOperator)})`;
      }
    );

    const quotedVariables = expandedComparisons.replace(/'([^']*\$[^']*)'/g, (_match, quotedContent) => {
      const substituted = getTemplateSrv().replace(quotedContent, scopedVars);
      return `'${substituted.split(',').map((value) => value.trim()).join("','")}'`;
    });

    return quotedVariables.replace(/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/g, (match) => {
      return this.isODataQueryOption(match) ? match : getTemplateSrv().replace(match, scopedVars, 'csv');
    });
  }

  private applyEntityIdVariableSubstitution(entityId: number | string | undefined, scopedVars: ScopedVars) {
    if (entityId === undefined || typeof entityId === 'number') {
      return entityId;
    }
    const replacedEntityId = getTemplateSrv().replace(entityId, scopedVars).trim();
    if (!replacedEntityId) {
      return undefined;
    }
    if (!/^\d+$/.test(replacedEntityId)) {
      throw new Error(`Entity ID variable "${entityId}" must resolve to a single numeric ID.`);
    }
    return Number(replacedEntityId);
  }

  private applyFilterValueVariableSubstitution(value: unknown, scopedVars: ScopedVars): any {
    if (typeof value !== 'string' || !value.includes('$')) {
      return value;
    }
    return getTemplateSrv().replace(value, scopedVars, 'csv').trim();
  }

  private formatCustomExpressionValue(field: string, value: string): string {
    const trimmed = value.trim();
    if (field.endsWith('@iot.id') || field.endsWith('/id') || field === '@iot.id' || field === 'id') {
      return trimmed;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed) || trimmed === 'true' || trimmed === 'false') {
      return trimmed;
    }
    return `'${trimmed}'`;
  }

  private isODataQueryOption(value: string): boolean {
    return [
      '$apply', '$batch', '$compute', '$count', '$expand', '$filter', '$format', '$it', '$metadata',
      '$orderby', '$resultFormat', '$root', '$search', '$select', '$skip', '$skiptoken', '$top',
    ].includes(value);
  }
}
