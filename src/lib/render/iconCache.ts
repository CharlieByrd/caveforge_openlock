import { loadSTLBlob } from '../db/blobs';
import { renderIconAsync } from './iconWorker';

const cache = new Map<string, Promise<string>>();

export function requestIcon(
  tileTypeId: string,
  stlBlobKey: string,
  footprint: { w: number; h: number },
): Promise<string> {
  if (cache.has(tileTypeId)) return cache.get(tileTypeId)!;

  const p = loadSTLBlob(stlBlobKey).then((raw) => {
    if (!raw) return '';
    return renderIconAsync({ id: tileTypeId, raw: raw.slice(0), footprint }).then((result) =>
      result.error ? '' : result.topDataUrl,
    );
  });

  cache.set(tileTypeId, p);
  return p;
}
