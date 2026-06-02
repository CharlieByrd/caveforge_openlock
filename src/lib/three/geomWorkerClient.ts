/**
 * Main-thread client for geomWorker.
 * Mirrors the stlMetaWorker.ts pattern: lazy singleton worker, promise-per-id map.
 */

import type { GeomRequest, GeomResult } from '../../workers/geomWorker';

let _worker: Worker | null = null;
const pending = new Map<string, (result: GeomResult) => void>();
let _seq = 0;

function settleAllPending(errorMsg: string) {
  for (const [id, cb] of pending) {
    cb({ id, positions: new Float32Array(0), normals_i8: new Int8Array(0), indices: new Uint32Array(0), error: errorMsg });
  }
  pending.clear();
  _worker = null; // reset so next call recreates the worker
}

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL('../../workers/geomWorker.ts', import.meta.url), { type: 'module' });
  _worker.onmessage = (e: MessageEvent<GeomResult>) => {
    const cb = pending.get(e.data.id);
    if (cb) {
      pending.delete(e.data.id);
      cb(e.data);
    }
  };
  _worker.onerror = () => settleAllPending('geomWorker crashed');
  _worker.onmessageerror = () => settleAllPending('geomWorker message error');
  return _worker;
}

export function computeGeometry(hint: string, raw: ArrayBuffer, maxTriangles: number): Promise<GeomResult> {
  // Use a unique sequence-stamped ID so concurrent requests for the same blob never collide
  const id = `${hint}::${++_seq}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, raw, maxTriangles } as GeomRequest, [raw]);
  });
}
