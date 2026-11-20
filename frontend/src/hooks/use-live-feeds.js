'use client';

import { useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend-url';

/** Polls the people-counting backend for live counts and 15-minute predictions. */
export function useLiveFeeds(intervalMs = 5000) {
  const [state, setState] = useState({
    feeds: [],
    counts: {},
    predictions: {},
    online: null,
    updatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [feedsRes, predRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/feeds`),
          fetch(`${BACKEND_URL}/api/predictions`).catch(() => null),
        ]);
        if (!feedsRes.ok) throw new Error(`feeds ${feedsRes.status}`);
        const feedsJson = await feedsRes.json();
        const predJson = predRes && predRes.ok ? await predRes.json() : { predictions: {} };

        const feeds = Object.entries(feedsJson.feeds ?? {})
          .map(([id, f]) => ({ ...f, id }))
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        const counts = Object.fromEntries(feeds.map((f) => [f.id, f.current_count ?? 0]));
        const predictions = Object.fromEntries(
          Object.entries(predJson.predictions ?? {}).map(([id, p]) => [id, p.predictions['15_min']]),
        );
        if (!cancelled) setState({ feeds, counts, predictions, online: true, updatedAt: new Date() });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, online: false }));
      }
    }

    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
