import { describe, it, expect } from 'vitest';
import { footprintOf, heightClassOf } from '../lib/grid/cell';

describe('footprintOf', () => {
  it('1x1: 25.40mm → {w:1, h:1}', () => {
    expect(footprintOf({ x: 25.40, y: 25.39 })).toEqual({ w: 1, h: 1 });
  });

  it('1x2: 25.40 × 50.83 → {w:1, h:2}', () => {
    expect(footprintOf({ x: 25.40, y: 50.83 })).toEqual({ w: 1, h: 2 });
  });

  it('2x2: 50.80 × 50.80 → {w:2, h:2}', () => {
    expect(footprintOf({ x: 50.80, y: 50.80 })).toEqual({ w: 2, h: 2 });
  });

  it('8x8: 203.20 × 203.13 → {w:8, h:8}', () => {
    expect(footprintOf({ x: 203.20, y: 203.13 })).toEqual({ w: 8, h: 8 });
  });

  it('near-zero → {w:1, h:1} (minimum 1)', () => {
    expect(footprintOf({ x: 1, y: 1 })).toEqual({ w: 1, h: 1 });
  });

  it('wall 2x1: 25.40 × 50.83 → {w:1, h:2}', () => {
    expect(footprintOf({ x: 25.40, y: 50.83 })).toEqual({ w: 1, h: 2 });
  });
});

describe('heightClassOf', () => {
  it('floor 1x1 (z=8.99) → floor', () => {
    const size = { x: 25.40, y: 25.39, z: 8.99 };
    const fp = footprintOf(size);
    expect(heightClassOf(size, fp)).toBe('floor');
  });

  it('floor 8x8 (z=9.17) → prop (wide footprint, not narrow)', () => {
    const size = { x: 203.20, y: 203.13, z: 9.17 };
    const fp = footprintOf(size);
    // z<15 → floor
    expect(heightClassOf(size, fp)).toBe('floor');
  });

  it('wall 1x1 (z=53.00, fp 1x1) → wall', () => {
    const size = { x: 25.40, y: 25.39, z: 53.00 };
    const fp = footprintOf(size);
    expect(heightClassOf(size, fp)).toBe('wall');
  });

  it('wall 2x1 (z=53.00, fp 1x2) → wall (narrow side =1)', () => {
    const size = { x: 25.40, y: 50.83, z: 53.00 };
    const fp = footprintOf(size);
    expect(heightClassOf(size, fp)).toBe('wall');
  });

  it('z=30, fp 2x2 → prop (not narrow)', () => {
    const size = { x: 50.80, y: 50.80, z: 30 };
    const fp = footprintOf(size);
    expect(heightClassOf(size, fp)).toBe('prop');
  });

  it('z=20 → prop (between floor<15 and wall>=30)', () => {
    const size = { x: 25.40, y: 25.40, z: 20 };
    const fp = footprintOf(size);
    expect(heightClassOf(size, fp)).toBe('prop');
  });
});
