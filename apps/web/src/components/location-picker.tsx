'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef } from 'react';

export interface LatLng {
  lat: number;
  lng: number;
}

const BANGKOK: LatLng = { lat: 13.7563, lng: 100.5018 };
// OpenStreetMap tiles: check the tile usage policy (or self-host) before production use — M02 §4
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

/**
 * Click/drag to place a point (Leaflet, BSD-2). With `points` and no `onChange` it only shows markers.
 */
export function LocationPicker({
  value,
  onChange,
  points,
  height = 280,
}: {
  value?: LatLng | null;
  onChange?: (v: LatLng) => void;
  points?: (LatLng & { label: string })[];
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !el.current || map.current) return;
      const icon = L.divIcon({
        className: '',
        html: '<div class="wems-pin"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const start = value ?? points?.[0] ?? BANGKOK;
      const m = L.map(el.current).setView([start.lat, start.lng], value || points?.length ? 14 : 6);
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      for (const p of points ?? [])
        L.marker([p.lat, p.lng], { icon }).bindTooltip(p.label).addTo(m);
      if (points && points.length > 1)
        m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2));
      const place = (ll: LatLng) => {
        if (marker.current) marker.current.setLatLng([ll.lat, ll.lng]);
        else {
          marker.current = L.marker([ll.lat, ll.lng], {
            icon,
            draggable: !!changeRef.current,
          }).addTo(m);
          marker.current.on('dragend', () => {
            const p = marker.current!.getLatLng();
            changeRef.current?.({ lat: p.lat, lng: p.lng });
          });
        }
      };
      if (value) place(value);
      if (changeRef.current) {
        m.on('click', (e) => {
          place({ lat: e.latlng.lat, lng: e.latlng.lng });
          changeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // the map is created once; later value changes come from the map itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={el}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-md border border-border"
      data-testid="location-picker"
    />
  );
}
