import { loadSTLBlob } from '../db/blobs';
import { renderIconAsync } from './iconWorker';

const cache = new Map<string, Promise<string>>();

export function requestIcon(
  tileTypeId: string,
  stlBlobKey: string,
  footprint: { w: number; h: number },
  heightClass?: string,
): Promise<string> {
  const key = `${tileTypeId}:${heightClass ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;

  const p = loadSTLBlob(stlBlobKey).then((raw) => {
    if (!raw) return '';
    return renderIconAsync({ id: tileTypeId, raw: raw.slice(0), footprint, heightClass }).then((result) =>
      result.error ? '' : result.topDataUrl,
    );
  });

  cache.set(key, p);
  return p;
}
