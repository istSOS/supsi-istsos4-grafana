import proj4 from 'proj4';
import { GrafanaTheme2,SelectableValue} from '@grafana/data';
import { css } from '@emotion/css';
import { EntityType } from 'types';
import {
  SENSORS_EXPAND_OPTIONS,
  THINGS_EXPAND_OPTIONS,
  DATASTREAMS_EXPAND_OPTIONS,
  OBSERVED_PROPERTIES_EXPAND_OPTIONS,
  FEATURE_OF_INTEREST_EXPAND_OPTIONS,
  LOCATIONS_EXPAND_OPTIONS,
  OBSERVATIONS_EXPAND_OPTIONS,
  HISTORICAL_LOCATIONS_EXPAND_OPTIONS,
} from './constants';

// common registrations
proj4.defs([
  [
    "EPSG:4326", // WGS84
    "+proj=longlat +datum=WGS84 +no_defs"
  ],
  [
    "EPSG:3857", // Web Mercator
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"
  ],
  [
    "EPSG:2056", // Swiss LV95
    "+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs"
  ]
]);

// Helper to load known definitions
function loadCRSDefinition(epsgCode: string): void {
  if (proj4.defs(epsgCode)) {
    return;
  }
  // For now, throw an error for unsupported CRS
  // In the future, this could fetch from epsg.io
  throw new Error(`CRS definition for ${epsgCode} not supported currently`);
}

export function convertToWGS84(
  crs: string,
  coordinates: [number, number]
): [number, number] {
  try {
    loadCRSDefinition(crs);
    console.log(`Converting coordinates from ${crs} to EPSG:4326:`, coordinates);    
    const result = proj4(crs, "EPSG:4326", coordinates);
    console.log(`Converted result:`, result);
    return result;
  } catch (error) {
    console.error("Error in coordinate conversion:", error);
    return [NaN, NaN];
  }
}
export const formatPhenomenonTime = (phenomenonTime: string | null | undefined): string => {
  if (!phenomenonTime) {
    return '';
  }
  try {
    // Handle time intervals ("2023-01-01T00:00:00Z/2023-01-02T00:00:00Z")
    // This handles Datastreams (usually a time interval with / between start and end times)
    if (phenomenonTime.includes('/')) {
      const [startTime, endTime] = phenomenonTime.split('/');
      const startFormatted = new Date(startTime).toLocaleString();
      const endFormatted = new Date(endTime).toLocaleString();
      return `${startFormatted} to ${endFormatted}`;
    }
    // Handle single timestamp
    // This handles Observations (usually a single timestamp)
    const date = new Date(phenomenonTime);
    return date.toLocaleString();
  } catch (error) {
    console.warn('Error formatting phenomenon time:', error);
    return phenomenonTime;
  }
};
/*
  Removes the last character from queryEntity to match variableEntity
  currently following this approach to modify in the future in one place
*/
export const compareEntityNames = (variableEntity: string | undefined, queryEntity: string | undefined): boolean => {
  if (!variableEntity || !queryEntity) {
    return false;
  }
  if (queryEntity === 'ObservedProperties') return variableEntity === 'ObservedProperty';
  return variableEntity === queryEntity.slice(0, -1);
};
/*
Gets the coordinates as an array from a string(WKT format) 
*/
export const parseCoordinateString = (coordStr: string): [number, number][] => {
  if (!coordStr.trim()) return [];

  const coords = coordStr
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
  const pairs: [number, number][] = [];

  for (let i = 0; i < coords.length - 1; i += 2) {
    if (i + 1 < coords.length) {
      pairs.push([coords[i], coords[i + 1]]);
    }
  }

  return pairs;
};

export const ensureClosedRing = (coords: [number, number][]): [number, number][] => {
  if (coords.length === 0) return coords;

  const first = coords[0];
  const last = coords[coords.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, first];
  }

  return coords;
};

export const searchExpandEntity = (expression: string, entityType: string): boolean => {
  if (!expression || !entityType) {
    return false;
  }
  const expandMatch = expression.match(/\$expand=([^&]*)/);
  if (!expandMatch) {
    return false;
  }
  const expandPart = expandMatch[1];

  const expandedEntities = expandPart.split(',').map((e) => {
    const trimmed = e.trim();
    const bracketIndex = trimmed.indexOf('(');
    return bracketIndex !== -1 ? trimmed.substring(0, bracketIndex) : trimmed;
  });
  return expandedEntities.includes(entityType);
};

export const getSingularEntityName = (entity: string): string => {
  if (entity === 'ObservedProperties') {
    return 'ObservedProperty';
  }
  return entity.slice(0, -1);
};

export const getStyles = (theme: GrafanaTheme2) => {
  return {
    searchRow: css`
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      align-items: center;
    `,
    tableContainer: css`
      max-height: 300px;
      overflow: auto;
      border: 1px solid ${theme.colors.border.medium};
      border-radius: ${theme.shape.borderRadius()};
    `,
    table: css`
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid ${theme.colors.border.weak};
      }

      th {
        background-color: ${theme.colors.background.secondary};
        position: sticky;
        top: 0;
        z-index: 1;
      }

      tr:hover {
        background-color: ${theme.colors.background.secondary};
      }
    `,
    descriptionCell: css`
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,
    emptyState: css`
      text-align: center;
      padding: 20px;
      color: ${theme.colors.text.secondary};
    `,
    queryEditorGrid: css`
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: ${theme.spacing(2)};
      align-items: start;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    `,
    queryPreview: css`
      padding: 8px;
      background-color: ${theme.colors.background.secondary};
      border-radius: ${theme.shape.borderRadius()};
      font-family: monospace;
      font-size: 14px;
      color: ${theme.colors.text.primary};
      border: 1px solid ${theme.colors.border.medium};
      max-height: 120px;
      overflow-y: auto;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    `,
    filterButton: css`
      margin-top: ${theme.spacing(1)};
      margin-right: ${theme.spacing(1)};
    `,
    validationMessage: css`
      color: ${theme.colors.error.text};
      font-size: ${theme.typography.bodySmall.fontSize};
      margin: ${theme.spacing(0.5)} 0 ${theme.spacing(1)};
    `,
  };
};

export function getExpandOptions(type: EntityType): SelectableValue<EntityType>[] {
  switch (type) {
    case 'Things':
      return THINGS_EXPAND_OPTIONS;
    case 'Datastreams':
      return DATASTREAMS_EXPAND_OPTIONS;
    case 'Sensors':
      return SENSORS_EXPAND_OPTIONS;
    case 'ObservedProperties':
      return OBSERVED_PROPERTIES_EXPAND_OPTIONS;
    case 'FeaturesOfInterest':
      return FEATURE_OF_INTEREST_EXPAND_OPTIONS;
    case 'Locations':
      return LOCATIONS_EXPAND_OPTIONS;
    case 'HistoricalLocations':
      return HISTORICAL_LOCATIONS_EXPAND_OPTIONS;
    case 'Observations':
      return OBSERVATIONS_EXPAND_OPTIONS;
    default:
      return [];
  }
}
