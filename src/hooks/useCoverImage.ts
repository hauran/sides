import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, API_URL } from '../lib/api';

const cache = new Map<string, string | null>();
const pending = new Set<string>();
const bustTimestamps = new Map<string, number>();

const BASE_URL = API_URL.replace(/\/api$/, '');

// Simple reactive store for cache-busting — components subscribe to changes
let revision = 0;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getRevision() { return revision; }

function coverUrl(playId: string): string {
  const bust = bustTimestamps.get(playId);
  const suffix = bust ? `?v=${bust}` : '';
  return `${BASE_URL}/api/covers/${playId}/image${suffix}`;
}

/** Call after uploading a new cover to force all hooks to refresh */
export function invalidateCover(playId: string) {
  cache.delete(playId);
  bustTimestamps.set(playId, Date.now());
  revision++;
  listeners.forEach(cb => cb());
}

export function useCoverImage(playId: string, coverUri: string | null): string | null {
  // Subscribe to invalidation events
  const rev = useSyncExternalStore(subscribe, getRevision);

  const [url, setUrl] = useState<string | null>(() => {
    if (coverUri) return coverUrl(playId);
    return cache.get(playId) ?? null;
  });

  useEffect(() => {
    if (coverUri || bustTimestamps.has(playId)) {
      setUrl(coverUrl(playId));
      return;
    }

    if (cache.has(playId)) {
      setUrl(cache.get(playId) ?? null);
      return;
    }

    if (pending.has(playId)) return;

    let cancelled = false;
    pending.add(playId);

    async function generate() {
      try {
        await api<{ cover_uri: string }>(`/covers/${playId}`, {
          method: 'POST',
        });
        const fullUrl = coverUrl(playId);
        if (!cancelled) {
          cache.set(playId, fullUrl);
          setUrl(fullUrl);
        }
      } catch {
        if (!cancelled) {
          cache.set(playId, null);
          setUrl(null);
        }
      } finally {
        pending.delete(playId);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [playId, coverUri, rev]);

  return url;
}
