import { createDataFrame, DataFrame, FieldType } from '@grafana/data';
import { SensorThingsResponse, IstSOS4Query } from 'types';
import { searchExpandEntity } from 'utils/utils';
export function transformObservations(data: SensorThingsResponse, target: IstSOS4Query) {
  if (!data || (Array.isArray(data.value) && data.value.length === 0)) {
    return createDataFrame({
      refId: target.refId,
      name: target.alias || 'Observations',
      fields: [],
    });
  }
  const hasExpandedDatastreams =
    target.expand?.some((exp) => exp.entity === 'Datastreams') ||
    (target.expression && searchExpandEntity(target.expression, 'Datastreams'));
  const observations: any[] = data.value;
  if (hasExpandedDatastreams) {
    return transformObservationswithDatastreams(observations, target);
  }
  return transformBasicObservations(observations, target);
}

export function transformObservationswithDatastreams(observations: any[], target: IstSOS4Query): DataFrame | DataFrame[] {
  const observationsByDatastream = new Map<number, { datastream: any; observations: any[] }>();

  observations.forEach((observation: any) => {
    const datastream = observation.Datastream;
    const datastreamId = datastream?.['@iot.id'];
    if (datastreamId === undefined || !observation.phenomenonTime) {
      return;
    }

    const grouped = observationsByDatastream.get(datastreamId) || { datastream, observations: [] };
    grouped.observations.push(observation);
    observationsByDatastream.set(datastreamId, grouped);
  });

  if (shouldUseLatestObservationTable(observationsByDatastream)) {
    return transformLatestObservationTable(observationsByDatastream, target);
  }

  const frames = Array.from(observationsByDatastream.values())
    .map(({ datastream, observations: datastreamObservations }) => {
      const unitOfMeasurement = datastream.unitOfMeasurement || {};
      const unitSymbol = unitOfMeasurement.symbol || '';
      const datastreamName = datastream.name || `Datastream ${datastream['@iot.id']}`;
      const timeValues: number[] = [];
      const resultValues: any[] = [];

      datastreamObservations.forEach((observation: any) => {
        timeValues.push(new Date(observation.phenomenonTime).getTime());
        resultValues.push(observation.result);
      });

      if (timeValues.length === 0) {
        return null;
      }

      return createDataFrame({
        refId: target.refId,
        name: target.alias || datastreamName,
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: timeValues,
          },
          {
            name: unitSymbol || 'value',
            type: FieldType.number,
            values: resultValues,
            config: {
              displayName: unitSymbol ? `${datastreamName} (${unitSymbol})` : datastreamName,
              unit: unitSymbol,
            },
          },
        ],
        meta: {
          custom: {
            datastreamId: datastream['@iot.id'],
            datastreamName,
            observationCount: timeValues.length,
          },
        },
      });
    })
    .filter(Boolean) as DataFrame[];

  return frames.length > 0 ? frames : transformBasicObservations(observations, target);
}

function shouldUseLatestObservationTable(
  observationsByDatastream: Map<number, { datastream: any; observations: any[] }>
): boolean {
  const groups = Array.from(observationsByDatastream.values());
  return groups.length > 0 && groups.every(({ observations }) => observations.length <= 1);
}

function transformLatestObservationTable(
  observationsByDatastream: Map<number, { datastream: any; observations: any[] }>,
  target: IstSOS4Query
): DataFrame {
  const timeValues: number[] = [];
  const parameterValues: string[] = [];
  const resultValues: any[] = [];
  const unitValues: string[] = [];

  observationsByDatastream.forEach(({ datastream, observations }) => {
    const observation = observations[0];
    if (!observation?.phenomenonTime) {
      return;
    }

    const unitOfMeasurement = datastream.unitOfMeasurement || {};
    const datastreamName = datastream.name || `Datastream ${datastream['@iot.id']}`;

    timeValues.push(new Date(observation.phenomenonTime).getTime());
    parameterValues.push(datastreamName);
    resultValues.push(observation.result);
    unitValues.push(unitOfMeasurement.symbol || '');
  });

  return createDataFrame({
    refId: target.refId,
    name: target.alias || 'Latest observations',
    fields: [
      {
        name: 'datetime',
        type: FieldType.time,
        values: timeValues,
      },
      {
        name: 'field',
        type: FieldType.string,
        values: parameterValues,
      },
      {
        name: 'value',
        type: FieldType.number,
        values: resultValues,
      },
      {
        name: 'unit',
        type: FieldType.string,
        values: unitValues,
      },
    ],
    meta: {
      custom: {
        expandedEntities: target.expand?.map((exp) => exp.entity) || [],
        tableType: 'latestObservations',
      },
    },
  });
}

export function transformBasicObservations(observations: any[], target: IstSOS4Query) {
  const timeValues: number[] = [];
  const resultValues: any[] = [];
  observations.forEach((obs: any) => {
    if (obs.phenomenonTime) {
      timeValues.push(new Date(obs.phenomenonTime).getTime());
      resultValues.push(obs.result);
    }
  });

  return createDataFrame({
    refId: target.refId,
    name: target.alias || 'Observations',
    fields: [
      {
        name: 'time',
        type: FieldType.time,
        values: timeValues,
      },
      {
        name: 'value',
        type: FieldType.number,
        values: resultValues,
      },
    ],
  });
}
