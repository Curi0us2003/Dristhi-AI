'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapViewPage } from '@/components/map-view-component';
import { LocationOffBanner } from '@/components/attendee/location-prompts';
import { useLocation } from '@/contexts/attendee-context';

/** Map tab: venue map, optionally highlighting a facility (/user/map?poi=Washroom). */
export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <AttendeeMap />
    </Suspense>
  );
}

function AttendeeMap() {
  const poi = useSearchParams().get('poi');
  const { watch, permission } = useLocation();

  // Follow the position only while this tab is open.
  useEffect(() => watch(), [watch, permission]);

  return (
    <div className="flex flex-col gap-4">
      <LocationOffBanner />
      <div className="overflow-hidden rounded-2xl border border-ds-border bg-ds-surface p-2 text-ds-ink sm:p-3">
        <MapViewPage highlightPoi={poi} />
      </div>
    </div>
  );
}
