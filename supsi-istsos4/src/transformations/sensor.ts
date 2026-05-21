import { SensorThingsResponse, IstSOS4Query } from 'types';
import { createDataFrame } from '@grafana/data';
import { transformBasicEntity, transformEntityWithDatastreams } from './generic';
import { searchExpandEntity } from 'utils/utils';

export function transformSensors(data: SensorThingsResponse | any, target: IstSOS4Query) {
  if (!data || (Array.isArray(data.value) && data.value.length === 0)) {
    return createDataFrame({
      refId: target.refId,
      name: target.alias || 'Sensors',
      fields: [],
    });
  }
  const sensors: any [] = data.value;
  const hasExpandedDatastreams = target.expand?.some((exp) => exp.entity === 'Datastreams') || (target.expression && searchExpandEntity(target.expression, 'Datastreams'));
  if (hasExpandedDatastreams) {
    return transformEntityWithDatastreams(sensors, target);
  }
  return transformBasicEntity(sensors, target);
}
