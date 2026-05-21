import { SensorThingsResponse, IstSOS4Query } from 'types';
import { createDataFrame, FieldType } from '@grafana/data';
import { transformBasicEntity, transformEntityWithDatastreams, getTransformedGeometry } from './generic';
import { searchExpandEntity } from 'utils/utils';
function transformThingsWithLocations(things: any[], target: IstSOS4Query) {
  console.log("Transforming Things with Locations");
  const geojsonValues: string[] = [];
  const thingIds: number[] = [];
  const thingNames: string[] = [];
  const thingDescriptions: string[] = [];
  const locationNames: string[] = [];
  const locationTypes: string[] = [];

  things.forEach((thing: any, index: number) => {
    if (thing.Locations && thing.Locations.length > 0) {
      thing.Locations.forEach((location: any) => {
        let transformedGeometry: any = getTransformedGeometry(location.location);
        if (transformedGeometry) {
          geojsonValues.push(JSON.stringify(transformedGeometry));
          thingIds.push(thing['@iot.id']);
          thingNames.push(thing.name || '');
          thingDescriptions.push(thing.description || '');
          locationNames.push(location.name || '');
          locationTypes.push(location.location.type);
        }
      });
    }
  });

  return createDataFrame({
    refId: target.refId,
    name: target.alias || 'Things with Polygons',
    fields: [
      {
        name: 'geojson',
        type: FieldType.string,
        values: geojsonValues,
        config: {
          displayName: 'Geometry',
        },
      },
      {
        name: 'thing_id',
        type: FieldType.number,
        values: thingIds,
        config: {
          displayName: 'Thing ID',
        },
      },
      {
        name: 'thing_name',
        type: FieldType.string,
        values: thingNames,
        config: {
          displayName: 'Thing Name',
        },
      },
      {
        name: 'thing_description',
        type: FieldType.string,
        values: thingDescriptions,
        config: {
          displayName: 'Description',
        },
      },
      {
        name: 'location_name',
        type: FieldType.string,
        values: locationNames,
        config: {
          displayName: 'Location Name',
        },
      },
      {
        name: 'location_type',
        type: FieldType.string,
        values: locationTypes,
        config: {
          displayName: 'Geometry Type',
        },
      },
    ],
  });
}

function transformThingsWithHistoricalLocations(things: any[], target: IstSOS4Query) {
  const geojsonValues: string[] = [];
  const thingIds: number[] = [];
  const thingNames: string[] = [];
  const thingDescriptions: string[] = [];
  const locationNames: string[] = [];
  const locationTypes: string[] = [];
  const timeValues: number[] = [];
  things.forEach((thing: any) => {
    if (thing.HistoricalLocations && thing.HistoricalLocations.length > 0) {
      thing.HistoricalLocations.forEach((histLoc: any) => {
        if (histLoc.Locations && histLoc.Locations.length > 0) {
          histLoc.Locations.forEach((location: any) => {
            let transformedGeometry: any = getTransformedGeometry(location.location);
            if (transformedGeometry) {
              geojsonValues.push(JSON.stringify(transformedGeometry));
              thingIds.push(thing['@iot.id']);
              thingNames.push(thing.name || '');
              thingDescriptions.push(thing.description || '');
              locationNames.push(location.name || '');
              locationTypes.push(location.location.type);
              timeValues.push(new Date(histLoc.time).getTime());
            }
          });
        }
      });
    }
  });

  return createDataFrame({
    refId: target.refId,
    name: target.alias || 'Things Historical Locations',
    fields: [
      {
        name: 'geojson',
        type: FieldType.string,
        values: geojsonValues,
        config: {
          displayName: 'Geometry',
        },
      },
      {
        name: 'thing_id',
        type: FieldType.number,
        values: thingIds,
        config: {
          displayName: 'Thing ID',
        },
      },
      {
        name: 'thing_name',
        type: FieldType.string,
        values: thingNames,
        config: {
          displayName: 'Thing Name',
        },
      },
      {
        name: 'thing_description',
        type: FieldType.string,
        values: thingDescriptions,
        config: {
          displayName: 'Description',
        },
      },
      {
        name: 'historical_location_name',
        type: FieldType.string,
        values: locationNames,
        config: {
          displayName: 'Historical Location Name',
        },
      },
      {
        name: 'location_type',
        type: FieldType.string,
        values: locationTypes,
        config: {
          displayName: 'Geometry Type',
        },
      },
      {
        name: 'time',
        type: FieldType.time,
        values: timeValues,
        config: {
          displayName: 'Time',
        },
      },
    
    ],
  });
}

export function transformThings(data: SensorThingsResponse | any, target: IstSOS4Query) {
  if (!data || (Array.isArray(data.value) && data.value.length === 0)) {
    return createDataFrame({
      refId: target.refId,
      name: target.alias || 'Things',
      fields: [],
    });
  }
  const things=data.value;

const hasExpandedDatastreams =
  target.expand?.some(exp => exp.entity === 'Datastreams') ||
  (target.expression && searchExpandEntity(target.expression, 'Datastreams'));
  const hasExpandedLocations = target.expand?.some((exp) => exp.entity === 'Locations') ||
  (target.expression && searchExpandEntity(target.expression, 'Locations'));
  const hasExpandedHistoricalLocations = target.expand?.some((exp) => exp.entity === 'HistoricalLocations') ||
  (target.expression && searchExpandEntity(target.expression, 'HistoricalLocations'));

  if (hasExpandedDatastreams) {
    return transformEntityWithDatastreams(things, target);
  }
  if (hasExpandedLocations) {
    return transformThingsWithLocations(things, target);
  }
  if (hasExpandedHistoricalLocations) {
    return transformThingsWithHistoricalLocations(things, target);
  }
  return transformBasicEntity(things, target);
}
