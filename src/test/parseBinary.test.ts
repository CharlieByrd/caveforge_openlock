import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBinarySTL, bboxSizeMM, STLParseError } from '../lib/stl/parseBinary';

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parseBinarySTL', () => {
  it('floor_1x1: bbox ~25.40 × 25.39 × 8.99', () => {
    const raw = loadFixture('floor_1x1.stl');
    const { bbox, triangleCount } = parseBinarySTL(raw);
    const size = bboxSizeMM(bbox);
    expect(size.x).toBeCloseTo(25.40, 1);
    expect(size.y).toBeCloseTo(25.39, 1);
    expect(size.z).toBeCloseTo(8.99, 1);
    expect(triangleCount).toBe(39812);
  });

  it('floor_1x2: bbox ~25.40 × 50.83 × 9.15', () => {
    const raw = loadFixture('floor_1x2.stl');
    const { bbox } = parseBinarySTL(raw);
    const size = bboxSizeMM(bbox);
    expect(size.x).toBeCloseTo(25.40, 1);
    expect(size.y).toBeCloseTo(50.83, 1);
    expect(size.z).toBeCloseTo(9.15, 1);
  });

  it('floor_2x2: bbox ~50.80 × 50.80 × 9.12', () => {
    const raw = loadFixture('floor_2x2.stl');
    const { bbox } = parseBinarySTL(raw);
    const size = bboxSizeMM(bbox);
    expect(size.x).toBeCloseTo(50.80, 1);
    expect(size.y).toBeCloseTo(50.80, 1);
  });

  it('wall_1x1: z ~53.00', () => {
    const raw = loadFixture('wall_1x1.stl');
    const { bbox } = parseBinarySTL(raw);
    const size = bboxSizeMM(bbox);
    expect(size.z).toBeCloseTo(53.00, 1);
  });

  it('floor_8x8: bbox ~203.20 × 203.13', () => {
    const raw = loadFixture('floor_8x8.stl');
    const { bbox, triangleCount } = parseBinarySTL(raw);
    const size = bboxSizeMM(bbox);
    expect(size.x).toBeCloseTo(203.20, 0);
    expect(size.y).toBeCloseTo(203.13, 0);
    expect(triangleCount).toBe(379746);
  });

  it('raw bytes identical after parse (raw-integrity)', () => {
    const raw = loadFixture('floor_1x1.stl');
    const { raw: returned } = parseBinarySTL(raw);
    const a = new Uint8Array(raw);
    const b = new Uint8Array(returned);
    expect(b).toEqual(a);
  });

  it('throws STLParseError on truncated data', () => {
    const raw = new ArrayBuffer(10);
    expect(() => parseBinarySTL(raw)).toThrow(STLParseError);
  });

  it('throws STLParseError when triangle count mismatches file size', () => {
    const raw = loadFixture('floor_1x1.stl');
    // Overwrite triangle count with a much larger number
    const copy = raw.slice(0);
    new DataView(copy).setUint32(80, 99999999, true);
    expect(() => parseBinarySTL(copy)).toThrow(STLParseError);
  });
});
