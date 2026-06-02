import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { useRenderStore, cssFilter } from '../../store/render';
import { loadSTLBlob } from '../../lib/db/blobs';
import { rotateFootprint, rotToRad } from '../../lib/grid/transform';
import { buildGeometry, applyModelTransform, SCALE } from '../../lib/three/geometry';

const FRUSTUM = 24;

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  perspCam: THREE.PerspectiveCamera;
  orthoCam: THREE.OrthographicCamera;
  perspCtrl: OrbitControls;
  orthoCtrl: OrbitControls;
  meshGroup: THREE.Group;
  ambientLight: THREE.AmbientLight;
  dirLight: THREE.DirectionalLight;
  fog: THREE.FogExp2;
  mode: 'persp' | 'ortho';
  rafId: number;
}

export function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const [topDown, setTopDown] = useState(false);

  const { map } = useMapStore();
  const { tileTypes } = useLibraryStore();
  const renderSettings = useRenderStore();

  // ---- Three.js init (once on mount) ----------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 640;
    const H = mount.clientHeight || 480;
    const aspect = W / H;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const fog = new THREE.FogExp2(0x1a1a2e, 0);
    scene.fog = fog;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(20, 30, 20);
    scene.add(dirLight);

    const rim = new THREE.DirectionalLight(0x6688cc, 0.3);
    rim.position.set(-10, 5, -10);
    scene.add(rim);

    const perspCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
    perspCam.position.set(10, 16, 22);
    perspCam.lookAt(10, 0, 10);
    const perspCtrl = new OrbitControls(perspCam, renderer.domElement);
    perspCtrl.target.set(10, 0, 10);
    perspCtrl.update();

    const orthoCam = new THREE.OrthographicCamera(
      -FRUSTUM * aspect / 2, FRUSTUM * aspect / 2,
      FRUSTUM / 2, -FRUSTUM / 2, 0.1, 1000
    );
    orthoCam.position.set(10, 200, 10);
    orthoCam.lookAt(10, 0, 10);
    const orthoCtrl = new OrbitControls(orthoCam, renderer.domElement);
    orthoCtrl.target.set(10, 0, 10);
    orthoCtrl.enableRotate = false;
    orthoCtrl.update();

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);

    const s: SceneState = {
      renderer, scene, perspCam, orthoCam,
      perspCtrl, orthoCtrl, meshGroup,
      ambientLight, dirLight, fog,
      mode: 'persp', rafId: 0,
    };
    stateRef.current = s;

    function animate() {
      s.rafId = requestAnimationFrame(animate);
      if (s.mode === 'ortho') { orthoCtrl.update(); renderer.render(scene, orthoCam); }
      else                    { perspCtrl.update();  renderer.render(scene, perspCam);  }
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return; // hidden via display:none, skip
      const a = w / h;
      perspCam.aspect = a;
      perspCam.updateProjectionMatrix();
      orthoCam.left   = -FRUSTUM * a / 2;
      orthoCam.right  =  FRUSTUM * a / 2;
      orthoCam.top    =  FRUSTUM / 2;
      orthoCam.bottom = -FRUSTUM / 2;
      orthoCam.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(s.rafId);
      ro.disconnect();
      perspCtrl.dispose();
      orthoCtrl.dispose();
      renderer.dispose();
      stateRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Mesh rebuild on placements / tileTypes change -----------------------
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    s.meshGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    s.meshGroup.clear();

    const ttMap = new Map(tileTypes.map(t => [t.id, t]));

    // For each grid cell, track the highest tile top (world units) so props can sit on top
    const cellTopY = new Map<string, number>();
    for (const p of map.placements) {
      const tt = ttMap.get(p.tileTypeId);
      if (!tt || tt.isProp || tt.heightClass !== 'floor') continue;
      const eff = rotateFootprint(tt.footprint, p.rot);
      const topY = tt.sizeMM.z * SCALE;
      for (let dx = 0; dx < eff.w; dx++) {
        for (let dy = 0; dy < eff.h; dy++) {
          const key = `${p.gx + dx},${p.gy + dy}`;
          cellTopY.set(key, Math.max(cellTopY.get(key) ?? 0, topY));
        }
      }
    }

    let cancelled = false;

    async function load() {
      const CHUNK = 4; // blobs loaded in parallel per batch

      // Collect unique STL keys needed
      const uniqueKeys: string[] = [];
      const seenKeys = new Set<string>();
      for (const p of map.placements) {
        const tt = ttMap.get(p.tileTypeId);
        if (tt && !seenKeys.has(tt.stlBlobKey)) {
          seenKeys.add(tt.stlBlobKey);
          uniqueKeys.push(tt.stlBlobKey);
        }
      }

      // base geo cache: stlBlobKey → geometry (identity transform, shared)
      const geoCache = new Map<string, THREE.BufferGeometry>();
      // oriented geo cache: "${stlBlobKey}|${rx}|${ry}|${rz}" → geometry with modelTransform applied
      const orientedCache = new Map<string, THREE.BufferGeometry>();
      const matCache = new Map<string, THREE.MeshStandardMaterial>();

      // Load + build in chunks of CHUNK, add meshes as each chunk completes
      for (let i = 0; i < uniqueKeys.length; i += CHUNK) {
        if (cancelled) return;
        const chunkKeys = uniqueKeys.slice(i, i + CHUNK);

        const blobEntries = await Promise.all(
          chunkKeys.map(async (key) => {
            const blob = await loadSTLBlob(key);
            return [key, blob] as const;
          })
        );
        if (cancelled) return;

        for (const [key, blob] of blobEntries) {
          if (!blob) continue;
          try { geoCache.set(key, buildGeometry(blob, renderSettings.maxTriangles)); } catch { /* skip bad STL */ }
        }

        // Add meshes for all placements whose STL is now ready
        for (const p of map.placements) {
          if (cancelled) return;
          const tt = ttMap.get(p.tileTypeId);
          if (!tt || !chunkKeys.includes(tt.stlBlobKey)) continue;
          const baseGeo = geoCache.get(tt.stlBlobKey);
          if (!baseGeo) continue;

          // Get or build oriented geometry for this tileType's modelTransform
          const mt = tt.modelTransform;
          const orientKey = mt
            ? `${tt.stlBlobKey}|${mt.rx}|${mt.ry}|${mt.rz}`
            : tt.stlBlobKey;
          if (!orientedCache.has(orientKey)) {
            orientedCache.set(orientKey, applyModelTransform(baseGeo, mt));
          }
          const orientedGeo = orientedCache.get(orientKey)!;

          if (!matCache.has(tt.id)) {
            matCache.set(tt.id, new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.75 }));
          }

          const mesh = new THREE.Mesh(orientedGeo.clone(), matCache.get(tt.id)!);
          const eff = rotateFootprint(tt.footprint, p.rot);
          const posY = tt.isProp ? (() => {
            const key = `${p.gx},${p.gy}`;
            if (cellTopY.has(key)) return cellTopY.get(key)!;
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const h = cellTopY.get(`${p.gx + dx},${p.gy + dy}`);
                if (h !== undefined) return h;
              }
            }
            return 0;
          })() : 0;
          const offsetY = mt?.offsetY ?? 0;
          mesh.position.set(p.gx + eff.w / 2, posY + offsetY, p.gy + eff.h / 2);
          mesh.rotation.y = -rotToRad(p.rot);
          stateRef.current?.meshGroup.add(mesh);
        }

        // Dispose base geometries for this chunk; oriented ones cleaned below
        for (const key of chunkKeys) { geoCache.get(key)?.dispose(); geoCache.delete(key); }
      }

      // Dispose oriented geometries
      for (const geo of orientedCache.values()) geo.dispose();
    }
    load();
    return () => { cancelled = true; };
  }, [map.placements, tileTypes, renderSettings.maxTriangles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sync render settings → Three.js objects + CSS filter ----------------
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.ambientLight.intensity = renderSettings.ambient;
  }, [renderSettings.ambient]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.dirLight.intensity = renderSettings.dirLight;
  }, [renderSettings.dirLight]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.fog.density = renderSettings.fogDensity;
  }, [renderSettings.fogDensity]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.renderer.domElement.style.filter = cssFilter(renderSettings);
  }, [renderSettings.contrast, renderSettings.brightness, renderSettings.saturation]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCamera() {
    const s = stateRef.current;
    if (!s) return;
    const next = s.mode === 'persp' ? 'ortho' : 'persp';
    s.mode = next;
    setTopDown(next === 'ortho');
  }

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={toggleCamera}
        title={topDown ? 'Switch to 3D orbit view' : 'Switch to top-down orthographic view'}
        style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 10,
          padding: '4px 10px', fontSize: 11,
          background: topDown ? 'rgba(233,69,96,0.85)' : 'rgba(15,52,96,0.85)',
          border: '1px solid #1a5276', color: '#e0e0e0',
          borderRadius: 4, cursor: 'pointer',
        }}
      >{topDown ? '3D Orbit' : 'Top-Down'}</button>
    </div>
  );
}
