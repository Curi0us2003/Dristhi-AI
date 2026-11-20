'use client';

/**
 * Operator venue map. The venue itself (zone outlines, facilities, coordinates) comes from Cloud
 * SQL, the same data the attendee map shows (GET /api/events/{id}/venue-map). Live crowd levels
 * from the cameras (GET /api/heatmap) colour each zone: a camera is matched to its zone by the
 * zone's feed_id, else by name. Cameras with no zone are drawn at their feeds.json position.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindowF, OverlayViewF, PolygonF, useJsApiLoader } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/contexts/event-context';
import { fetchAdminVenueMap } from '@/lib/admin-data';
import { BACKEND_URL } from '@/lib/backend-url';
import { POI_KINDS } from '@/lib/venue';

const containerStyle = { width: '100%', height: '75vh', position: 'relative', borderRadius: 16, overflow: 'hidden' };
const mapContainerStyle = { width: '100%', height: '100%' };
const FALLBACK_CENTER = { lat: 12.979699, lng: 77.719194 };
// Same loader options as the attendee map (components/attendee/venue-map.jsx).
const LIBRARIES = [];

/** Status colour and word. Status is never colour alone. */
const LEVELS = {
  critical: { color: '#B42318', word: 'Critical' },
  warning: { color: '#B54708', word: 'Warning' },
  normal: { color: '#0E7C6B', word: 'Normal' },
  none: { color: '#64748B', word: 'No camera data' },
};
const levelOf = (reading) => {
  const l = reading?.alert_level?.toLowerCase();
  if (!reading) return 'none';
  return l === 'critical' || l === 'warning' ? l : 'normal';
};

function centerOf(points) {
  if (!points.length) return FALLBACK_CENTER;
  const sum = points.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export const MapViewPage = () => {
  const { event } = useEvent();
  const [venue, setVenue] = useState({ zones: [], pois: [] });
  const [readings, setReadings] = useState([]);
  const [venueError, setVenueError] = useState(null);
  const [camerasOnline, setCamerasOnline] = useState(true);
  const [selected, setSelected] = useState(null);
  const mapRef = useRef(null);
  const fittedFor = useRef(null);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey, libraries: LIBRARIES });

  // Venue from Cloud SQL: reload when the event changes, and every minute for setup edits.
  const loadVenue = useCallback(async () => {
    if (!event) return;
    try {
      setVenue(await fetchAdminVenueMap(event.id));
      setVenueError(null);
    } catch (err) {
      setVenueError(err.message || 'Could not load the venue.');
    }
  }, [event]);

  useEffect(() => {
    loadVenue();
    const t = setInterval(loadVenue, 60000);
    return () => clearInterval(t);
  }, [loadVenue]);

  // Live camera readings every 15 s. No readings is a normal state, not an error.
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/heatmap`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!stopped) {
          setReadings(data.heatmap ?? []);
          setCamerasOnline(true);
        }
      } catch {
        if (!stopped) setCamerasOnline(false);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  // Pair each zone with its camera reading; keep unmatched cameras for their own markers.
  const { zoneViews, strayCameras } = useMemo(() => {
    const used = new Set();
    const byFeed = new Map(readings.map((r) => [r.feed_id, r]));
    const byName = new Map(readings.map((r) => [r.name?.trim().toLowerCase(), r]));
    const zoneViews = venue.zones.map((z) => {
      const reading = (z.feedId && byFeed.get(z.feedId)) || byName.get(z.name.trim().toLowerCase()) || null;
      if (reading) used.add(reading);
      return { zone: z, reading, level: levelOf(reading) };
    });
    return { zoneViews, strayCameras: readings.filter((r) => !used.has(r)) };
  }, [venue.zones, readings]);

  // Centre on the event's venue pin, else on the zones, else on the cameras.
  const center = useMemo(() => {
    if (event?.lat != null && event?.lng != null) return { lat: event.lat, lng: event.lng };
    if (venue.zones.length) return centerOf(venue.zones.map((z) => z.center));
    return centerOf(readings.map((r) => ({ lat: Number(r.location.lat), lng: Number(r.location.lng) })));
  }, [event, venue.zones, readings]);

  // Fit the zones in view once per event.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google || !event || fittedFor.current === event.id || !venue.zones.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    venue.zones.forEach((z) => z.paths.forEach((p) => bounds.extend(p)));
    map.fitBounds(bounds, 48);
    fittedFor.current = event.id;
  }, [event, venue.zones, isLoaded]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  if (loadError || !googleMapsApiKey) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl bg-ds-divider p-4 text-center">
        <p className="text-sm text-ds-muted">Google Maps failed to load. Check the Maps API key and its allowed websites.</p>
      </div>
    );
  }

  if (!isLoaded || !event) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-ds-divider">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ds-accent border-t-transparent" />
      </div>
    );
  }

  const nothingYet = !venue.zones.length && !readings.length;

  return (
    <div style={containerStyle}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={18}
        onLoad={onMapLoad}
        onClick={() => setSelected(null)}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
        }}
      >
        {/* Zones from Cloud SQL, coloured by their camera's crowd level */}
        {zoneViews.map(({ zone, level }) => (
          <PolygonF
            key={zone.id}
            paths={zone.paths}
            onClick={() => setSelected({ type: 'zone', id: zone.id })}
            options={{
              fillColor: LEVELS[level].color,
              fillOpacity: level === 'none' ? 0.08 : 0.22,
              strokeColor: LEVELS[level].color,
              strokeOpacity: 0.8,
              strokeWeight: 1.5,
            }}
          />
        ))}

        {/* Zone labels: name, count and the status word */}
        {zoneViews.map(({ zone, reading, level }) => (
          <OverlayViewF key={`label-${zone.id}`} position={zone.center} mapPaneName="overlayMouseTarget">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelected({ type: 'zone', id: zone.id });
              }}
              className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-[11px] font-semibold shadow-sm"
              style={{ borderColor: LEVELS[level].color, color: '#152238' }}
            >
              {zone.name}
              {reading ? ` · ${reading.count}` : ''}
              <span className="ml-1.5" style={{ color: LEVELS[level].color }}>
                {LEVELS[level].word}
              </span>
            </button>
          </OverlayViewF>
        ))}

        {/* Cameras that no zone is linked to, at their feeds.json position */}
        {strayCameras.map((r) => {
          const level = levelOf(r);
          const position = { lat: Number(r.location.lat), lng: Number(r.location.lng) };
          return (
            <OverlayViewF key={`cam-${r.feed_id}`} position={position} mapPaneName="overlayMouseTarget">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected({ type: 'camera', id: r.feed_id });
                }}
                className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow"
                style={{ background: LEVELS[level].color }}
                title="Camera not linked to a zone"
              >
                {r.name} · {r.count} · {LEVELS[level].word}
              </button>
            </OverlayViewF>
          );
        })}

        {/* Facilities from Cloud SQL */}
        {venue.pois.map((poi) => {
          const kind = POI_KINDS[poi.kind] ?? { short: '•', color: '#3B4655', label: poi.kind };
          return (
            <OverlayViewF key={poi.id} position={poi.position} mapPaneName="overlayMouseTarget">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected({ type: 'poi', id: poi.id });
                }}
                title={poi.name}
                aria-label={poi.name}
                className="flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white shadow"
                style={{ background: kind.color }}
              >
                {kind.short}
              </button>
            </OverlayViewF>
          );
        })}

        {selected && <Details selected={selected} zoneViews={zoneViews} cameras={strayCameras} pois={venue.pois} onClose={() => setSelected(null)} />}
      </GoogleMap>

      {(nothingYet || venueError || !camerasOnline) && (
        <div className="absolute left-3 top-3 max-w-sm rounded-xl bg-white/95 px-3 py-2 text-xs text-ds-ink shadow">
          {venueError && <p>Venue: {venueError}</p>}
          {nothingYet && !venueError && <p>No zones with an outline and no camera data for this event yet.</p>}
          {!camerasOnline && <p>Camera data unavailable. Showing the venue only.</p>}
        </div>
      )}

      <Legend />
    </div>
  );
};

function Details({ selected, zoneViews, cameras, pois, onClose }) {
  let position;
  let body;
  if (selected.type === 'zone') {
    const v = zoneViews.find((x) => x.zone.id === selected.id);
    if (!v) return null;
    position = v.zone.center;
    const r = v.reading;
    body = (
      <>
        <h3 className="mb-1 text-sm font-bold">{v.zone.name}</h3>
        <p>Capacity: {v.zone.capacity}</p>
        {r ? (
          <>
            <p>People now: {r.count}</p>
            <p>Density: {r.intensity}%</p>
            <p>
              Status: <b style={{ color: LEVELS[v.level].color }}>{LEVELS[v.level].word}</b>
            </p>
          </>
        ) : (
          <p>No camera linked or no reading yet.</p>
        )}
      </>
    );
  } else if (selected.type === 'camera') {
    const r = cameras.find((c) => c.feed_id === selected.id);
    if (!r) return null;
    position = { lat: Number(r.location.lat), lng: Number(r.location.lng) };
    body = (
      <>
        <h3 className="mb-1 text-sm font-bold">{r.name}</h3>
        <p>People now: {r.count} · Density {r.intensity}%</p>
        <p>Status: {LEVELS[levelOf(r)].word}</p>
        <p className="mt-1 text-ds-muted">Not linked to a zone. Link it in Event setup → Zones.</p>
      </>
    );
  } else {
    const poi = pois.find((p) => p.id === selected.id);
    if (!poi) return null;
    position = poi.position;
    body = (
      <>
        <h3 className="text-sm font-bold">{poi.name}</h3>
        <p>{POI_KINDS[poi.kind]?.label ?? poi.kind}</p>
      </>
    );
  }
  return (
    <InfoWindowF position={position} onCloseClick={onClose}>
      <div className="min-w-[160px] text-xs text-[#152238]">{body}</div>
    </InfoWindowF>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-3 right-3 rounded-xl bg-white/95 p-3 text-xs text-ds-ink shadow">
      <p className="mb-1.5 font-semibold">Crowd level</p>
      {['critical', 'warning', 'normal', 'none'].map((k) => (
        <p key={k} className="mb-1 flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: LEVELS[k].color }} />
          {LEVELS[k].word}
        </p>
      ))}
      <p className="mt-2 text-ds-muted">Venue and facilities from the event setup</p>
    </div>
  );
}

export default MapViewPage;
