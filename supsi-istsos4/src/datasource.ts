import {
  DataSourceInstanceSettings,
  CoreApp,
  ScopedVars,
  DataQueryRequest,
  DataQueryResponse,
  TestDataSourceResponse,
  FieldType,
  createDataFrame,
  DataSourceApi,
  DataFrame,
  MetricFindValue,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';

import { IstSOS4Query, MyDataSourceOptions, DEFAULT_QUERY, SensorThingsResponse } from './types';
import { buildApiUrl } from './queryBuilder';

import { compareEntityNames, searchExpandEntity } from './utils/utils';
import { transformDatastreams } from './transformations/datastream';
import { transformThings } from 'transformations/thing';
import { transformSensors } from 'transformations/sensor';
import { transformObservedProperties } from 'transformations/observedProperty';
import { transformLocations } from 'transformations/location';
import { transformHistoricalLocations } from 'transformations/historicalLocations';
import { transformFeatureOfInterest } from 'transformations/featureOfInterest';
import { transformObservations } from 'transformations/observations';

export class DataSource extends DataSourceApi<IstSOS4Query, MyDataSourceOptions> {
  url?: string;

  constructor(private instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.url = instanceSettings.url;
  }

  getDefaultQuery(_: CoreApp): Partial<IstSOS4Query> {
    return DEFAULT_QUERY;
  }

  private externalBaseUrl(): string {
    const apiUrl = this.instanceSettings.jsonData.apiUrl || '';
    const path = this.instanceSettings.jsonData.path || '';
    return `${apiUrl}${path}`;
  }

  private proxyBaseUrl(): string {
    const routePath = this.instanceSettings.jsonData.authType === 'oauth2' ? '/sensorapi-oauth2' : '/sensorapi';
    const path = this.instanceSettings.jsonData.path || '';
    return `${this.url}${routePath}${path}`;
  }

  private async fetchSensorThingsUrl(url: string): Promise<any> {
    const requestUrl =
      this.instanceSettings.jsonData.authType === 'oauth2'
        ? `/api/datasources/uid/${this.instanceSettings.uid}/resources/proxy?url=${encodeURIComponent(url)}`
        : url;

    return firstValueFrom(
      getBackendSrv().fetch({
        url: requestUrl,
        method: 'GET',
      })
    );
  }

  /**
   * Method to handle pagination for SensorThings API responses
   * Handles both single entity responses (when entityId is specified) and multiple entities responses
   * Also handles pagination for expanded Observations within entities
   * @param baseUrl The base API URL
   * @param query The query object
   * @returns Combined response with all paginated data
   */
  private async fetchAllPages(baseUrl: string, query: IstSOS4Query): Promise<SensorThingsResponse> {
    const modifiedQuery = { ...query };
    const hasEntityId = modifiedQuery.entityId !== undefined;
    const topDefined = modifiedQuery.top !== undefined;
    const followNextLink = modifiedQuery.followNextLink ?? true;

    if (!topDefined && !hasEntityId && this.instanceSettings.jsonData.defaultTop) {
      modifiedQuery.top = this.instanceSettings.jsonData.defaultTop;
    }
    const hasExpandedObservations =
      modifiedQuery.expand?.some((exp) => exp.entity === 'Observations') ||
      (modifiedQuery.expression && searchExpandEntity(modifiedQuery.expression, 'Observations'));
    if (hasExpandedObservations) {
      modifiedQuery.expand = modifiedQuery.expand?.map((exp) => {
        if (exp.entity === 'Observations') {
          return {
            ...exp,
            subQuery: {
              ...exp.subQuery,
              top: this.instanceSettings.jsonData.defaultExpandedObservationsTop || 1000,
            },
          };
        }
        return exp;
      });
    }
    const queryURL = buildApiUrl(baseUrl, modifiedQuery);
    const allData: any[] = [];
    let nextUrl: string | undefined = queryURL;
    let responseNextLink: string | undefined;

    while (nextUrl) {
      let cleanUrl = nextUrl;

      if (allData.length > 0) {
        const urlParts = nextUrl.split(this.instanceSettings.jsonData.apiUrl + '/' || '');
        if (urlParts.length > 1) {
          const pathToEncode = urlParts[1];
          const encodedPath = encodeURIComponent(pathToEncode);
          cleanUrl = `${baseUrl}/${encodedPath}`;
        }
      }
      const response: any = await this.fetchSensorThingsUrl(cleanUrl);

      const pageData: any = response?.data;
      if (!pageData) {
        break;
      }

      if (hasEntityId) {
        if (pageData['@iot.id'] !== undefined) {
          if (hasExpandedObservations && pageData.Observations) {
            await this.handleExpandedObservationsPagination(pageData, baseUrl, followNextLink);
          }
          allData.push(pageData);
        }
        break;
      } else {
        if (!pageData.value || !Array.isArray(pageData.value)) {
          break;
        }
        if (hasExpandedObservations) {
          for (const entity of pageData.value) {
            if (entity.Observations) {
              await this.handleExpandedObservationsPagination(entity, baseUrl, followNextLink);
            }
          }
        }
        allData.push(...pageData.value);
        responseNextLink = pageData['@iot.nextLink'];
        nextUrl = followNextLink ? responseNextLink : undefined;
      }
    }

    return {
      value: allData,
      '@iot.count': allData.length,
      '@iot.nextLink': followNextLink ? undefined : responseNextLink,
    };
  }

  /**
   * Handle pagination for expanded Observations within an entity
   * @param entity The entity containing expanded Observations
   * @param baseUrl The base API URL
   */
  private async handleExpandedObservationsPagination(
    entity: any,
    baseUrl: string,
    followNextLink: boolean
  ): Promise<void> {
    if (!entity.Observations || !Array.isArray(entity.Observations)) {
      return;
    }
    let nextObservationsUrl = entity['Observations@iot.nextLink'];
    if (!nextObservationsUrl || !followNextLink) {
      return;
    }

    const allObservations = [...entity.Observations];

    while (nextObservationsUrl) {
      const urlParts = nextObservationsUrl.split(this.instanceSettings.jsonData.apiUrl + '/' || '');
      if (urlParts.length > 1) {
        const pathToEncode = urlParts[1];
        const encodedPath = encodeURIComponent(pathToEncode);
        const cleanUrl = `${baseUrl}/${encodedPath}`;

        try {
          const response: any = await this.fetchSensorThingsUrl(cleanUrl);

          const observationsData: any = response?.data;
          if (!observationsData || !observationsData.value || !Array.isArray(observationsData.value)) {
            break;
          }

          allObservations.push(...observationsData.value);
          nextObservationsUrl = observationsData['@iot.nextLink'];
        } catch {
          break;
        }
      }

      entity.Observations = allObservations;
      delete entity['Observations@iot.nextLink'];
    }
  }
  /*
  Function for Custom Query Expression Variable Subsitutation(focus on the $vars within Single quotes)
  */
  private applyCustomVariableSubstitution(expression: string, scopedVars: ScopedVars): string {
    if (!expression) {
      return expression;
    }

    const expressionWithExpandedComparisons = expression.replace(
      /([A-Za-z_][A-Za-z0-9_/@.]*)\s+(eq|ne)\s+'([^']*\$[^']*)'/g,
      (match, field, operator, quotedContent) => {
        const substituted = getTemplateSrv().replace(quotedContent, scopedVars, 'csv');
        if (!substituted.includes(',')) {
          return `${field} ${operator} ${this.formatCustomExpressionValue(field, substituted)}`;
        }

        const values = substituted
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

        if (values.length === 0) {
          return match;
        }

        const joinOperator = operator === 'eq' ? ' or ' : ' and ';
        return `(${values
          .map((value) => `${field} ${operator} ${this.formatCustomExpressionValue(field, value)}`)
          .join(joinOperator)})`;
      }
    );

    const expressionWithQuotedVariables = expressionWithExpandedComparisons.replace(/'([^']*\$[^']*)'/g, (match, quotedContent) => {
      const substituted = getTemplateSrv().replace(quotedContent, scopedVars);
      if (substituted.includes(',')) {
        const values = substituted.split(',').map(val => val.trim());
        return `'${values.join("','")}'`;
      }
      return `'${substituted}'`;
    });

    return expressionWithQuotedVariables.replace(/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/g, (match) => {
      if (this.isODataQueryOption(match)) {
        return match;
      }

      return getTemplateSrv().replace(match, scopedVars, 'csv');
    });
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
      '$apply',
      '$batch',
      '$compute',
      '$count',
      '$expand',
      '$filter',
      '$format',
      '$it',
      '$metadata',
      '$orderby',
      '$resultFormat',
      '$root',
      '$search',
      '$select',
      '$skip',
      '$skiptoken',
      '$top',
    ].includes(value);
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

  private applyFilterValueVariableSubstitution(value: any, scopedVars: ScopedVars): any {
    if (typeof value !== 'string' || !value.includes('$')) {
      return value;
    }

    return getTemplateSrv().replace(value, scopedVars, 'csv').trim();
  }

  // Apply Variables Subsitutation
  // - if query.expression is defined, then it applies template variable substitution on the expression only
  // - else it applies the filters defined in the Variable filters
  applyTemplateVariables(query: IstSOS4Query, scopedVars: ScopedVars) {
    let modifiedQuery = {
      ...query,
      alias: query.alias ? getTemplateSrv().replace(query.alias, scopedVars) : query.alias,
    };

    modifiedQuery.entityId = this.applyEntityIdVariableSubstitution(modifiedQuery.entityId, scopedVars);

    if (modifiedQuery.expression) {
      modifiedQuery.expression = this.applyCustomVariableSubstitution(modifiedQuery.expression, scopedVars);
    }

    if (modifiedQuery.filters) {
      modifiedQuery.filters = modifiedQuery.filters
        .map((filter) => {
          const filterWithVariables = {
            ...filter,
            value: this.applyFilterValueVariableSubstitution(filter.value, scopedVars),
          } as any;
          if ('startDate' in filterWithVariables) {
            filterWithVariables.startDate = this.applyFilterValueVariableSubstitution(
              filterWithVariables.startDate,
              scopedVars
            );
          }
          if ('endDate' in filterWithVariables) {
            filterWithVariables.endDate = this.applyFilterValueVariableSubstitution(
              filterWithVariables.endDate,
              scopedVars
            );
          }

          if (filter.type !== 'variable') {
            return filterWithVariables;
          }
          const variableFilter = filterWithVariables as any;
          const variableValue = getTemplateSrv().replace(variableFilter.variableName, scopedVars);
          if (!variableValue || variableValue === variableFilter.variableName) {
            return { ...variableFilter, value: null };
          }

          if (compareEntityNames(variableFilter.entity, query.entity)) {
            if (/^\d+$/.test(variableValue)) {
              const numericValue = Number(variableValue);
              modifiedQuery.entityId = numericValue;
              return null;
            }
            throw new Error(`Variable ${variableFilter.variableName} must resolve to a single numeric entity ID.`);
          }
          return { ...variableFilter, value: variableValue };
        })

        .filter(Boolean);
    }

    return modifiedQuery;
  }

  filterQuery(query: IstSOS4Query): boolean {
    return !!query.entity;
  }
  /**
   * transformResponse: weather to transform the response into Grafana data frames or return raw data.
   * If true, the response will be transformed into Grafana data frames.
   * it maybe useful for intermediate requests (when we do not need to display the response in Grafana panels).
   * Default Grafana function that is get triggered when hitting the RunQuery button
   */
  async query(options: DataQueryRequest<IstSOS4Query>, transformResponse = true): Promise<DataQueryResponse> {
    const promises = options.targets.map(async (target) => {
      if (!this.filterQuery(target)) {
        return createDataFrame({ fields: [] });
      }

      try {
        const query = this.applyTemplateVariables(target, options.scopedVars);
        if (query.useGrafanaTimeRange) {
          query.fromTo = {
            from: options.range.from.toISOString(),
            to: options.range.to.toISOString(),
          };
        }
        const baseUrl =
          this.instanceSettings.jsonData.authType === 'oauth2' ? this.externalBaseUrl() : this.proxyBaseUrl();
        const combinedResponse = await this.fetchAllPages(baseUrl, query);
        if (transformResponse) {
          const result = this.transformResponse({ data: combinedResponse }, query);
          return Array.isArray(result) ? result : [result];
        } else {
          return createDataFrame({
            refId: target.refId,
            name: target.alias || target.entity,
            fields: [
              {
                name: 'entities',
                type: FieldType.other,
                values: [combinedResponse.value || []],
              },
            ],
            meta: {
              custom: {
                rawResponse: combinedResponse,
                count: combinedResponse['@iot.count'],
                nextLink: combinedResponse['@iot.nextLink'],
              },
            },
          });
        }
      } catch (error) {
        return createDataFrame({
          refId: target.refId,
          fields: [],
          meta: {
            notices: [
              { severity: 'error', text: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
            ],
          },
        });
      }
    });
    const results = await Promise.all(promises);
    const data = results.flat();
    return { data };
  }
  /*
  Function to test the API that is being entered by the user
  Grafana Specific
  */
  async testDatasource(): Promise<TestDataSourceResponse> {
    try {
      const config = this.instanceSettings.jsonData;
      if (!config.apiUrl) {
        return {
          status: 'error',
          message: 'API URL is required',
        };
      }
      if (config.authType === 'oauth2') {
        if (!config.oauth2TokenUrl) {
          return {
            status: 'error',
            message: 'OAuth2 token URL is required',
          };
        }

        if (!config.oauth2Username) {
          return {
            status: 'error',
            message: 'OAuth2 username is required',
          };
        }
      }
      try {
        const testUrl = `${config.authType === 'oauth2' ? this.externalBaseUrl() : this.proxyBaseUrl()}/`;
        const response = await this.fetchSensorThingsUrl(testUrl);

        return {
          status: 'success',
          message: `Successfully connected to SensorThings API! Response status: ${response.status || 200}`,
        };
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error) {
          const errorResponse = error as any;
          if (errorResponse.status === 400) {
            return {
              status: 'error',
              message: 'Authentication to data source failed. Please verify your OAuth2 configuration.',
            };
          }
          if (errorResponse.status === 401) {
            return {
              status: 'error',
              message: 'OAuth2 authentication failed. Please check your credentials.',
            };
          }
          if (errorResponse.status === 404) {
            return {
              status: 'error',
              message: 'API endpoint not found. Please check your API URL and path.',
            };
          }
        }

        return {
          status: 'error',
          message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  /*
   * Grafana specific function that gets called on Variable editor changes
     Logic that should be triggered on change in Variable QueryEditor should be applied here
   */
  async metricFindQuery(query: IstSOS4Query, options?: any): Promise<MetricFindValue[]> {
    const modifiedQuery = this.applyTemplateVariables(query, options?.scopedVars);
    try {
      const baseUrl =
        this.instanceSettings.jsonData.authType === 'oauth2' ? this.externalBaseUrl() : this.proxyBaseUrl();
      const responseData = await this.fetchAllPages(baseUrl, modifiedQuery);
      if (!responseData.value || !Array.isArray(responseData.value)) {
        return [];
      }
      const result = responseData.value.map((entity: any) => {
        let text = entity.name || entity['@iot.id']?.toString() || '';
        let value = entity['@iot.id']?.toString() || '';
        return { text, value };
      });
      return result;
    } catch {
      return [];
    }
  }

  // Transform SensorThings API response to Grafana data frames
  private transformResponse(response: any, target: IstSOS4Query): DataFrame | DataFrame[] {
    const data = response.data as SensorThingsResponse;
    switch (target.entity) {
      case 'Observations':
        return transformObservations(data, target);
      case 'Datastreams':
        return transformDatastreams(data, target);
      case 'Things':
        return transformThings(data, target);
      case 'Locations':
        return transformLocations(data, target);
      case 'Sensors':
        return transformSensors(data, target);
      case 'ObservedProperties':
        return transformObservedProperties(data, target);
      case 'FeaturesOfInterest':
        return transformFeatureOfInterest(data, target);
      case 'HistoricalLocations':
        return transformHistoricalLocations(data, target);
      default:
        return this.transformGeneric(data, target);
    }
  }

  // Fallback Transform function that gets the common fields on all entities
  private transformGeneric(data: SensorThingsResponse, target: IstSOS4Query) {
    if (!data.value || data.value.length === 0) {
      return createDataFrame({
        refId: target.refId,
        name: target.alias || target.entity,
        fields: [],
      });
    }

    const firstItem = data.value[0];
    const fields: any[] = [];

    if (firstItem['@iot.id'] !== undefined) {
      fields.push({
        name: 'id',
        type: FieldType.number,
        values: data.value.map((item: any) => item['@iot.id']),
      });
    }

    if (firstItem.name !== undefined) {
      fields.push({
        name: 'name',
        type: FieldType.string,
        values: data.value.map((item: any) => item.name || ''),
      });
    }
    if (firstItem.description !== undefined) {
      fields.push({
        name: 'description',
        type: FieldType.string,
        values: data.value.map((item: any) => item.description || ''),
      });
    }
    if (fields.length === 0) {
      fields.push({
        name: 'data',
        type: FieldType.string,
        values: data.value.map((item: any) => JSON.stringify(item)),
      });
    }
    return createDataFrame({
      refId: target.refId,
      name: target.alias || target.entity,
      fields,
      meta: {
        custom: {
          count: data['@iot.count'],
          nextLink: data['@iot.nextLink'],
        },
      },
    });
  }
}
