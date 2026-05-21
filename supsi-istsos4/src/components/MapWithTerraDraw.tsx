import React, { useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import * as L from 'leaflet';
import 'leaflet-fullscreen';

import { TerraDraw, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawLineStringMode } from 'terra-draw';
import { TerraDrawLeafletAdapter } from 'terra-draw-leaflet-adapter';

interface MapWithTerraDrawProps {
  geometryType: 'Point' | 'Polygon' | 'LineString';
  onCoordinatesChange: (coordinates: any) => void;
  initialCoordinates?: any;
}

const mapContainerClass = css`
  height: 360px;
  width: 100%;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 10px;
  position: relative;

  .leaflet-pane,
  .leaflet-tile,
  .leaflet-marker-icon,
  .leaflet-marker-shadow,
  .leaflet-tile-container,
  .leaflet-pane > svg,
  .leaflet-pane > canvas,
  .leaflet-zoom-box,
  .leaflet-image-layer,
  .leaflet-layer {
    position: absolute;
    left: 0;
    top: 0;
  }

  &.leaflet-container {
    overflow: hidden;
    background: #ddd;
    outline-offset: 1px;
    font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    -webkit-tap-highlight-color: transparent;
  }

  &.leaflet-container a {
    color: #0078a8;
    -webkit-tap-highlight-color: rgba(51, 181, 229, 0.4);
  }

  .leaflet-container .leaflet-overlay-pane svg,
  .leaflet-container .leaflet-marker-pane img,
  .leaflet-container .leaflet-shadow-pane img,
  .leaflet-container .leaflet-tile-pane img,
  .leaflet-container img.leaflet-image-layer,
  .leaflet-container .leaflet-tile {
    max-width: none !important;
    max-height: none !important;
    width: auto;
    padding: 0;
  }

  .leaflet-tile,
  .leaflet-marker-icon,
  .leaflet-marker-shadow {
    user-select: none;
    -webkit-user-drag: none;
  }

  .leaflet-tile {
    filter: inherit;
    visibility: hidden;
  }

  .leaflet-tile-loaded {
    visibility: inherit;
  }

  .leaflet-zoom-box {
    width: 0;
    height: 0;
    box-sizing: border-box;
    z-index: 800;
    border: 2px dotted #38f;
    background: rgba(255, 255, 255, 0.5);
  }

  .leaflet-pane {
    z-index: 400;
  }

  .leaflet-tile-pane {
    z-index: 200;
  }

  .leaflet-overlay-pane {
    z-index: 400;
  }

  .leaflet-shadow-pane {
    z-index: 500;
  }

  .leaflet-marker-pane {
    z-index: 600;
  }

  .leaflet-tooltip-pane {
    z-index: 650;
  }

  .leaflet-popup-pane {
    z-index: 700;
  }

  .leaflet-map-pane canvas {
    z-index: 100;
  }

  .leaflet-map-pane svg {
    z-index: 200;
  }

  .leaflet-control {
    position: relative;
    z-index: 800;
    pointer-events: auto;
    cursor: auto;
    float: left;
    clear: both;
  }

  .leaflet-top,
  .leaflet-bottom {
    position: absolute;
    z-index: 1000;
    pointer-events: none;
  }

  .leaflet-top {
    top: 0;
  }

  .leaflet-right {
    right: 0;
  }

  .leaflet-bottom {
    bottom: 0;
  }

  .leaflet-left {
    left: 0;
  }

  .leaflet-right .leaflet-control {
    float: right;
    margin-right: 10px;
  }

  .leaflet-left .leaflet-control {
    margin-left: 10px;
  }

  .leaflet-top .leaflet-control {
    margin-top: 10px;
  }

  .leaflet-bottom .leaflet-control {
    margin-bottom: 10px;
  }

  .leaflet-zoom-animated {
    transform-origin: 0 0;
  }

  .leaflet-interactive {
    cursor: pointer;
  }

  .leaflet-grab {
    cursor: grab;
  }

  .leaflet-crosshair,
  .leaflet-crosshair .leaflet-interactive {
    cursor: crosshair;
  }

  .leaflet-dragging .leaflet-grab,
  .leaflet-dragging .leaflet-grab .leaflet-interactive,
  .leaflet-dragging .leaflet-marker-draggable {
    cursor: grabbing;
  }

  .leaflet-marker-icon,
  .leaflet-marker-shadow,
  .leaflet-image-layer,
  .leaflet-pane > svg path,
  .leaflet-tile-container {
    pointer-events: none;
  }

  .leaflet-marker-icon.leaflet-interactive,
  .leaflet-image-layer.leaflet-interactive,
  .leaflet-pane > svg path.leaflet-interactive,
  svg.leaflet-image-layer.leaflet-interactive path {
    pointer-events: auto;
  }

  .leaflet-bar {
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.65);
    border-radius: 4px;
  }

  .leaflet-bar a {
    background-color: #fff;
    border-bottom: 1px solid #ccc;
    width: 26px;
    height: 26px;
    line-height: 26px;
    display: block;
    text-align: center;
    text-decoration: none;
    color: #000;
  }

  .leaflet-bar a,
  .leaflet-control-layers-toggle {
    background-position: 50% 50%;
    background-repeat: no-repeat;
    display: block;
  }

  .leaflet-bar a:hover,
  .leaflet-bar a:focus {
    background-color: #f4f4f4;
  }

  .leaflet-bar a:first-child {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  .leaflet-bar a:last-child {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    border-bottom: none;
  }

  .leaflet-bar a.leaflet-disabled {
    cursor: default;
    background-color: #f4f4f4;
    color: #bbb;
  }

  .leaflet-control-zoom-in,
  .leaflet-control-zoom-out {
    font: bold 18px "Lucida Console", Monaco, monospace;
    text-indent: 1px;
  }

  .leaflet-container .leaflet-control-attribution,
  .leaflet-control-attribution {
    background: rgba(255, 255, 255, 0.8);
    margin: 0;
    padding: 0 5px;
    color: #333;
    line-height: 1.4;
  }

  .leaflet-control-attribution a {
    text-decoration: none;
  }

  .leaflet-control-fullscreen a {
    background: #fff;
    position: relative;
  }

  .leaflet-control-fullscreen a::before {
    content: "\\26F6";
    display: block;
    font-size: 16px;
    line-height: 26px;
  }

  &.leaflet-fullscreen-on,
  &.leaflet-container:-webkit-full-screen {
    width: 100% !important;
    height: 100% !important;
  }

  &.leaflet-pseudo-fullscreen {
    position: fixed !important;
    width: 100% !important;
    height: 100% !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 99999;
  }
`;

export const MapWithTerraDraw: React.FC<MapWithTerraDrawProps> = ({
  geometryType,
  onCoordinatesChange,
  initialCoordinates,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  const terraDrawRef = useRef<TerraDraw | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) {
      return;
    }
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
    if (!terraDrawRef.current || !mapInst.current) {
      return;
    }

    const handleChange = () => {
      if (!terraDrawRef.current) {
        return;
      }

      const snapshot = terraDrawRef.current.getSnapshot();

      if (snapshot.length > 0) {
        const feature = snapshot[snapshot.length - 1];
        // Get the latest feature, This is the current drawing state.
        // There is no support for holes; use custom queries for polygons with holes.
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon') {
          const outerRing = geometry.coordinates[0];
          onCoordinatesChange(outerRing);
        } else {
          onCoordinatesChange(geometry.coordinates);
        }
      }
    };
    const map = mapInst.current;
    map.on('click', handleChange);

    return () => {
      map.off('click', handleChange);
    };
  }, [onCoordinatesChange]);

  return <div ref={mapRef} className={mapContainerClass} />;
};
