import { describe, it, expect } from 'vitest';
import { splitByN } from '../lib/export/printExport';
import { concatRawSTLs, writeBinarySTL } from '../lib/export/stlWriter';
import type { ExportItem } from '../lib/export/printExport';

let _id = 0;
function mockItem(count: number): ExportItem {
  const id = `tile_${_id++}`;
  const raw = new ArrayBuffer(134);
  new DataView(raw).setUint32(80, 1, true);
  return { tileTypeId: id, packId: 'pack_0', name: id, fileName: `${id}.stl`, raw, count };
}

describe('splitByN', () => {
  it('invariant: sum of counts per item equals original count', () => {
    const items = [mockItem(7), mockItem(3), mockItem(10)];
    for (const n of [1, 2, 3, 4, 7]) {
      const jobs = splitByN(items, n);
      expect(jobs.length).toBe(n);
      for (let i = 0; i < items.length; i++) {
        const total = jobs.reduce((s, job) => {
          const found = job.find(it => it.tileTypeId === items[i].tileTypeId && it.count);
          return s + (found?.count ?? 0);
        }, 0);
        expect(total).toBe(items[i].count);
      }
    }
  });

  it('no job exceeds ceil(count/n) per item', () => {
    const items = [mockItem(10)];
    const jobs = splitByN(items, 3);
    for (const job of jobs) {
      const c = job[0]?.count ?? 0;
      expect(c).toBeLessThanOrEqual(Math.ceil(10 / 3));
    }
  });

  it('empty items returns n empty jobs', () => {
    const jobs = splitByN([], 3);
    expect(jobs.length).toBe(3);
    expect(jobs.every(j => j.length === 0)).toBe(true);
  });

  it('n=1 returns single job with all items', () => {
    const items = [mockItem(5), mockItem(2)];
    const jobs = splitByN(items, 1);
    expect(jobs.length).toBe(1);
    expect(jobs[0].reduce((s, i) => s + i.count, 0)).toBe(7);
  });
});

describe('concatRawSTLs', () => {
  it('triangle count equals sum of inputs', () => {
    function makeSTL(tris: number): ArrayBuffer {
      const buf = new ArrayBuffer(84 + tris * 50);
      new DataView(buf).setUint32(80, tris, true);
      return buf;
    }
    const merged = concatRawSTLs([makeSTL(3), makeSTL(5), makeSTL(2)]);
    expect(new DataView(merged).getUint32(80, true)).toBe(10);
    expect(merged.byteLength).toBe(84 + 10 * 50);
  });

  it('preserves triangle bytes', () => {
    const a = new ArrayBuffer(84 + 50);
    const va = new DataView(a);
    va.setUint32(80, 1, true);
    va.setFloat32(84, 1.5, true); // first float of triangle
    const merged = concatRawSTLs([a]);
    expect(new DataView(merged).getFloat32(84, true)).toBeCloseTo(1.5);
  });
});

describe('writeBinarySTL', () => {
  it('produces correct byte length', () => {
    const tris = new Float32Array(12 * 2); // 2 triangles
    const buf = writeBinarySTL(tris);
    expect(buf.byteLength).toBe(84 + 2 * 50);
    expect(new DataView(buf).getUint32(80, true)).toBe(2);
  });
});
