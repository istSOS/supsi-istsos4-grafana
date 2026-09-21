import { DataSourceInstanceSettings, dataFrameToJSON, toDataFrame } from '@grafana/data';
import { BackendSrv, FetchResponse, config, setBackendSrv } from '@grafana/runtime';
import { Subject, of, throwError } from 'rxjs';

import { DataSource } from './datasource';
import { IstSOS4Query, MyDataSourceOptions } from './types';

const query: IstSOS4Query = { refId: 'VariableQuery', entity: 'Datastreams' };
const settings = {
  id: 1,
  uid: 'istsos4',
  type: 'supsi-istsos4-datasource',
  jsonData: {},
} as DataSourceInstanceSettings<MyDataSourceOptions>;

function variableResponse(texts = ['Temperature'], values = ['42']) {
  return {
    status: 200,
    data: {
      results: {
        VariableQuery: {
          frames: [
            dataFrameToJSON(
              toDataFrame({
                fields: [
                  { name: 'text', values: texts },
                  { name: 'value', values },
                ],
              })
            ),
          ],
        },
      },
    },
  } as FetchResponse;
}

describe('dashboard variable loading', () => {
  const fetch = jest.fn();
  let datasource: DataSource;

  beforeEach(() => {
    fetch.mockReset();
    config.featureToggles = {};
    setBackendSrv({ fetch } as unknown as BackendSrv);
    datasource = new DataSource(settings);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns variable labels and IDs', async () => {
    fetch.mockReturnValue(of(variableResponse()));
    await expect(datasource.metricFindQuery(query)).resolves.toEqual([{ text: 'Temperature', value: '42' }]);
  });

  it('allows a successful query with no matching entities', async () => {
    fetch.mockReturnValue(of(variableResponse([], [])));
    await expect(datasource.metricFindQuery(query)).resolves.toEqual([]);
  });

  it('reports backend query errors instead of returning an empty dropdown', async () => {
    fetch.mockReturnValue(
      of({
        status: 200,
        data: { results: { VariableQuery: { error: 'SensorThings API returned HTTP 503', status: 500 } } },
      })
    );
    await expect(datasource.metricFindQuery(query)).rejects.toThrow('SensorThings API returned HTTP 503');
  });

  it('reports failed HTTP requests instead of returning an empty dropdown', async () => {
    fetch.mockReturnValue(throwError(() => ({ status: 504, statusText: 'Gateway Timeout' })));
    await expect(datasource.metricFindQuery(query)).rejects.toThrow('Gateway Timeout');
  });

  it('keeps simultaneous variable requests alive, including across datasource instances', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123456789);
    const pending = new Map<string, Subject<FetchResponse>>();
    fetch.mockImplementation(({ requestId }: { requestId: string }) => {
      // Grafana cancels an in-flight request when a new one uses the same requestId.
      pending.get(requestId)?.error({ status: -1, statusText: 'Request was aborted', cancelled: true });
      const response = new Subject<FetchResponse>();
      pending.set(requestId, response);
      return response;
    });

    const requests = Promise.all([
      datasource.metricFindQuery(query),
      datasource.metricFindQuery(query),
      new DataSource(settings).metricFindQuery(query),
    ]);
    for (const response of pending.values()) {
      response.next(variableResponse());
      response.complete();
    }

    await expect(requests).resolves.toEqual([
      [{ text: 'Temperature', value: '42' }],
      [{ text: 'Temperature', value: '42' }],
      [{ text: 'Temperature', value: '42' }],
    ]);
  });
});
