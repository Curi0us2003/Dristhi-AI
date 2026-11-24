'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSavedAttendee, refreshAttendee, saveAttendee } from '@/lib/attendee';
import {
  geolocationSupported,
  markAsked,
  POSITION_OPTIONS,
  queryPermission,
  requestPosition,
  toCoords,
  wasAsked,
} from '@/lib/location';

/* ── Attendee ─────────────────────────────────────────────────────────── */

const AttendeeContext = createContext({ attendee: null, status: 'loading' });

export const useAttendee = () => useContext(AttendeeContext);

export function AttendeeProvider({ children }) {
  const [value, setValue] = useState({ attendee: null, status: 'loading' });

  useEffect(() => {
    const saved = getSavedAttendee();
    if (!saved) {
      setValue({ attendee: null, status: 'missing' });
      return;
    }
    setValue({ attendee: saved, status: 'ready' });
    let cancelled = false;
    refreshAttendee(saved).then((fresh) => {
      if (cancelled || fresh === 'offline') return;
      if (fresh === null) {
        saveAttendee(null);
        setValue({ attendee: null, status: 'missing' });
      } else {
        setValue({ attendee: fresh, status: 'ready' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // setAttendee replaces the attendee after they change their name or number.
  const setAttendee = useCallback((a) => setValue({ attendee: a, status: 'ready' }), []);
  const ctx = useMemo(() => ({ ...value, setAttendee }), [value, setAttendee]);

  return <AttendeeContext.Provider value={ctx}>{children}</AttendeeContext.Provider>;
}

/* ── Location ─────────────────────────────────────────────────────────── */

const LocationContext = createContext(null);

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside LocationProvider');
  return ctx;
}

export function LocationProvider({ children }) {
  const [permission, setPermission] = useState('unknown');
  const [coords, setCoords] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blockedHelpOpen, setBlockedHelpOpen] = useState(false);
  const coordsRef = useRef(null);
  coordsRef.current = coords;
  const permissionRef = useRef(permission);
  permissionRef.current = permission;

  /** Resolves with the position, `denied`, or null for any other failure. */
  const fetchPosition = useCallback(async () => {
    try {
      const c = await requestPosition();
      setCoords(c);
      setPermission('granted');
      setLastError(null);
      return c;
    } catch (err) {
      const code = err?.code;
      if (code === 1) {
        setPermission('denied');
        setLastError(null);
        return 'denied';
      } else if (code === 3) {
        setLastError('Finding your location is taking too long. Try again near an open area.');
      } else if (code === 2) {
        setLastError('Your location is not available right now.');
      } else {
        setPermission('unsupported');
      }
      return null;
    }
  }, []);

  // Initial state: read the permission without prompting.
  useEffect(() => {
    let status;
    const onChange = () => {
      if (!status) return;
      setPermission(status.state);
      if (status.state === 'granted') fetchPosition();
    };
    queryPermission().then((r) => {
      status = r.status;
      setPermission(r.state);
      if (r.state === 'granted') fetchPosition();
      else if (r.state === 'prompt' && !wasAsked()) setSheetOpen(true);
      status?.addEventListener('change', onChange);
    });
    return () => status?.removeEventListener('change', onChange);
  }, [fetchPosition]);

  const allow = useCallback(async () => {
    markAsked();
    setSheetOpen(false);
    const c = await fetchPosition();
    if (c === 'denied') {
      setBlockedHelpOpen(true);
      return null;
    }
    return c;
  }, [fetchPosition]);

  const ensureLocation = useCallback(
    async (reason) => {
      const p = permissionRef.current;
      if (p === 'granted') {
        const fresh = coordsRef.current && Date.now() - coordsRef.current.at < 30000;
        if (fresh) return coordsRef.current;
        const c = await fetchPosition();
        return c === 'denied' ? null : c;
      }
      if (p === 'denied') {
        if (reason !== 'help') setBlockedHelpOpen(true);
        return null;
      }
      if (p === 'unsupported') return null;
      setSheetOpen(true);
      return null;
    },
    [fetchPosition],
  );

  const dismissSheet = useCallback(() => {
    markAsked();
    setSheetOpen(false);
  }, []);

  const watch = useCallback(() => {
    if (!geolocationSupported() || permissionRef.current !== 'granted') return () => {};
    const id = navigator.geolocation.watchPosition(
      (p) => setCoords(toCoords(p)),
      () => {},
      POSITION_OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const value = useMemo(
    () => ({
      permission,
      coords,
      lastError,
      sheetOpen,
      blockedHelpOpen,
      ensureLocation,
      allow,
      dismissSheet,
      closeBlockedHelp: () => setBlockedHelpOpen(false),
      watch,
    }),
    [permission, coords, lastError, sheetOpen, blockedHelpOpen, ensureLocation, allow, dismissSheet, watch],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
