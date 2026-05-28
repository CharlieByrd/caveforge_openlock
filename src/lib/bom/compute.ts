import type { Placement, TileType } from '../db/schema';
import { rotateFootprint } from '../grid/transform';
import { bboxVolumeMM3 } from '../grid/cell';

export interface BOMRow {
  tileTypeId: string;
  name: string;
  packName: string;
  category: string;
  footprint: { w: number; h: number };
  heightClass: string;
  sizeMM: { x: number; y: number; z: number };
  required: number;
  inStock: number;
  toPrint: number;
  volumeMM3: number;
}

export interface BOMResult {
  rows: BOMRow[];
  totalRequired: number;
  totalToPrint: number;
  clips: number;
  areaCells: number;
}

export function computeBOM(
  placements: Placement[],
  tileTypes: TileType[],
  packNames: Map<string, string>,
): BOMResult {
  const ttMap = new Map(tileTypes.map(t => [t.id, t]));

  // Count required per tileTypeId
  const requiredMap = new Map<string, number>();
  for (const p of placements) {
    requiredMap.set(p.tileTypeId, (requiredMap.get(p.tileTypeId) ?? 0) + 1);
  }

  const rows: BOMRow[] = [];
  for (const [tileTypeId, required] of requiredMap) {
    const tt = ttMap.get(tileTypeId);
    if (!tt) continue;
    const inStock = tt.inStock;
    const toPrint = Math.max(0, required - inStock);
    rows.push({
      tileTypeId,
      name: tt.name,
      packName: packNames.get(tt.packId) ?? tt.packId,
      category: tt.category,
      footprint: tt.footprint,
      heightClass: tt.heightClass,
      sizeMM: tt.sizeMM,
      required,
      inStock,
      toPrint,
      volumeMM3: bboxVolumeMM3(tt.sizeMM),
    });
  }

  rows.sort((a, b) => a.packName.localeCompare(b.packName) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const totalRequired = rows.reduce((s, r) => s + r.required, 0);
  const totalToPrint = rows.reduce((s, r) => s + r.toPrint, 0);
  const clips = countClips(placements, ttMap);
  const areaCells = countAreaCells(placements, ttMap);

  return { rows, totalRequired, totalToPrint, clips, areaCells };
}

// Count shared cell edges between adjacent occupied cells = clip slots
function countClips(placements: Placement[], ttMap: Map<string, TileType>): number {
  const occupied = new Set<string>();
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    for (let dx = 0; dx < eff.w; dx++) {
      for (let dy = 0; dy < eff.h; dy++) {
        occupied.add(`${p.gx + dx},${p.gy + dy}`);
      }
    }
  }

  let clips = 0;
  for (const key of occupied) {
    const [x, y] = key.split(',').map(Number);
    if (occupied.has(`${x + 1},${y}`)) clips++;
    if (occupied.has(`${x},${y + 1}`)) clips++;
  }
  return clips;
}

function countAreaCells(placements: Placement[], ttMap: Map<string, TileType>): number {
  const occupied = new Set<string>();
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    for (let dx = 0; dx < eff.w; dx++) {
      for (let dy = 0; dy < eff.h; dy++) {
        occupied.add(`${p.gx + dx},${p.gy + dy}`);
      }
    }
  }
  return occupied.size;
}

export function exportBOMCSV(rows: BOMRow[]): string {
  const header = 'Pack,Category,Name,Footprint,HeightClass,Required,InStock,ToPrint,VolumeMM3\n';
  const lines = rows.map(r =>
    [
      csvEsc(r.packName), csvEsc(r.category), csvEsc(r.name),
      `${r.footprint.w}x${r.footprint.h}`, r.heightClass,
      r.required, r.inStock, r.toPrint,
      Math.round(r.volumeMM3),
    ].join(',')
  );
  return header + lines.join('\n');
}

export function exportBOMJSON(result: BOMResult): string {
  return JSON.stringify(result, null, 2);
}

function csvEsc(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
