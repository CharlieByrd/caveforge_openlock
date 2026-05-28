import { putBlob, getBlob } from './idb';

export function stlBlobKey(hash: string): string {
  return `stl:${hash}`;
}

export async function saveSTLBlob(hash: string, bytes: ArrayBuffer): Promise<string> {
  const key = stlBlobKey(hash);
  await putBlob({ key, bytes, mime: 'model/stl' });
  return key;
}

export async function loadSTLBlob(key: string): Promise<ArrayBuffer | null> {
  const rec = await getBlob(key);
  return rec ? rec.bytes : null;
}
