import { loadSTLBlob } from '../db/blobs';
import { getThumbnail, putThumbnail, deleteThumbnailsByPrefix } from '../db/idb';
import { renderIconAsync } from './iconWorker';

// LRU cache: insertion-order eviction, capped at MAX_CACHE entries.
// Values are Promises so duplicate concurrent requests coalesce.
const MAX_CACHE = 256;
const cache = new Map<string, Promise<string>>();

function lruGet(key: string): Promise<string> | undefined {
  const v = cache.get(key);
  if (!v) return undefined;
  // Refresh entry (move to end = most-recently used)
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function lruSet(key: string, value: Promise<string>) {
  if (cache.size >= MAX_CACHE) {
    // Evict oldest entry (first key in insertion order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// Remove all cache entries for a tile type (call on tile delete).
export function evictIcon(tileTypeId: string) {
  const prefix = `${tileTypeId}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  deleteThumbnailsByPrefix(prefix).catch(() => {});
}

// ---- Semaphore: cap concurrent blob loads + iconWorker messages to MAX_CONCURRENT ----
const MAX_CONCURRENT = 4;
let _running = 0;
const _waiters: (() => void)[] = [];

function acquire(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (_running < MAX_CONCURRENT) {
      _running++;
      resolve();
    } else {
      _waiters.push(resolve);
    }
  });
}

function release() {
  const next = _waiters.shift();
  if (next) {
    next();
  } else {
    _running--;
  }
}

export function requestIcon(
  tileTypeId: string,
  stlBlobKey: string,
  footprint: { w: number; h: number },
  heightClass?: string,
): Promise<string> {
  const key = `${tileTypeId}:${heightClass ?? ''}`;
  const cached = lruGet(key);
  if (cached) return cached;

  const p = (async () => {
    const persisted = await getThumbnail(key).catch(() => undefined);
    if (persisted) return persisted;

    await acquire();
    try {
      const raw = await loadSTLBlob(stlBlobKey);
      if (!raw) return '';
      const result = await renderIconAsync({ id: tileTypeId, raw: raw.slice(0), footprint, heightClass });
      if (result.error) return '';
      putThumbnail(key, result.topDataUrl).catch(() => {});
      return result.topDataUrl;
    } finally {
      release();
    }
  })();

  lruSet(key, p);
  return p;
}
