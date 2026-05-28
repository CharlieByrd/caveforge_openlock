export interface BBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface ParsedSTL {
  bbox: BBox;
  triangleCount: number;
  raw: ArrayBuffer;
}

export class STLParseError extends Error {}

export function parseBinarySTL(raw: ArrayBuffer): ParsedSTL {
  const view = new DataView(raw);

  if (raw.byteLength < 84) throw new STLParseError('File too small to be binary STL');

  const triangleCount = view.getUint32(80, true);
  const expectedSize = 84 + triangleCount * 50;

  if (raw.byteLength < expectedSize) {
    throw new STLParseError(
      `Binary STL truncated: expected ${expectedSize} bytes for ${triangleCount} triangles, got ${raw.byteLength}`
    );
  }

  // Check for ASCII STL (starts with "solid " and has "facet" keyword)
  // We don't parse ASCII but we detect it to give better error
  const headerBytes = new Uint8Array(raw, 0, Math.min(256, raw.byteLength));
  const headerText = String.fromCharCode(...headerBytes.slice(0, 5));
  if (headerText === 'solid') {
    // Could be ASCII — check if triangle count makes sense
    // Binary STLs from CAD often start with "solid" too, so trust byte count
    if (triangleCount === 0 || raw.byteLength !== expectedSize) {
      // Likely ASCII
      throw new STLParseError('ASCII STL not supported; please export as binary STL');
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    // skip normal (12 bytes), read 3 vertices × 12 bytes
    offset += 12;
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      offset += 12;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    offset += 2; // attribute byte count
  }

  return {
    bbox: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    triangleCount,
    raw,
  };
}

export interface STLGeometry {
  vertices: Float32Array; // flat XYZ per vertex, 9 floats per triangle
  normals: Float32Array;  // flat XYZ per vertex (face normal repeated)
}

// maxTriangles: if STL exceeds this, uniformly subsample (faster render, slight quality loss).
// Pass Infinity to disable. Default 40_000 is a good balance for 3D preview.
export function extractGeometry(raw: ArrayBuffer, maxTriangles = 40_000): STLGeometry {
  const view = new DataView(raw);
  const triangleCount = view.getUint32(80, true);
  const step = triangleCount > maxTriangles ? Math.ceil(triangleCount / maxTriangles) : 1;
  const kept = Math.ceil(triangleCount / step);

  const vertices = new Float32Array(kept * 9);
  const normals = new Float32Array(kept * 9);

  let out = 0;
  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;

    if (i % step === 0) {
      for (let v = 0; v < 3; v++) {
        const vi = out * 9 + v * 3;
        vertices[vi]     = view.getFloat32(offset + v * 12,     true);
        vertices[vi + 1] = view.getFloat32(offset + v * 12 + 4, true);
        vertices[vi + 2] = view.getFloat32(offset + v * 12 + 8, true);
        normals[vi]      = nx;
        normals[vi + 1]  = ny;
        normals[vi + 2]  = nz;
      }
      out++;
    }
    offset += 36;
    offset += 2;
  }

  return { vertices: vertices.subarray(0, out * 9), normals: normals.subarray(0, out * 9) };
}

export function bboxSizeMM(bbox: BBox): { x: number; y: number; z: number } {
  return {
    x: bbox.max.x - bbox.min.x,
    y: bbox.max.y - bbox.min.y,
    z: bbox.max.z - bbox.min.z,
  };
}
