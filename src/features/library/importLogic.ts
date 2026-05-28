import { v4 as uuid } from 'uuid';
import { parseBinarySTL, bboxSizeMM } from '../../lib/stl/parseBinary';
import { sha256hex } from '../../lib/stl/hash';
import { footprintOf, heightClassOf } from '../../lib/grid/cell';
import { putPack, putTileType, getTileTypesByHash, getAllPacks } from '../../lib/db/idb';
import { saveSTLBlob } from '../../lib/db/blobs';
import type { Pack, TileType } from '../../lib/db/schema';

const CATEGORY_KEYWORDS: [string, string][] = [
  ['stalag', 'stalagmites'],
  ['stalac', 'stalagmites'],
  ['stair', 'stairs'],
  ['corner', 'corners'],
  ['curve', 'curves'],
  ['diagonal', 'curves'],
  ['river', 'river'],
  ['water', 'river'],
  ['door', 'doors'],
  ['gate', 'doors'],
  ['pillar', 'pillars'],
  ['wall', 'walls'],
  ['floor', 'floors'],
];

export function guessCategory(pathOrName: string): string {
  const lower = pathOrName.toLowerCase();
  for (const [kw, cat] of CATEGORY_KEYWORDS) {
    if (lower.includes(kw)) return cat;
  }
  return 'floors';
}

export function normalizePakName(rawName: string): string {
  let name = decodeURIComponent(rawName.replace(/\+/g, ' '));
  name = name.replace(/\s*\(OpenLOCK[^)]*\)/gi, '').trim();
  name = name.replace(/\s*-\s*OpenLOCK[^\n]*/gi, '').trim();
  return name || rawName;
}

export function packNameFromPath(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts.length > 1 ? normalizePakName(parts[0]) : 'Unsorted';
}

export interface ImportProgress {
  total: number;
  done: number;
  current: string;
  errors: { file: string; error: string }[];
}

export interface PackGroup {
  originalName: string;
  displayName: string;
  files: File[];
}

export function groupFilesByPack(files: FileList | File[]): PackGroup[] {
  const fileArr = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.stl'));
  const groups = new Map<string, File[]>();
  for (const file of fileArr) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const packName = packNameFromPath(relPath);
    if (!groups.has(packName)) groups.set(packName, []);
    groups.get(packName)!.push(file);
  }
  return Array.from(groups.entries()).map(([name, files]) => ({
    originalName: name,
    displayName: name,
    files,
  }));
}

export interface ImportPlanItem {
  file: File;
  packName: string;
  category: string;
  name: string;
}

export async function importFromPlan(
  items: ImportPlanItem[],
  onProgress?: (p: ImportProgress) => void,
): Promise<{ imported: number; errors: { file: string; error: string }[] }> {
  const progress: ImportProgress = { total: items.length, done: 0, current: '', errors: [] };

  const existingPacks = await getAllPacks();
  const packByName = new Map<string, Pack>(existingPacks.map((p) => [p.name, p]));

  async function getOrCreatePack(name: string): Promise<Pack> {
    if (packByName.has(name)) return packByName.get(name)!;
    const pack: Pack = { id: uuid(), name, createdAt: Date.now() };
    await putPack(pack);
    packByName.set(name, pack);
    return pack;
  }

  let imported = 0;

  for (const item of items) {
    progress.current = item.file.name;
    onProgress?.(progress);

    try {
      const raw = await item.file.arrayBuffer();
      const hash = await sha256hex(raw);

      const parsed = parseBinarySTL(raw);
      const sizeMM = bboxSizeMM(parsed.bbox);
      const fp = footprintOf(sizeMM);
      const heightClass = heightClassOf(sizeMM, fp);

      const pack = await getOrCreatePack(item.packName);

      const existing = await getTileTypesByHash(hash);
      const dup = existing.find((t) => t.packId === pack.id && t.category === item.category);
      if (!dup) {
        const stlBlobKey = await saveSTLBlob(hash, raw);
        const tileType: TileType = {
          id: uuid(),
          packId: pack.id,
          category: item.category,
          name: item.name,
          fileName: item.file.name,
          stlBlobKey,
          sizeMM,
          footprint: fp,
          heightClass,
          hash,
          inStock: 0,
        };
        await putTileType(tileType);
        imported++;
      }
    } catch (err) {
      progress.errors.push({ file: item.file.name, error: String(err) });
    }

    progress.done++;
    onProgress?.(progress);
  }

  return { imported, errors: progress.errors };
}

export async function importFiles(
  files: FileList | File[],
  onProgress?: (p: ImportProgress) => void,
  packNameOverrides?: Map<string, string>
): Promise<{ imported: number; errors: { file: string; error: string }[] }> {
  const fileArr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.stl'));
  const progress: ImportProgress = { total: fileArr.length, done: 0, current: '', errors: [] };

  const existingPacks = await getAllPacks();
  const packByName = new Map<string, Pack>(existingPacks.map((p) => [p.name, p]));

  async function getOrCreatePack(name: string): Promise<Pack> {
    if (packByName.has(name)) return packByName.get(name)!;
    const pack: Pack = { id: uuid(), name, createdAt: Date.now() };
    await putPack(pack);
    packByName.set(name, pack);
    return pack;
  }

  let imported = 0;

  for (const file of fileArr) {
    progress.current = file.name;
    onProgress?.(progress);

    try {
      const raw = await file.arrayBuffer();
      const hash = await sha256hex(raw);

      const parsed = parseBinarySTL(raw);
      const sizeMM = bboxSizeMM(parsed.bbox);
      const fp = footprintOf(sizeMM);
      const heightClass = heightClassOf(sizeMM, fp);

      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const rawPackName = packNameFromPath(relPath);
      const packName = packNameOverrides?.get(rawPackName) ?? rawPackName;
      const pack = await getOrCreatePack(packName);
      const category = guessCategory(relPath);

      const existing = await getTileTypesByHash(hash);
      const dup = existing.find((t) => t.packId === pack.id && t.category === category);
      if (dup) {
        progress.done++;
        continue;
      }

      const tileTypeId = uuid();
      const stlBlobKey = await saveSTLBlob(hash, raw);
      const displayName = file.name.replace(/\.stl$/i, '');

      const tileType: TileType = {
        id: tileTypeId,
        packId: pack.id,
        category,
        name: displayName,
        fileName: file.name,
        stlBlobKey,
        sizeMM,
        footprint: fp,
        heightClass,
        hash,
        inStock: 0,
      };

      await putTileType(tileType);
      imported++;
    } catch (err) {
      progress.errors.push({ file: file.name, error: String(err) });
    }

    progress.done++;
    onProgress?.(progress);
  }

  return { imported, errors: progress.errors };
}
