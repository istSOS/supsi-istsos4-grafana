import { IstSOS4Query, SensorThingsResponse } from 'types';
import { createDataFrame, FieldType } from '@grafana/data';
import { getTransformedGeometry } from './generic';

export function transformLocations(data: SensorThingsResponse | any, target: IstSOS4Query) {
  const geojsonValues: string[] = [];
  const locationIds: number[] = [];
  const locationNames: string[] = [];
  const locationDescriptions: string[] = [];
  const locationTypes: string[] = [];
  const thingIds: number[] = [];
  const thingNames: string[] = [];
  const thingDescriptions: string[] = [];

  const locations = data.value;

  locations.forEach((location: any) => {
    let transformedGeometry: any = getTransformedGeometry(location.location);
    if (transformedGeometry) {
      if (location.Things && location.Things.length > 0) {
        location.Things.forEach((thing: any) => {
          geojsonValues.push(JSON.stringify(transformedGeometry));
          locationIds.push(location['@iot.id']);
          locationNames.push(location.name || '');
          locationDescriptions.push(location.description || '');
          locationTypes.push(location.location.type);
          thingIds.push(thing['@iot.id']);
          thingNames.push(thing.name || '');
          thingDescriptions.push(thing.description || '');
        });
      }
      else {
        geojsonValues.push(JSON.stringify(transformedGeometry));
        locationIds.push(location['@iot.id']);
        locationNames.push(location.name || '');
        locationDescriptions.push(location.description || '');
        locationTypes.push(location.location.type);
      } 
    }
  });

  const fields = [
    {
      name: 'geojson',
      type: FieldType.string,
      values: geojsonValues,
      config: {
        displayName: 'Geometry',
      },
    },
    {
      name: 'location_id',
      type: FieldType.number,
      values: locationIds,
      config: {
        displayName: 'Location ID',
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
      name: 'location_description',
      type: FieldType.string,
      values: locationDescriptions,
      config: {
        displayName: 'Description',
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
  ];
  if (thingIds.length > 0) {
    fields.push(
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
          displayName: 'Thing Description',
        },
      }
    );
  }

  return createDataFrame({
    refId: target.refId,
    name: target.alias || 'Locations',
    fields,
  });
}
