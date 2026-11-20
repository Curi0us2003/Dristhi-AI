'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
/** Unread notifications for this attendee. Equality filters only, so no composite index is needed. */
export function useAttendeeNotifications(attendeeId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!attendeeId) return;
    const q = query(
      collection(db, 'notifications'),
      where('attendeeId', '==', attendeeId),
      where('read', '==', false),
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setItems(list);
      },
      (err) => console.error('notifications listener', err),
    );
  }, [attendeeId]);

  return items;
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, 'notifications', id), { read: true });
}

/** Reports this attendee sent, newest first. */
export function useMyReports(attendeeId) {
  const [state, setState] = useState({ reports: [], loading: true });

  useEffect(() => {
    if (!attendeeId) return;
    const q = query(collection(db, 'grievances'), where('attendeeId', '==', attendeeId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0));
        setState({ reports: list, loading: false });
      },
      (err) => {
        console.error('reports listener', err);
        setState({ reports: [], loading: false });
      },
    );
  }, [attendeeId]);

  return state;
}

/** Open missing-person reports, shown to every attendee on Home. */
export function useMissingPersonAlerts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = query(
      collection(db, 'grievances'),
      where('type', '==', 'Missing Person'),
      where('status', '==', 'new'),
    );
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('missing person listener', err),
    );
  }, []);
  return items;
}
