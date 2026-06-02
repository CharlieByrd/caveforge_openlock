/**
 * geomWorker — off-main-thread geometry pipeline:
 *   parse binary STL → index vertices (weld by position) →
 *   QEM simplify via meshoptimizer (if over budget) →
 *   compute smooth vertex normals →
 *   quantize normals to Int8
 *
 * Returns transferable typed arrays so the main thread just builds
 * the THREE.BufferGeometry without any heavy CPU work.
 */

import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { STLParseError } from '../lib/stl/parseBinary';

// ---- Types ------------------------------------------------------------------

export interface GeomRequest {
  id: string;
  raw: ArrayBuffer;
  maxTriangles: number; // simplify target; Infinity = no simplification
}

export interface GeomResult {
  id: string;
  // Indexed geometry data (all transferable)
  positions: Float32Array;    // unique vertex positions, stride 3
  normals_i8: Int8Array;      // quantized smooth normals (Int8 normalized), stride 3
  indices: Uint32Array;
  error?: string;
}

// ---- STL flat-position extraction (no normals — recomputed later) -----------

/**
 * Parse binary STL, return flat Float32Array of vertex positions.
 * 9 floats per triangle (3 vertices × 3 coords). No normals included.
 */
function extractPositions(raw: ArrayBuffer): Float32Array {
  if (raw.byteLength < 84) throw new STLParseError('File too small to be binary STL');
  const view = new DataView(raw);
  const triangleCount = view.getUint32(80, true);
  const expectedSize = 84 + triangleCount * 50;
  if (raw.byteLength < expectedSize) {
    throw new STLParseError(
      `Binary STL truncated: expected ${expectedSize} bytes for ${triangleCount} triangles`
    );
  }
  const headerText = String.fromCharCode(...new Uint8Array(raw, 0, 5));
  if (headerText === 'solid' && (triangleCount === 0 || raw.byteLength !== expectedSize)) {
    throw new STLParseError('ASCII STL not supported; please export as binary STL');
  }

  const positions = new Float32Array(triangleCount * 9);
  let out = 0;
  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    offset += 12; // skip face normal
    for (let v = 0; v < 3; v++) {
      positions[out++] = view.getFloat32(offset,     true);
      positions[out++] = view.getFloat32(offset + 4, true);
      positions[out++] = view.getFloat32(offset + 8, true);
      offset += 12;
    }
    offset += 2; // attribute byte count
  }
  return positions;
}

// ---- Vertex deduplication → indexed geometry --------------------------------

/**
 * Weld vertices with identical positions.
 * Returns unique positions Float32Array and Uint32Array index buffer.
 * Matching is exact (bit-identical floats) which is correct for CAD-generated STLs.
 */
function indexPositions(flatPositions: Float32Array): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  const vertexCount = flatPositions.length / 3;
  const vertexMap = new Map<string, number>();
  const uniqueXYZ: number[] = [];
  const indices = new Uint32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = flatPositions[i * 3];
    const y = flatPositions[i * 3 + 1];
    const z = flatPositions[i * 3 + 2];
    const key = `${x}|${y}|${z}`;
    let idx = vertexMap.get(key);
    if (idx === undefined) {
      idx = uniqueXYZ.length / 3;
      vertexMap.set(key, idx);
      uniqueXYZ.push(x, y, z);
    }
    indices[i] = idx;
  }

  return { positions: new Float32Array(uniqueXYZ), indices };
}

// ---- QEM simplification via meshoptimizer -----------------------------------

let simplifierReady: Promise<void> | undefined;

function ensureSimplifier(): Promise<void> {
  if (!simplifierReady) simplifierReady = MeshoptSimplifier.ready;
  return simplifierReady;
}

/**
 * Simplify indexed geometry to at most targetTriangles triangles using QEM.
 * Returns a new (possibly smaller) index buffer and same positions.
 */
function simplifyMesh(
  positions: Float32Array,
  indices: Uint32Array,
  targetTriangles: number,
): Uint32Array {
  const targetIndexCount = targetTriangles * 3;
  // target_error: allow up to 5% geometric error relative to mesh scale
  const [newIndices] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3, // stride = xyz
    Math.min(targetIndexCount, indices.length),
    0.05,
    ['Prune'],
  );
  return newIndices;
}

// ---- Smooth vertex normals --------------------------------------------------

/**
 * Compute smooth vertex normals from indexed geometry.
 * Accumulates face normals at each vertex, then normalizes.
 * Returns Float32Array of length positions.length (stride 3).
 */
function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length); // zero-initialized

  for (let i = 0; i < indices.length; i += 3) {
    const ai = indices[i]     * 3;
    const bi = indices[i + 1] * 3;
    const ci = indices[i + 2] * 3;

    // Edge vectors
    const abx = positions[bi]     - positions[ai];
    const aby = positions[bi + 1] - positions[ai + 1];
    const abz = positions[bi + 2] - positions[ai + 2];

    const acx = positions[ci]     - positions[ai];
    const acy = positions[ci + 1] - positions[ai + 1];
    const acz = positions[ci + 2] - positions[ai + 2];

    // Cross product (face normal, un-normalized)
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    // Accumulate at each vertex
    normals[ai]     += nx; normals[ai + 1] += ny; normals[ai + 2] += nz;
    normals[bi]     += nx; normals[bi + 1] += ny; normals[bi + 2] += nz;
    normals[ci]     += nx; normals[ci + 1] += ny; normals[ci + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
    if (len > 0) {
      normals[i]     /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return normals;
}

// ---- Normal quantization → Int8 normalized ----------------------------------

/**
 * Quantize float normals in [-1, 1] to Int8 in [-127, 127].
 * Three.js interprets Int8BufferAttribute(arr, 3, true) as normalized,
 * mapping ±127 → ±1. MeshStandardMaterial works correctly with normalized int8 normals.
 */
function quantizeNormals(normals: Float32Array): Int8Array {
  const q = new Int8Array(normals.length);
  for (let i = 0; i < normals.length; i++) {
    // clamp then scale; avoid -128 (undefined in some implementations)
    q[i] = Math.max(-127, Math.min(127, Math.round(normals[i] * 127)));
  }
  return q;
}

// ---- Main STL → Y-up → scale transforms ------------------------------------

// These must match geometry.ts constants:
const CELL_MM = 25.4; // must match src/lib/grid/cell.ts CELL_MM (1 inch)
const SCALE = 1 / CELL_MM;

/**
 * Apply the STL-to-three.js coordinate transform in-place on flat positions:
 *   rotate -90° around X (Y-forward STL → Y-up three.js), then scale by SCALE.
 * STL: X=right, Y=depth (into screen), Z=up
 * THREE: X=right, Y=up, Z=out of screen
 * Rotation -90° X: y' = z, z' = -y
 */
function transformSTLToThreeJS(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    // Rotate -90° X then scale
    positions[i]     =  x * SCALE;
    positions[i + 1] =  z * SCALE;  // y' = z
    positions[i + 2] = -y * SCALE;  // z' = -y
  }
}

/**
 * Center X/Z and seat minY=0, in-place.
 */
function centerAndSeat(positions: Float32Array): void {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i]     -= cx;
    positions[i + 1] -= minY;
    positions[i + 2] -= cz;
  }
}

// ---- Worker message handler -------------------------------------------------

self.onmessage = async (e: MessageEvent<GeomRequest>) => {
  const { id, raw, maxTriangles } = e.data;
  try {
    await ensureSimplifier();

    // 1. Parse STL → flat positions (9 floats / triangle)
    const flatPositions = extractPositions(raw);
    const triangleCount = flatPositions.length / 9;

    // 2. Apply coordinate transform + scale (STL-to-three.js, Y-up, SCALE)
    transformSTLToThreeJS(flatPositions);

    // 3. Weld identical positions → indexed geometry
    let { positions, indices } = indexPositions(flatPositions);

    // 4. Center X/Z, seat minY=0 (on unique positions after indexing)
    centerAndSeat(positions);

    // 5. QEM simplify if over budget
    if (isFinite(maxTriangles) && triangleCount > maxTriangles) {
      indices = simplifyMesh(positions, indices, maxTriangles);
    }

    // 6. Compute smooth vertex normals
    const normalsF32 = computeVertexNormals(positions, indices);

    // 7. Quantize normals to Int8 normalized (4× memory savings on normals)
    const normals_i8 = quantizeNormals(normalsF32);

    const result: GeomResult = { id, positions, normals_i8, indices };
    (self as unknown as Worker).postMessage(result, {
      transfer: [positions.buffer, normals_i8.buffer, indices.buffer],
    });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } as GeomResult);
  }
};
