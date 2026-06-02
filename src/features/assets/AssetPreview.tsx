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
  } | null>(null);

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

    // Faint ground grid for reference
    const grid = new THREE.GridHelper(10, 10, 0x333355, 0x222244);
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 200);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0.5, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.update();

    const t = threeRef.current = { renderer, scene, camera, controls, mesh: null, rafId: 0 };

    function animate() {
      t.rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(t.rafId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      threeRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload mesh whenever tile or transform changes
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    let cancelled = false;

    // Remove old mesh
    if (t.mesh) {
      t.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      t.mesh = null;
    }

    const transform: ModelTransform = { rx, ry, rz, offsetY };

    async function load() {
      const blob = await loadSTLBlob(tile.stlBlobKey);
      if (cancelled || !blob || !threeRef.current) return;
      const t2 = threeRef.current;

      let geo: THREE.BufferGeometry;
      try {
        const base = buildGeometry(blob, 20000);
        geo = applyModelTransform(base, transform);
        base.dispose(); // applyModelTransform always returns a clone
      } catch {
        return;
      }

      const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.75 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = offsetY;
      t2.scene.add(mesh);
      t2.mesh = mesh;
    }
    load();

    return () => { cancelled = true; };
  }, [tile.stlBlobKey, rx, ry, rz, offsetY]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      className="asset-preview-canvas"
      title="Drag to orbit"
    />
  );
}
