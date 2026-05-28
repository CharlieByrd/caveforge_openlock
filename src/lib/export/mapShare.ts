import JSZip from 'jszip';
import { v4 as uuid } from 'uuid';
import type { Pack, TileType, MapDoc } from '../db/schema';
import { getAllTileTypes, getAllPacks, putPack, putTileType, putMap } from '../db/idb';
import { loadSTLBlob, saveSTLBlob } from '../db/blobs';

export interface MapShareManifest {
  version: 1;
  map: MapDoc;
  packs: Pack[];
  tileTypes: TileType[];
}

export async function exportMapZip(map: MapDoc, allTileTypes: TileType[], allPacks: Pack[]): Promise<Blob> {
  const usedTileTypeIds = new Set(map.placements.map((p) => p.tileTypeId));
  const usedTileTypes = allTileTypes.filter((t) => usedTileTypeIds.has(t.id));
  const usedPackIds = new Set(usedTileTypes.map((t) => t.packId));
  const usedPacks = allPacks.filter((p) => usedPackIds.has(p.id));

  const zip = new JSZip();

  const manifest: MapShareManifest = {
    version: 1,
    map,
    packs: usedPacks,
    tileTypes: usedTileTypes,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const stlFolder = zip.folder('stl')!;
  for (const tt of usedTileTypes) {
    const bytes = await loadSTLBlob(tt.stlBlobKey);
    if (bytes) {
      stlFolder.file(`${tt.stlBlobKey}.stl`, bytes);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export interface ImportResult {
  mapId: string;
  tilesAdded: number;
  tilesSkipped: number;
}

export async function importMapZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid archive: missing manifest.json');

  const manifest: MapShareManifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.version !== 1) throw new Error(`Unsupported version: ${manifest.version}`);

  const existingTileTypes = await getAllTileTypes();
  const existingPacks = await getAllPacks();
  const hashToTileType = new Map(existingTileTypes.map((t) => [t.hash, t]));

  // Pack id mapping: old id → new/existing id
  const packIdMap = new Map<string, string>();
  for (const pack of manifest.packs) {
    const existing = existingPacks.find((p) => p.id === pack.id) ?? existingPacks.find((p) => p.name === pack.name);
    if (existing) {
      packIdMap.set(pack.id, existing.id);
    } else {
      const newPack: Pack = { ...pack, id: uuid() };
      await putPack(newPack);
      packIdMap.set(pack.id, newPack.id);
    }
  }

  // TileType id mapping: old id → new/existing id
  const tileIdMap = new Map<string, string>();
  let tilesAdded = 0;
  let tilesSkipped = 0;

  for (const tt of manifest.tileTypes) {
    const existing = hashToTileType.get(tt.hash);
    if (existing) {
      tileIdMap.set(tt.id, existing.id);
      tilesSkipped++;
    } else {
      const stlFile = zip.file(`stl/${tt.stlBlobKey}.stl`);
      if (!stlFile) {
        tilesSkipped++;
        continue;
      }
      const bytes = await stlFile.async('arraybuffer');
      const newBlobKey = await saveSTLBlob(tt.hash, bytes);
      const newId = uuid();
      const newTT: TileType = {
        ...tt,
        id: newId,
        packId: packIdMap.get(tt.packId) ?? tt.packId,
        stlBlobKey: newBlobKey,
      };
      await putTileType(newTT);
      tileIdMap.set(tt.id, newId);
      tilesAdded++;
    }
  }

  // Remap placements to new tile ids
  const newMapId = uuid();
  const newMap: MapDoc = {
    ...manifest.map,
    id: newMapId,
    name: manifest.map.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    placements: manifest.map.placements
      .filter((p) => tileIdMap.has(p.tileTypeId))
      .map((p) => ({ ...p, tileTypeId: tileIdMap.get(p.tileTypeId)! })),
  };
  await putMap(newMap);

  return { mapId: newMapId, tilesAdded, tilesSkipped };
}
