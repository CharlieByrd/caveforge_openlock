import { parseBinarySTL, bboxSizeMM } from '../lib/stl/parseBinary';
import { sha256hex } from '../lib/stl/hash';

export interface StlMetaRequest {
  id: string;
  raw: ArrayBuffer;
}

export interface StlMetaResult {
  id: string;
  hash?: string;
  sizeMM?: { x: number; y: number; z: number };
  raw?: ArrayBuffer;
  error?: string;
}

self.onmessage = async (e: MessageEvent<StlMetaRequest>) => {
  const { id, raw } = e.data;
  try {
    const hash = await sha256hex(raw);
    const parsed = parseBinarySTL(raw);
    const sizeMM = bboxSizeMM(parsed.bbox);
    self.postMessage({ id, hash, sizeMM, raw } as StlMetaResult, { transfer: [raw] });
  } catch (err) {
    self.postMessage({ id, error: String(err) } as StlMetaResult);
  }
};
