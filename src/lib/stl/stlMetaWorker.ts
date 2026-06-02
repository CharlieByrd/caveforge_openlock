import type { StlMetaRequest, StlMetaResult } from '../../workers/stlMetaWorker';

let _worker: Worker | null = null;
const pending = new Map<string, (result: StlMetaResult) => void>();

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL('../../workers/stlMetaWorker.ts', import.meta.url), { type: 'module' });
  _worker.onmessage = (e: MessageEvent<StlMetaResult>) => {
    const cb = pending.get(e.data.id);
    if (cb) {
      pending.delete(e.data.id);
      cb(e.data);
    }
  };
  return _worker;
}

export function computeStlMeta(id: string, raw: ArrayBuffer): Promise<StlMetaResult> {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, raw } as StlMetaRequest, [raw]);
  });
}
