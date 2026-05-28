import * as THREE from 'three';

export interface IconRequest {
  id: string;
  raw: ArrayBuffer;
  footprint: { w: number; h: number };
}

export interface IconResult {
  id: string;
  topDataUrl: string;
  error?: string;
}

const TILE_PX = 64;

let _renderer: THREE.WebGLRenderer | null = null;
let _rW = 0;
let _rH = 0;

function getRenderer(w: number, h: number): THREE.WebGLRenderer {
  if (!_renderer) {
    const canvas = new OffscreenCanvas(w, h);
    _renderer = new THREE.WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    _renderer.setPixelRatio(1);
    _rW = w;
    _rH = h;
  }
  if (_rW !== w || _rH !== h) {
    _renderer.setSize(w, h, false);
    _rW = w;
    _rH = h;
  }
  return _renderer;
}

self.onmessage = async (e: MessageEvent<IconRequest>) => {
  const { id, raw, footprint } = e.data;
  try {
    const topDataUrl = renderTopDown(raw, footprint);
    self.postMessage({ id, topDataUrl } satisfies IconResult);
  } catch (err) {
    self.postMessage({ id, topDataUrl: '', error: String(err) } satisfies IconResult);
  }
};

function renderTopDown(raw: ArrayBuffer, footprint: { w: number; h: number }): string {
  // Canvas: exactly footprint cells × TILE_PX — no padding, no square rounding
  const W = TILE_PX * footprint.w;
  const H = TILE_PX * footprint.h;
  const renderer = getRenderer(W, H);

  // Parse and center geometry at origin
  const geo = parseSTLGeometry(raw);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  geo.translate(-center.x, -center.y, -center.z);

  // Re-read size after centering (min/max now symmetric)
  const sz = new THREE.Vector3();
  bb.getSize(sz);
  // STL axes: X=right, Y=into screen, Z=up
  // Mesh rotation -PI/2 on X maps STL to Three.js Y-up:
  //   STL X → Three.js X
  //   STL Y → Three.js -Z
  //   STL Z → Three.js Y
  // Top-down camera sees Three.js XZ plane = STL XY plane

  const halfW = sz.x / 2;           // STL X half-extent
  const halfH = sz.y / 2;           // STL Y half-extent (Three.js Z)
  const meshHeight = sz.z;           // STL Z = Three.js Y (up)
  const camDist = meshHeight * 4 + 10;
  const camFar = camDist + meshHeight + 10;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.6, 1, 0.7);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xaabbdd, 0.25);
  fill.position.set(-0.5, 0.5, -0.3);
  scene.add(fill);

  const mat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.55, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  // Orthographic camera: frustum exactly fits STL XY extent → fills 100% of canvas
  // camera.up = (0,0,-1) prevents gimbal lock when looking straight down
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, camFar);
  cam.up.set(0, 0, -1);
  cam.position.set(0, camDist, 0);
  cam.lookAt(0, 0, 0);

  renderer.render(scene, cam);

  // Read pixels (WebGL origin = bottom-left)
  const pixels = new Uint8Array(W * H * 4);
  renderer.getContext().readPixels(0, 0, W, H, 0x1908 /* RGBA */, 0x1401 /* UNSIGNED_BYTE */, pixels);

  geo.dispose();
  mat.dispose();

  // Flip rows (bottom→top becomes top→bottom) + contrast boost
  const flipped = new Uint8ClampedArray(W * H * 4);
  const stride = W * 4;
  for (let row = 0; row < H; row++) {
    const src = pixels.subarray((H - 1 - row) * stride, (H - row) * stride);
    const dst = row * stride;
    for (let i = 0; i < stride; i += 4) {
      flipped[dst + i]     = contrastByte(src[i]);
      flipped[dst + i + 1] = contrastByte(src[i + 1]);
      flipped[dst + i + 2] = contrastByte(src[i + 2]);
      flipped[dst + i + 3] = src[i + 3]; // alpha unchanged
    }
  }

  return encodePng(flipped, W, H);
}

// S-curve contrast: pull shadows down, push highlights up
function contrastByte(v: number): number {
  const t = v / 255;
  // smooth-step style: increases contrast around midpoint
  const c = t < 0.5
    ? 2 * t * t
    : 1 - 2 * (1 - t) * (1 - t);
  // blend between original and curve (strength 0.7)
  return Math.round((t * 0.3 + c * 0.7) * 255);
}

function parseSTLGeometry(raw: ArrayBuffer): THREE.BufferGeometry {
  const view = new DataView(raw);
  const triCount = view.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;
    for (let v = 0; v < 3; v++) {
      const base = i * 9 + v * 3;
      positions[base]     = view.getFloat32(offset,      true);
      positions[base + 1] = view.getFloat32(offset + 4,  true);
      positions[base + 2] = view.getFloat32(offset + 8,  true);
      normals[base]     = nx;
      normals[base + 1] = ny;
      normals[base + 2] = nz;
      offset += 12;
    }
    offset += 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  return geo;
}

// ---- Minimal uncompressed PNG encoder ----------------------------------------

function encodePng(pixels: Uint8ClampedArray, w: number, h: number): string {
  const scanline = w * 4 + 1;
  const raw = new Uint8Array(h * scanline);
  for (let y = 0; y < h; y++) {
    raw[y * scanline] = 0;
    raw.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), y * scanline + 1);
  }

  const sig  = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', [...u32be(w), ...u32be(h), 8, 6, 0, 0, 0]);
  const idat = chunk('IDAT', zlibStore(raw));
  const iend = chunk('IEND', []);

  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let pos = 0;
  for (const part of [sig, ihdr, idat, iend]) { out.set(part, pos); pos += part.length; }

  let bin = '';
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
  return 'data:image/png;base64,' + btoa(bin);
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: number[] | Uint8Array): Uint8Array {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = new Uint8Array(4 + 4 + d.length + 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, d.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(d, 8);
  v.setUint32(8 + d.length, crc32(out.subarray(4, 8 + d.length)));
  return out;
}

function zlibStore(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks = Math.ceil(data.length / MAX) || 1;
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let pos = 2;
  for (let b = 0; b < blocks; b++) {
    const s = b * MAX;
    const e = Math.min(s + MAX, data.length);
    const len = e - s;
    const last = b === blocks - 1 ? 1 : 0;
    out[pos++] = last;
    out[pos++] = len & 0xff;       out[pos++] = (len >>> 8) & 0xff;
    out[pos++] = (~len) & 0xff;    out[pos++] = ((~len) >>> 8) & 0xff;
    out.set(data.subarray(s, e), pos);
    pos += len;
  }
  let s1 = 1, s2 = 0;
  for (let i = 0; i < data.length; i++) { s1 = (s1 + data[i]) % 65521; s2 = (s2 + s1) % 65521; }
  const adler = (s2 << 16) | s1;
  out[pos++] = (adler >>> 24) & 0xff; out[pos++] = (adler >>> 16) & 0xff;
  out[pos++] = (adler >>> 8)  & 0xff; out[pos++] = adler & 0xff;
  return out.subarray(0, pos);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
