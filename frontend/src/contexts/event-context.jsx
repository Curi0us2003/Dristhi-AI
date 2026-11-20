'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { watchEvents } from '@/lib/admin-data';

const STORAGE_KEY = 'dristhi.selectedEventId';

const EventContext = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function EventProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSelectedId(readStored());
    return watchEvents(
      (list) => {
        setEvents(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  const selectEvent = useCallback((id) => {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage blocked: selection lasts for this tab only.
    }
  }, []);

  // Fall back to a live event, then the first one, when nothing (valid) is selected.
  const event = useMemo(() => {
    return (
      events.find((e) => e.id === selectedId) ?? events.find((e) => e.status === 'live') ?? events[0] ?? null
    );
  }, [events, selectedId]);

  const value = useMemo(
    () => ({ events, event, loading, error, selectEvent }),
    [events, event, loading, error, selectEvent],
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used inside EventProvider');
  return ctx;
}
