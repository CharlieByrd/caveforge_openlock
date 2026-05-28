// Write binary STL from flat triangle array
// triangles: [nx,ny,nz, v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z, ...] (12 floats per tri)
export function writeBinarySTL(triangles: Float32Array): ArrayBuffer {
  const count = triangles.length / 12;
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  view.setUint32(80, count, true);
  let off = 84;
  for (let i = 0; i < count; i++) {
    const b = i * 12;
    for (let f = 0; f < 12; f++) { view.setFloat32(off, triangles[b + f], true); off += 4; }
    view.setUint16(off, 0, true); off += 2;
  }
  return buf;
}

// Concat raw STL bodies without parsing — preserves original triangle bytes exactly.
// Returns binary STL with total triangle count and all triangle blocks concatenated.
export function concatRawSTLs(raws: ArrayBuffer[]): ArrayBuffer {
  let totalTris = 0;
  for (const raw of raws) totalTris += new DataView(raw).getUint32(80, true);

  const out = new ArrayBuffer(84 + totalTris * 50);
  new DataView(out).setUint32(80, totalTris, true);
  let off = 84;
  for (const raw of raws) {
    const triCount = new DataView(raw).getUint32(80, true);
    new Uint8Array(out, off).set(new Uint8Array(raw, 84, triCount * 50));
    off += triCount * 50;
  }
  return out;
}

// Apply full placement transform to raw STL and return transformed triangles.
// Transform matches Scene.tsx exactly:
//   1. Rotate -90° X  (STL Z-up → Three.js Y-up)
//   2. Center XZ, floor Y (geometry origin = XZ center, Y=0 at base)
//   3. Rotate -rot° around Y
//   4. Translate to (gx + eff.w/2)*CELL_MM, 0, (gy + eff.h/2)*CELL_MM
export function transformSTL(
  raw: ArrayBuffer,
  gx: number,
  gy: number,
  rotDeg: number,
  footprintEff: { w: number; h: number },
  cellMM: number,
): Float32Array {
  const view = new DataView(raw);
  const count = view.getUint32(80, true);
  const out = new Float32Array(count * 12);

  // Step 1: read + rotate -90° X: (x,y,z)→(x, z, -y)
  const verts: number[] = [];
  const norms: number[] = [];
  let off = 84;
  for (let i = 0; i < count; i++) {
    const nx = view.getFloat32(off, true); const ny = view.getFloat32(off+4, true); const nz = view.getFloat32(off+8, true);
    norms.push(nx, nz, -ny); // rotate normal too
    off += 12;
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(off, true); const y = view.getFloat32(off+4, true); const z = view.getFloat32(off+8, true);
      verts.push(x, z, -y);
      off += 12;
    }
    off += 2;
  }

  // Step 2: compute bbox, center XZ, floor Y
  let minX=Infinity, maxX=-Infinity, minY=Infinity, minZ=Infinity, maxZ=-Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    if (verts[i]   < minX) minX = verts[i];
    if (verts[i]   > maxX) maxX = verts[i];
    if (verts[i+1] < minY) minY = verts[i+1];
    if (verts[i+2] < minZ) minZ = verts[i+2];
    if (verts[i+2] > maxZ) maxZ = verts[i+2];
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < verts.length; i += 3) {
    verts[i]   -= cx;
    verts[i+1] -= minY;
    verts[i+2] -= cz;
  }

  // Step 3: rotate -rot° around Y
  const angle = -(rotDeg * Math.PI) / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  function rotY(x: number, y: number, z: number): [number, number, number] {
    return [x * cosA + z * sinA, y, -x * sinA + z * cosA];
  }

  // Step 4: translate to placement position
  const tx = (gx + footprintEff.w / 2) * cellMM;
  const ty = 0;
  const tz = (gy + footprintEff.h / 2) * cellMM;

  for (let i = 0; i < count; i++) {
    const [rnx, rny, rnz] = rotY(norms[i*3], norms[i*3+1], norms[i*3+2]);
    out[i*12]   = rnx; out[i*12+1] = rny; out[i*12+2] = rnz;
    for (let v = 0; v < 3; v++) {
      const vi = i * 9 + v * 3;
      const [rx, ry, rz] = rotY(verts[vi], verts[vi+1], verts[vi+2]);
      out[i*12 + 3 + v*3]   = rx + tx;
      out[i*12 + 3 + v*3+1] = ry + ty;
      out[i*12 + 3 + v*3+2] = rz + tz;
    }
  }
  return out;
}
