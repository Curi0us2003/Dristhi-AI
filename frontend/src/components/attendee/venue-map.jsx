'use client';

import { useCallback, useEffect, useRef } from 'react';
import { CircleF, GoogleMap, OverlayViewF, OverlayView, PolygonF, useJsApiLoader } from '@react-google-maps/api';
import { MapPinOff } from 'lucide-react';
import { POI_KINDS } from '@/lib/venue';
import { cn } from '@/lib/utils';

// Same loader options as the operator map (components/map-view-component.jsx): the Maps script can
// only be loaded once per page, with one set of options.
const LIBRARIES = [];
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;

const MAP_OPTIONS = {
  mapId: MAP_ID,
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false, // Google's own shops and places would compete with the venue's facilities
  gestureHandling: 'greedy',
  // Ignored when a Map ID is set (style it in the Maps console instead).
  styles: MAP_ID ? undefined : [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
};

const centerOffset = (w, h) => ({ x: -w / 2, y: -h / 2 });

/**
 * Venue map: zone outlines with names, facility markers in the legend colours, and "you are here".
 *
 * @param {{
 *   venue: {zones: object[], pois: object[]},
 *   kind: string,                       facilities of this kind are drawn large, the rest faded
 *   nearestIds: string[],               shown first; the map zooms to them and the origin
 *   selectedId: string|null,
 *   onSelect: (poi) => void,
 *   origin: {lat: number, lng: number, accuracy_m?: number, source: 'gps'|'zone'}|null,
 *   className?: string,
 * }} props
 */
export function VenueMap({ venue, kind, nearestIds, selectedId, onSelect, origin, className }) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: API_KEY, libraries: LIBRARIES });
  const mapRef = useRef(null);

  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const bounds = new window.google.maps.LatLngBounds();
    const focus = venue.pois.filter((p) => nearestIds.includes(p.id));
    if (origin && focus.length) {
      bounds.extend(origin);
      focus.forEach((p) => bounds.extend(p.position));
    } else {
      venue.zones.forEach((z) => z.paths.forEach((pt) => bounds.extend(pt)));
      venue.pois.forEach((p) => bounds.extend(p.position));
    }
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, 48);
    // A venue is small: don't zoom past street level when two points are very close.
    window.google.maps.event.addListenerOnce(map, 'idle', () => {
      if (map.getZoom() > 20) map.setZoom(20);
    });
  }, [venue, nearestIds, origin]);

  // Refit when the kind or the origin changes, not on every GPS update.
  const originKey = origin ? `${origin.source}:${origin.source === 'zone' ? origin.lat : 'gps'}` : 'none';
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, originKey, isLoaded, venue]);

  if (!API_KEY || loadError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-2xl border border-ds-border bg-ds-divider p-6 text-center',
          className,
        )}
      >
        <MapPinOff className="h-6 w-6 text-ds-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-sm font-medium text-ds-ink-2">The map can’t load right now</p>
        <p className="text-[13px] text-ds-muted">The list of nearest places still works.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className={cn('animate-pulse rounded-2xl bg-ds-divider', className)} aria-label="Loading map" />;
  }

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-ds-border', className)}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        options={MAP_OPTIONS}
        onLoad={(map) => {
          mapRef.current = map;
          fit();
        }}
        onUnmount={() => {
          mapRef.current = null;
        }}
      >
        {venue.zones.map((z) => (
          <PolygonF
            key={z.id}
            paths={z.paths}
            options={{
              fillColor: '#0E7C6B',
              fillOpacity: 0.12,
              strokeColor: '#0E7C6B',
              strokeOpacity: 0.5,
              strokeWeight: 1.5,
              clickable: false,
            }}
          />
        ))}
        {venue.zones.map((z) => (
          <OverlayViewF
            key={`label-${z.id}`}
            position={z.center}
            mapPaneName={OverlayView.OVERLAY_LAYER}
            getPixelPositionOffset={centerOffset}
          >
            <span className="pointer-events-none whitespace-nowrap text-[11px] font-semibold text-[#0B5E52] [text-shadow:0_0_3px_#fff,0_0_3px_#fff]">
              {z.name}
            </span>
          </OverlayViewF>
        ))}

        {venue.pois.map((p) => {
          const meta = POI_KINDS[p.kind] ?? POI_KINDS.stage;
          const active = p.kind === kind;
          const top = nearestIds[0] === p.id;
          const size = top || p.id === selectedId ? 40 : active ? 32 : 24;
          return (
            <OverlayViewF
              key={p.id}
              position={p.position}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={centerOffset}
              zIndex={top ? 3 : active ? 2 : 1}
            >
              <button
                type="button"
                aria-label={`${p.name}${top ? ', nearest' : ''}`}
                title={p.name}
                onClick={() => onSelect(p)}
                className="flex items-center justify-center rounded-full border-[3px] border-[#FCFCFA] font-semibold text-[#FCFCFA] shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14202E]"
                style={{
                  width: size,
                  height: size,
                  background: meta.color,
                  fontSize: size >= 32 ? 12 : 10,
                  opacity: active || p.id === selectedId ? 1 : 0.55,
                }}
              >
                {meta.short}
              </button>
            </OverlayViewF>
          );
        })}

        {origin && (
          <>
            {origin.source === 'gps' && origin.accuracy_m ? (
              <CircleF
                center={origin}
                radius={origin.accuracy_m}
                options={{ fillColor: '#2B6CB0', fillOpacity: 0.15, strokeOpacity: 0, clickable: false }}
              />
            ) : null}
            <OverlayViewF position={origin} mapPaneName={OverlayView.OVERLAY_LAYER} getPixelPositionOffset={centerOffset}>
              <span
                role="img"
                aria-label={origin.source === 'zone' ? 'Your picked area' : 'You are here'}
                className="block h-[18px] w-[18px] rounded-full border-[3px] border-[#FCFCFA] bg-[#2B6CB0] shadow-[0_0_0_8px_rgba(43,108,176,0.2)]"
              />
            </OverlayViewF>
          </>
        )}
      </GoogleMap>
    </div>
  );
}
