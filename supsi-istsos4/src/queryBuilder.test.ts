import { buildODataQuery } from './queryBuilder';
import { IstSOS4Query } from './types';

describe('buildODataQuery expanded Observation result options', () => {
  it('builds the accepted nested filter without grouping parentheses or top-level range parameters', () => {
    const query: IstSOS4Query = {
      refId: 'A',
      entity: 'Datastreams',
      useGrafanaTimeRange: false,
      fromTo: {
        from: '2026-07-14T09:44:25.511Z',
        to: '2026-07-21T09:44:25.511Z',
      },
      filters: [
        {
          id: 'datastream',
          type: 'basic',
          field: '@iot.id',
          operator: 'eq',
          value: 172,
        },
        {
          id: 'result',
          type: 'observation',
          field: 'result',
          operator: 'gt',
          value: -400,
        },
      ],
      select: ['name', 'unitOfMeasurement'],
      expand: [
        {
          entity: 'Observations',
          subQuery: {
            useGrafanaTimeRange: true,
            grafanaTimeRangeField: 'phenomenonTime',
            select: ['result', 'phenomenonTime'],
            orderby: [{ property: 'phenomenonTime', direction: 'asc' }],
            top: 2000,
          },
        },
      ],
    };

    const result = buildODataQuery(query, false);

    expect(result).toBe(
      "?$filter=@iot.id eq 172&$select=@iot.id,name,unitOfMeasurement&$expand=Observations($filter=result gt -400 and phenomenonTime ge '2026-07-14T09:44:25.511Z' and phenomenonTime le '2026-07-21T09:44:25.511Z';$select=result,phenomenonTime;$orderby=phenomenonTime asc;$top=2000)"
    );
    expect(result).not.toContain('$filter=(result gt -400)');
    expect(result).not.toContain('&from=');
    expect(result).not.toContain('&to=');
  });

  it('uses Grafana macros and the selected time field as the default nested order', () => {
    const query: IstSOS4Query = {
      refId: 'A',
      entity: 'Datastreams',
      useGrafanaTimeRange: false,
      expand: [
        {
          entity: 'Observations',
          subQuery: {
            useGrafanaTimeRange: true,
            grafanaTimeRangeField: 'resultTime',
          },
        },
      ],
    };

    expect(buildODataQuery(query, false)).toBe(
      "?$expand=Observations($filter=resultTime ge '${__from:date:iso}' and resultTime le '${__to:date:iso}';$orderby=resultTime)"
    );
  });

  it('keeps all nested result options when multiple entities are expanded', () => {
    const query: IstSOS4Query = {
      refId: 'A',
      entity: 'Datastreams',
      useGrafanaTimeRange: false,
      expand: [
        { entity: 'Sensors' },
        {
          entity: 'Observations',
          subQuery: {
            select: ['result', 'phenomenonTime'],
            orderby: [{ property: 'result', direction: 'desc' }],
            top: 2000,
            skip: 10,
          },
        },
      ],
    };

    expect(buildODataQuery(query, false)).toContain(
      'Observations($select=result,phenomenonTime;$orderby=result desc;$top=2000;$skip=10)'
    );
  });

  it('keeps Datastream name ordering separate from expanded Observation ordering', () => {
    const query: IstSOS4Query = {
      refId: 'A',
      entity: 'Datastreams',
      useGrafanaTimeRange: false,
      orderby: [{ property: 'name', direction: 'asc' }],
      expand: [
        {
          entity: 'Observations',
          subQuery: {
            orderby: [{ property: 'phenomenonTime', direction: 'desc' }],
          },
        },
      ],
    };

    expect(buildODataQuery(query, false)).toBe('?$orderby=name asc&$expand=Observations($orderby=phenomenonTime desc)');
  });
});
