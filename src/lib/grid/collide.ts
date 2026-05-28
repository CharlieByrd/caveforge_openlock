import type { Placement } from '../db/schema';
import { occupiedCells } from './transform';

type FootprintMap = Map<string, { w: number; h: number }>;

function key(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

export function buildOccupancySet(
  placements: Placement[],
  footprints: FootprintMap
): Set<string> {
  const set = new Set<string>();
  for (const p of placements) {
    const fp = footprints.get(p.tileTypeId);
    if (!fp) continue;
    for (const c of occupiedCells(p.gx, p.gy, fp, p.rot)) {
      set.add(key(c.x, c.y, p.z));
    }
  }
  return set;
}

export function canPlace(
  gx: number,
  gy: number,
  z: number,
  fp: { w: number; h: number },
  rot: import('../db/schema').Rotation,
  occupied: Set<string>,
  excludeUid?: string,
  placements?: Placement[],
  footprints?: FootprintMap
): boolean {
  // Build occupied set excluding the placement being moved
  let set = occupied;
  if (excludeUid && placements && footprints) {
    const rest = placements.filter(p => p.uid !== excludeUid);
    set = buildOccupancySet(rest, footprints);
  }
  for (const c of occupiedCells(gx, gy, fp, rot)) {
    if (set.has(key(c.x, c.y, z))) return false;
  }
  return true;
}
