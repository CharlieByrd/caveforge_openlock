import type { IconRequest, IconResult } from '../../workers/iconWorker';

let _worker: Worker | null = null;
const pending = new Map<string, (result: IconResult) => void>();

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL('../../workers/iconWorker.ts', import.meta.url), { type: 'module' });
  _worker.onmessage = (e: MessageEvent<IconResult>) => {
    const cb = pending.get(e.data.id);
    if (cb) {
      pending.delete(e.data.id);
      cb(e.data);
    }
  };
  return _worker;
}

export function renderIconAsync(req: IconRequest): Promise<IconResult> {
  return new Promise((resolve) => {
    pending.set(req.id, resolve);
    getWorker().postMessage(req, [req.raw]);
  });
}
