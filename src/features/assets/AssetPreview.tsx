import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TileType, ModelTransform } from '../../lib/db/schema';
import { loadSTLBlob } from '../../lib/db/blobs';
import { buildGeometry, applyModelTransform } from '../../lib/three/geometry';

interface Props {
  tile: TileType;
  rx: number;
  ry: number;
  rz: number;
  offsetY: number;
}

export function AssetPreview({ tile, rx, ry, rz, offsetY }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Three.js objects live outside React state
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.Mesh | null;
    rafId: number;
    needsRender: boolean;
  } | null>(null);

  // Cached base geometry for the current stlBlobKey (no transform applied)
  const baseGeoRef = useRef<THREE.BufferGeometry | null>(null);

  // Init scene once on mount
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 280;
    const H = mount.clientHeight || 220;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 8, 5);
    scene.add(dir);

    // Faint ground grid for reference (stored for disposal on unmount)
    const grid = new THREE.GridHelper(10, 10, 0x333355, 0x222244);
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 200);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0.5, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.update();

    const t: NonNullable<typeof threeRef.current> = { renderer, scene, camera, controls, mesh: null, rafId: 0, needsRender: true };
    threeRef.current = t;

    function animate() {
      t.rafId = requestAnimationFrame(animate);
      if (!t.needsRender) return;
      t.needsRender = false;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Re-render on orbit/pan/zoom
    controls.addEventListener('change', () => { t.needsRender = true; });

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      t.needsRender = true;
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(t.rafId);
      ro.disconnect();
      controls.dispose();
      grid.geometry.dispose();
      (Array.isArray(grid.material)
        ? (grid.material as THREE.Material[])
        : [grid.material as THREE.Material]
      ).forEach((m) => m.dispose());
      renderer.dispose();
      threeRef.current = null;
      baseGeoRef.current?.dispose();
      baseGeoRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect A: load + parse geometry once per stlBlobKey change
  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      const blob = await loadSTLBlob(tile.stlBlobKey);
      if (cancelled || !blob) return;

      baseGeoRef.current?.dispose();
      baseGeoRef.current = null;

      try {
        baseGeoRef.current = buildGeometry(blob, Infinity);
      } catch {
        return;
      }

      if (!cancelled) {
        swapMesh(baseGeoRef.current);
        fitCamera(baseGeoRef.current);
        if (threeRef.current) threeRef.current.needsRender = true;
      }
    }

    loadBase();
    return () => { cancelled = true; };
  }, [tile.stlBlobKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect B: apply transform on cached base geo (no IDB read, no STL re-parse)
  useEffect(() => {
    if (baseGeoRef.current) {
      swapMesh(baseGeoRef.current);
      if (threeRef.current) threeRef.current.needsRender = true;
    }
  }, [rx, ry, rz, offsetY]); // eslint-disable-line react-hooks/exhaustive-deps

  function swapMesh(baseGeo: THREE.BufferGeometry) {
    const t = threeRef.current;
    if (!t) return;

    if (t.mesh) {
      t.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      t.mesh = null;
    }

    const transform: ModelTransform = { rx, ry, rz, offsetY };
    let geo: THREE.BufferGeometry;
    try {
      geo = applyModelTransform(baseGeo, transform);
    } catch {
      return;
    }

    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.75, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = offsetY;
    t.scene.add(mesh);
    t.mesh = mesh;
  }

  function fitCamera(geo: THREE.BufferGeometry) {
    const t = threeRef.current;
    if (!t) return;
    const bb = new THREE.Box3().setFromBufferAttribute(
      geo.attributes.position as THREE.BufferAttribute
    );
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / (2 * Math.tan((t.camera.fov / 2) * (Math.PI / 180)))) * 1.8;
    t.camera.position.set(dist * 0.7, center.y + dist * 0.5, dist);
    t.controls.target.copy(center);
    t.camera.lookAt(center);
    t.controls.update();
  }

  return (
    <div
      ref={mountRef}
      className="asset-preview-canvas"
      title="Drag to orbit"
    />
  );
}
