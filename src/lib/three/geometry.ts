import * as THREE from 'three';
import { parseBinarySTL, extractGeometry } from '../stl/parseBinary';
import { CELL_MM } from '../grid/cell';
import type { ModelTransform } from '../db/schema';

export const SCALE = 1 / CELL_MM;

export const STL_TO_THREEJS = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** Build base geometry from raw STL blob. Centers X/Z and seats minY=0. */
export function buildGeometry(blob: ArrayBuffer, maxTriangles: number): THREE.BufferGeometry {
  parseBinarySTL(blob);
  const { vertices, normals } = extractGeometry(blob, maxTriangles);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  geo.applyMatrix4(STL_TO_THREEJS);
  geo.scale(SCALE, SCALE, SCALE);

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(
    -((bb.min.x + bb.max.x) / 2),
    -bb.min.y,
    -((bb.min.z + bb.max.z) / 2),
  );
  return geo;
}

const DEG = Math.PI / 180;

/** Returns true when transform is identity (all zeros / undefined). */
export function isIdentityTransform(t: ModelTransform | undefined): boolean {
  if (!t) return true;
  return t.rx === 0 && t.ry === 0 && t.rz === 0 && (!t.offsetY || t.offsetY === 0);
}

/**
 * Clone baseGeo, apply per-asset rotation (rx/ry/rz in degrees), then
 * re-center X/Z and re-seat minY=0 so the oriented model still sits on
 * the floor centered in its footprint.
 * Always returns a new clone (caller owns the clone and must dispose it).
 */
export function applyModelTransform(
  baseGeo: THREE.BufferGeometry,
  t: ModelTransform | undefined,
): THREE.BufferGeometry {
  const geo = baseGeo.clone();
  if (isIdentityTransform(t)) return geo;

  const euler = new THREE.Euler(
    (t!.rx ?? 0) * DEG,
    (t!.ry ?? 0) * DEG,
    (t!.rz ?? 0) * DEG,
    'XYZ',
  );
  const mat = new THREE.Matrix4().makeRotationFromEuler(euler);
  geo.applyMatrix4(mat);

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(
    -((bb.min.x + bb.max.x) / 2),
    -bb.min.y,
    -((bb.min.z + bb.max.z) / 2),
  );
  return geo;
}
