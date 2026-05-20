import React, { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-fullscreen/dist/leaflet.fullscreen.css';
import 'leaflet-fullscreen';

import { TerraDraw } from 'terra-draw';
import { TerraDrawLeafletAdapter } from 'terra-draw-leaflet-adapter';
import { TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawLineStringMode } from 'terra-draw';

interface MapWithTerraDrawProps {
  geometryType: 'Point' | 'Polygon' | 'LineString';
  onCoordinatesChange: (coordinates: any) => void;
  initialCoordinates?: any;
}

export const MapWithTerraDraw: React.FC<MapWithTerraDrawProps> = ({ 
  geometryType, 
  onCoordinatesChange, 
  initialCoordinates 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  const terraDrawRef = useRef<TerraDraw | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    const map = L.map(mapRef.current, {
      fullscreenControl: true,
    }).setView([30, 30], 4);
    mapInst.current = map;
    map.on('fullscreenchange', () => {
      map.invalidateSize();
    });
    setTimeout(() => map.invalidateSize(), 0);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const adapter = new TerraDrawLeafletAdapter({ map, lib: L });
    const terraDraw = new TerraDraw({
      adapter,
      modes: [new TerraDrawPointMode(), new TerraDrawPolygonMode(), new TerraDrawLineStringMode()],
    });
    terraDrawRef.current = terraDraw;
    terraDraw.start();
    return () => {
      if (terraDrawRef.current) {
        terraDrawRef.current.stop();
      }
      map.remove();
    };
  }, []);
  useEffect(() => {
    if (terraDrawRef.current) {
      let mode: string;
      switch (geometryType) {
        case 'Point':
          mode = 'point';
          break;
        case 'Polygon':
          mode = 'polygon';
          break;
        case 'LineString':
          mode = 'linestring';
          break;
        default:
          mode = 'point';
      }
      terraDrawRef.current.setMode(mode);
    }
  }, [geometryType]);
  useEffect(() => {
    if (!terraDrawRef.current || !mapInst.current) return;

    const handleChange = () => {
      if (!terraDrawRef.current) return;
      
      const snapshot = terraDrawRef.current.getSnapshot();
      console.log('TerraDraw snapshot:', snapshot);
      
      if (snapshot.length > 0) {
        const feature = snapshot[snapshot.length - 1];
         // Get the latest feature, This is the current drawing state
         // There is no support for holes
         // Users who wants to query Polygons with holes should use Custom Queries
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon') {
          const outerRing = geometry.coordinates[0];
          onCoordinatesChange(outerRing);
        } else onCoordinatesChange(geometry.coordinates);
      
      }
    };
    const map = mapInst.current;
    map.on('click', handleChange);
    
    return () => {
      map.off('click', handleChange);
    };
  }, [onCoordinatesChange]);

  return (
    <div
      ref={mapRef}
      style={{
        height: '360px',
        width: '100%',
        minWidth: 0,
        border: '1px solid #ccc',
        borderRadius: '4px',
        marginTop: '10px',
      }}
    />
  );
};
