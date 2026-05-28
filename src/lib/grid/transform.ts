import type { Rotation } from '../db/schema';

export function rotateFootprint(
  fp: { w: number; h: number },
  rot: Rotation
): { w: number; h: number } {
  if (rot === 90 || rot === 270) return { w: fp.h, h: fp.w };
  return { w: fp.w, h: fp.h };
}

// Returns the cells occupied by a placement (in grid coords).
export function occupiedCells(
  gx: number,
  gy: number,
  fp: { w: number; h: number },
  rot: Rotation
): Array<{ x: number; y: number }> {
  const eff = rotateFootprint(fp, rot);
  const cells: Array<{ x: number; y: number }> = [];
  for (let dx = 0; dx < eff.w; dx++) {
    for (let dy = 0; dy < eff.h; dy++) {
      cells.push({ x: gx + dx, y: gy + dy });
    }
  }
  return cells;
}

// Rotation in radians for Three.js Y-axis rotation.
export function rotToRad(rot: Rotation): number {
  return (rot * Math.PI) / 180;
}
