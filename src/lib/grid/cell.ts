import type { HeightClass } from '../db/schema';

export const CELL_MM = 25.4;
const TOLERANCE = 0.15; // ±15%

export function footprintOf(sizeMM: { x: number; y: number }): { w: number; h: number } {
  const raw_w = sizeMM.x / CELL_MM;
  const raw_h = sizeMM.y / CELL_MM;
  const w = Math.max(1, Math.round(raw_w));
  const h = Math.max(1, Math.round(raw_h));
  return { w, h };
}

export function footprintValid(sizeMM: { x: number; y: number }, fp: { w: number; h: number }): boolean {
  const okW = Math.abs(sizeMM.x / CELL_MM - fp.w) / fp.w <= TOLERANCE;
  const okH = Math.abs(sizeMM.y / CELL_MM - fp.h) / fp.h <= TOLERANCE;
  return okW && okH;
}

export function heightClassOf(
  sizeMM: { x: number; y: number; z: number },
  fp: { w: number; h: number }
): HeightClass {
  const z = sizeMM.z;
  if (z < 15) return 'floor';
  if (z >= 30) {
    const narrow = fp.w === 1 || fp.h === 1;
    if (narrow) return 'wall';
  }
  return 'prop';
}

export function bboxVolumeMM3(sizeMM: { x: number; y: number; z: number }): number {
  return sizeMM.x * sizeMM.y * sizeMM.z;
}
