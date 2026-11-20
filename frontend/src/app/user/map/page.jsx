'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocateFixed, MapPin } from 'lucide-react';
import { LocationOffBanner } from '@/components/attendee/location-prompts';
import { VenueMap } from '@/components/attendee/venue-map';
import { useAttendee, useLocation } from '@/contexts/attendee-context';
import {
  NEAREST_KINDS,
  POI_KINDS,
  fetchVenueMap,
  formatDistance,
  kindFromName,
  nearestPois,
  walkMinutes,
} from '@/lib/venue';
import { cn } from '@/lib/utils';

/** GPS worse than this is shown as approximate, with "Pick your zone" suggested. */
const GOOD_ACCURACY_M = 50;
const PICKED_KEY = 'dristhi.picked_zone';

/** Map tab: /user/map?kind=washroom (older links use ?poi=Washroom). */
export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <AttendeeMap />
    </Suspense>
  );
}

function readPicked(slug) {
  try {
    const v = JSON.parse(window.localStorage.getItem(PICKED_KEY) ?? 'null');
    return v?.slug === slug ? v.zoneId : null;
  } catch {
    return null;
  }
}

function writePicked(slug, zoneId) {
  try {
    if (zoneId) window.localStorage.setItem(PICKED_KEY, JSON.stringify({ slug, zoneId }));
    else window.localStorage.removeItem(PICKED_KEY);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}

function AttendeeMap() {
  const params = useSearchParams();
  const router = useRouter();
  const kind = params.get('kind') ?? kindFromName(params.get('poi')) ?? 'washroom';
  const { attendee } = useAttendee();
  const slug = attendee?.event?.slug;
  const { watch, permission, coords, ensureLocation } = useLocation();

  const [venue, setVenue] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | cached | error
  const [pickedZoneId, setPickedZoneId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Follow the position only while this tab is open.
  useEffect(() => watch(), [watch, permission]);

  const load = useCallback(() => {
    if (!slug) return;
    setLoadState('loading');
    fetchVenueMap(slug)
      .then((v) => {
        setVenue(v);
        setLoadState(v.cached ? 'cached' : 'ready');
      })
      .catch(() => setLoadState('error'));
  }, [slug]);

  useEffect(() => {
    load();
    if (slug) setPickedZoneId(readPicked(slug));
  }, [load, slug]);

  useEffect(() => setSelectedId(null), [kind]);

  const pickedZone = venue?.zones.find((z) => z.id === pickedZoneId) ?? null;
  const gpsGood = coords && coords.accuracy_m <= GOOD_ACCURACY_M;
  const origin = useMemo(() => {
    if (pickedZone) return { ...pickedZone.center, source: 'zone' };
    if (coords) return { lat: coords.lat, lng: coords.lng, accuracy_m: coords.accuracy_m, source: 'gps' };
    return null;
  }, [pickedZone, coords]);

  const nearest = useMemo(
    () => (venue ? nearestPois(venue.pois, kind, origin, origin ? 3 : 10) : []),
    [venue, kind, origin],
  );
  const nearestIds = useMemo(() => (origin ? nearest.map((p) => p.id) : []), [nearest, origin]);
  const meta = POI_KINDS[kind] ?? POI_KINDS.washroom;

  const choosePicked = (zoneId) => {
    setPickedZoneId(zoneId);
    writePicked(slug, zoneId);
    setPickerOpen(false);
  };

  if (attendee?.local) {
    return (
      <Notice title="The venue map needs a connection to the event">
        This phone joined without reaching the event’s server. Scan the event QR code again when you
        have a connection.
      </Notice>
    );
  }

  let fromText;
  if (pickedZone) fromText = `From ${pickedZone.name} (picked)`;
  else if (gpsGood) fromText = `From your location · ±${coords.accuracy_m} m`;
  else if (coords) fromText = `Approximate location · ±${coords.accuracy_m} m`;
  else fromText = 'Turn on location or pick your zone';

  return (
    <div className="flex flex-col gap-4">
      <LocationOffBanner />

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-ds-ink sm:text-[26px]">Nearest {meta.plural.toLowerCase()}</h1>
        <p className="text-[13px] text-ds-muted">{fromText}</p>
      </header>

      {/* One row that scrolls sideways on phones (the page itself never scrolls sideways). */}
      <nav
        aria-label="What to find"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {NEAREST_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => router.replace(`/user/map?kind=${k}`, { scroll: false })}
            className={cn(
              'inline-flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent',
              k === kind
                ? 'border-ds-accent bg-ds-accent-tint text-ds-accent-ink'
                : 'border-ds-input-border bg-ds-surface text-ds-ink-2 hover:border-ds-accent',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: POI_KINDS[k].color }} aria-hidden />
            {POI_KINDS[k].label}
          </button>
        ))}
      </nav>

      {loadState === 'error' ? (
        <Notice title="Couldn’t load the venue map">
          Check your connection and try again.
          <button
            type="button"
            onClick={load}
            className="mt-3 min-h-11 self-start rounded-[10px] bg-ds-accent px-4 text-sm font-semibold text-ds-on-accent"
          >
            Retry
          </button>
        </Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {venue ? (
            <VenueMap
              venue={venue}
              kind={kind}
              nearestIds={nearestIds}
              selectedId={selectedId}
              onSelect={(p) => setSelectedId(p.id)}
              origin={origin}
              className="h-[min(52dvh,460px)] min-h-[280px] lg:h-[calc(100dvh-260px)] lg:max-h-[640px]"
            />
          ) : (
            <div
              className="h-[min(52dvh,460px)] min-h-[280px] animate-pulse rounded-2xl bg-ds-divider lg:h-[calc(100dvh-260px)]"
              aria-label="Loading map"
            />
          )}

          <section aria-labelledby="near-list-h" className="flex flex-col gap-3">
            <h2 id="near-list-h" className="sr-only">
              {meta.plural} near you
            </h2>
            {loadState === 'cached' && (
              <p role="status" className="rounded-xl bg-ds-warning-tint px-3.5 py-2.5 text-[13px] text-ds-warning">
                Offline: showing the map saved on this phone.
              </p>
            )}

            {venue && nearest.length === 0 && (
              <p className="rounded-xl border border-ds-border bg-ds-surface p-4 text-sm text-ds-ink-2">
                No {meta.plural.toLowerCase()} are marked on this venue’s map. Ask at a help point.
              </p>
            )}

            {venue && !origin && nearest.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-ds-border bg-ds-surface p-4">
                <p className="text-sm text-ds-ink-2">To see which is closest, share your location or pick the area you’re in.</p>
                <div className="flex flex-wrap gap-2">
                  {permission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => void ensureLocation('nearest')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-ds-accent px-4 text-sm font-semibold text-ds-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      <LocateFixed className="h-4 w-4" aria-hidden /> Use my location
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-ds-input-border px-4 text-sm font-medium text-ds-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    <MapPin className="h-4 w-4" aria-hidden /> Pick your zone
                  </button>
                </div>
              </div>
            )}

            {venue && coords && !gpsGood && !pickedZone && (
              <p className="rounded-xl bg-ds-warning-tint px-3.5 py-2.5 text-[13px] text-ds-warning">
                Your phone’s location is rough here (±{coords.accuracy_m} m). Distances may be off; picking your zone is more reliable.
              </p>
            )}

            <ul className="flex flex-col gap-2.5">
              {nearest.map((p, i) => {
                const top = origin && i === 0;
                const selected = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[14px] border bg-ds-surface p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent',
                        top || selected ? 'border-2' : 'border-ds-border',
                      )}
                      style={top || selected ? { borderColor: meta.color, background: `${meta.color}12` } : undefined}
                    >
                      <span
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-xs font-semibold"
                        style={
                          top ? { background: meta.color, color: '#FCFCFA' } : { background: `${meta.color}1F`, color: meta.color }
                        }
                        aria-hidden
                      >
                        {meta.short}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn('truncate text-[15px] text-ds-ink', top ? 'font-semibold' : 'font-medium')}>
                          {p.name}
                        </span>
                        <span className="text-[13px] text-ds-ink-2">
                          {p.distance != null
                            ? `${formatDistance(p.distance)} · about ${walkMinutes(p.distance)} min walk`
                            : venue.zones.find((z) => z.id === p.zoneId)?.name ?? 'On the venue map'}
                        </span>
                      </span>
                      {top && (
                        <span className="text-xs font-semibold" style={{ color: meta.color }}>
                          Nearest
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {venue && <Legend kinds={[...new Set(venue.pois.map((p) => p.kind))]} />}

            {venue && origin && !pickerOpen && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="min-h-11 rounded-xl border border-ds-input-border text-sm font-medium text-ds-ink-2 hover:border-ds-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {pickedZone ? 'Change zone' : 'Location wrong? Pick your zone'}
              </button>
            )}

            {venue && pickerOpen && (
              <ZonePicker
                zones={venue.zones}
                pickedId={pickedZoneId}
                canUseGps={permission === 'granted' && Boolean(coords)}
                onPick={choosePicked}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Legend({ kinds }) {
  const shown = NEAREST_KINDS.filter((k) => kinds.includes(k)).concat(kinds.filter((k) => !NEAREST_KINDS.includes(k)));
  return (
    <ul aria-label="Map legend" className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ds-ink-2">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#2B6CB0]" aria-hidden />
        You
      </li>
      {shown.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: POI_KINDS[k]?.color }} aria-hidden />
          {POI_KINDS[k]?.label ?? k}
        </li>
      ))}
    </ul>
  );
}

function ZonePicker({ zones, pickedId, canUseGps, onPick, onClose }) {
  return (
    <section aria-labelledby="zone-pick-h" className="flex flex-col gap-2 rounded-xl border border-ds-border bg-ds-surface p-3">
      <h3 id="zone-pick-h" className="px-1 text-sm font-semibold text-ds-ink">
        Which area are you in?
      </h3>
      <ul className="grid grid-cols-2 gap-2">
        {zones.map((z) => (
          <li key={z.id}>
            <button
              type="button"
              aria-pressed={z.id === pickedId}
              onClick={() => onPick(z.id)}
              className={cn(
                'min-h-11 w-full rounded-[10px] border px-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent',
                z.id === pickedId
                  ? 'border-ds-accent bg-ds-accent-tint font-semibold text-ds-accent-ink'
                  : 'border-ds-input-border text-ds-ink-2 hover:border-ds-accent',
              )}
            >
              {z.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        {pickedId && canUseGps && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-ds-accent-ink hover:underline"
          >
            <LocateFixed className="h-4 w-4" aria-hidden /> Use my location instead
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] px-3 text-sm font-medium text-ds-muted hover:text-ds-ink">
          Cancel
        </button>
      </div>
    </section>
  );
}

function Notice({ title, children }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-ds-border bg-ds-surface p-5">
      <h1 className="text-base font-semibold text-ds-ink">{title}</h1>
      <div className="flex flex-col text-sm text-ds-ink-2">{children}</div>
    </div>
  );
}
