'use client';

import { useEffect, useState } from 'react';
import { attendeeApi, publicApi, toGrievance, ts, watch } from '@/lib/api';
import { getSavedAttendee } from '@/lib/attendee';

const base = (attendeeId) => `/api/attendees/${encodeURIComponent(attendeeId)}`;
const isServerAttendee = (id) => id && !id.startsWith('local-');

/** Unread notifications for this attendee, newest first. */
export function useAttendeeNotifications(attendeeId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!isServerAttendee(attendeeId)) return;
    return watch(
      async () =>
        (await attendeeApi(`${base(attendeeId)}/notifications`)).map((n) => ({
          id: n.id,
          message: n.message,
          createdAt: ts(n.created_at),
        })),
      setItems,
      (err) => console.error('notifications', err),
    );
  }, [attendeeId]);

  return items;
}

export function markNotificationRead(attendeeId, id) {
  return attendeeApi(`${base(attendeeId)}/notifications/${id}/read`, { method: 'POST' });
}

/** Reports this attendee sent, newest first. */
export function useMyReports(attendeeId) {
  const [state, setState] = useState({ reports: [], loading: true });

  useEffect(() => {
    if (!isServerAttendee(attendeeId)) {
      setState({ reports: [], loading: false });
      return;
    }
    return watch(
      async () => (await attendeeApi(`${base(attendeeId)}/reports`)).map(toGrievance),
      (reports) => setState({ reports, loading: false }),
      (err) => {
        console.error('reports', err);
        setState((s) => ({ ...s, loading: false }));
      },
    );
  }, [attendeeId]);

  return state;
}

/** Open missing-person reports of this attendee's event, shown to every attendee on Home. */
export function useMissingPersonAlerts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const slug = getSavedAttendee()?.event?.slug;
    if (!slug) return;
    return watch(
      async () =>
        (await publicApi(`/api/events/${encodeURIComponent(slug)}/missing-persons`)).map((g) => ({
          id: g.id,
          personName: g.person_name,
          details: g.details,
          lastSeen: g.last_seen,
          photoDataUri: g.photo_data_uri,
          submittedAt: ts(g.submitted_at),
        })),
      setItems,
      (err) => console.error('missing persons', err),
      15000,
    );
  }, []);
  return items;
}
