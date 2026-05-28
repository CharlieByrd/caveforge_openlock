import type { Placement, TileType } from '../db/schema';

export interface ExportItem {
  tileTypeId: string;
  packId: string;
  name: string;
  fileName: string;
  raw: ArrayBuffer;
  count: number; // copies to include
}

export interface JobFile {
  name: string;
  data: ArrayBuffer;
}

export type ProgressCallback = (done: number, total: number, label: string) => void;

// Build ExportItem list from placements + tileTypes + inStock
export function buildExportItems(
  placements: Placement[],
  tileTypes: TileType[],
  blobs: Map<string, ArrayBuffer>,
  considerInventory: boolean,
): ExportItem[] {
  const ttMap = new Map(tileTypes.map(t => [t.id, t]));
  const reqMap = new Map<string, number>();
  for (const p of placements) reqMap.set(p.tileTypeId, (reqMap.get(p.tileTypeId) ?? 0) + 1);

  const items: ExportItem[] = [];
  for (const [id, required] of reqMap) {
    const tt = ttMap.get(id);
    if (!tt) continue;
    const raw = blobs.get(tt.stlBlobKey);
    if (!raw) continue;
    const count = considerInventory ? Math.max(0, required - tt.inStock) : required;
    if (count > 0) items.push({ tileTypeId: id, packId: tt.packId, name: tt.name, fileName: tt.fileName, raw, count });
  }
  return items;
}

// Distribute items across N jobs evenly (invariant: sum == item.count for each item)
export function splitByN(items: ExportItem[], n: number): ExportItem[][] {
  const jobs: ExportItem[][] = Array.from({ length: n }, () => []);
  for (const item of items) {
    const base = Math.floor(item.count / n);
    const extra = item.count % n;
    for (let j = 0; j < n; j++) {
      const count = base + (j < extra ? 1 : 0);
      if (count > 0) jobs[j].push({ ...item, raw: item.raw, count });
    }
  }
  return jobs;
}

// Format A: ZIP with original STL files + manifest.json
export async function buildFormatA(
  items: ExportItem[],
  jobLabel: string,
  onProgress?: ProgressCallback,
): Promise<JobFile[]> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const manifest: Array<{ name: string; fileName: string; count: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.name);
    zip.file(item.fileName, item.raw);
    manifest.push({ name: item.name, fileName: item.fileName, count: item.count });
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  onProgress?.(items.length, items.length, 'Compressing…');
  const blob = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return [{ name: `${jobLabel}.zip`, data: blob }];
}

