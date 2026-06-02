import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { useRenderStore, cssFilter } from '../../store/render';
import { loadSTLBlob } from '../../lib/db/blobs';
import { rotateFootprint, rotToRad } from '../../lib/grid/transform';
import { buildGeometry, applyModelTransform, SCALE } from '../../lib/three/geometry';
import type { TileType } from '../../lib/db/schema';
import type { Placement } from '../../lib/db/schema';

const FRUSTUM = 24;

interface MeshEntry {
  mesh: THREE.Mesh;
  orientKey: string;
  sig: string;
}

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
  // On-demand rendering (P1)
  needsRender: boolean;
  // Persistent geometry/material caches across rebuilds (P0 + L1)
  geoTemplates: Map<string, THREE.BufferGeometry>;     // orientKey → template
  geoTemplateRefs: Map<string, Set<string>>;            // orientKey → Set<uid>
  matCache: Map<string, THREE.MeshStandardMaterial>;   // tileTypeId → material
  meshByUid: Map<string, MeshEntry>;
}

// Compute a per-placement geometry signature. Changing any field forces a mesh rebuild.
function placementSig(p: Placement, tt: TileType, maxTriangles: number): string {
  const mt = tt.modelTransform;
  return [
    p.uid, p.tileTypeId, p.gx, p.gy, p.rot,
    tt.stlBlobKey,
    mt?.rx ?? 0, mt?.ry ?? 0, mt?.rz ?? 0, mt?.offsetY ?? 0,
    tt.footprint.w, tt.footprint.h, tt.sizeMM.z,
    tt.isProp ? 1 : 0, tt.heightClass,
    maxTriangles,
  ].join(',');
}

// Key for a geometry template (same STL + same rotation bake = same template).
function toOrientKey(tt: TileType): string {
  const mt = tt.modelTransform;
  return mt
    ? `${tt.stlBlobKey}|${mt.rx}|${mt.ry}|${mt.rz}`
    : tt.stlBlobKey;
}

// Build cellTopY map from floor placements.
function buildCellTopY(
  placements: Placement[],
  ttMap: Map<string, TileType>,
): Map<string, number> {
  const cellTopY = new Map<string, number>();
  for (const p of placements) {
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
  return cellTopY;
}

// Resolve the Y position for a prop given cellTopY.
function resolvePropY(p: Placement, cellTopY: Map<string, number>): number {
  const direct = cellTopY.get(`${p.gx},${p.gy}`);
  if (direct !== undefined) return direct;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const h = cellTopY.get(`${p.gx + dx},${p.gy + dy}`);
      if (h !== undefined) return h;
    }
  }
  return 0;
}

export function Scene({ active }: { active: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const [topDown, setTopDown] = useState(false);
  const activeRef = useRef(active);

  const { map } = useMapStore();
  const { tileTypes } = useLibraryStore();
  const renderSettings = useRenderStore();

  // Keep activeRef in sync; flush one render when becoming visible
  useEffect(() => {
    activeRef.current = active;
    if (active && stateRef.current) {
      stateRef.current.needsRender = true;
    }
  }, [active]);

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
      needsRender: true,
      geoTemplates: new Map(),
      geoTemplateRefs: new Map(),
      matCache: new Map(),
      meshByUid: new Map(),
    };
    stateRef.current = s;

    // On-demand render: re-render whenever controls move (P1)
    function requestRender() { s.needsRender = true; }
    perspCtrl.addEventListener('change', requestRender);
    orthoCtrl.addEventListener('change', requestRender);

    function animate() {
      s.rafId = requestAnimationFrame(animate);
      if (!activeRef.current || !s.needsRender) return;
      s.needsRender = false;
      if (s.mode === 'ortho') { orthoCtrl.update(); renderer.render(scene, orthoCam); }
      else                    { perspCtrl.update();  renderer.render(scene, perspCam);  }
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      const a = w / h;
      perspCam.aspect = a;
      perspCam.updateProjectionMatrix();
      orthoCam.left   = -FRUSTUM * a / 2;
      orthoCam.right  =  FRUSTUM * a / 2;
      orthoCam.top    =  FRUSTUM / 2;
      orthoCam.bottom = -FRUSTUM / 2;
      orthoCam.updateProjectionMatrix();
      renderer.setSize(w, h);
      s.needsRender = true;
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(s.rafId);
      ro.disconnect();
      perspCtrl.dispose();
      orthoCtrl.dispose();
      // Dispose all persistent geometry/material caches (P0 + L1)
      for (const geo of s.geoTemplates.values()) geo.dispose();
      for (const mat of s.matCache.values()) mat.dispose();
      for (const { mesh } of s.meshByUid.values()) mesh.geometry.dispose();
      s.geoTemplates.clear();
      s.geoTemplateRefs.clear();
      s.matCache.clear();
      s.meshByUid.clear();
      // Dispose renderer WebGL context
      renderer.dispose();
      stateRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Keep ttMapRef in sync — used by rebuild effect without listing tileTypes as dep ----
  const ttMapRef = useRef<Map<string, TileType>>(new Map());
  useEffect(() => {
    ttMapRef.current = new Map(tileTypes.map(t => [t.id, t]));
  }, [tileTypes]);

  // ---- Geometry signature — only changes when placed tiles' geometry changes ----
  // This prevents the rebuild from firing when unrelated tiles are imported.
  const geomSignature = useMemo(() => {
    const ttMap = new Map(tileTypes.map(t => [t.id, t]));
    return map.placements.map(p => {
      const tt = ttMap.get(p.tileTypeId);
      if (!tt) return p.tileTypeId;
      const mt = tt.modelTransform;
      return [
        p.uid, p.tileTypeId, p.gx, p.gy, p.rot,
        tt.stlBlobKey,
        mt?.rx ?? 0, mt?.ry ?? 0, mt?.rz ?? 0, mt?.offsetY ?? 0,
        tt.footprint.w, tt.footprint.h, tt.sizeMM.z,
        tt.isProp ? 1 : 0, tt.heightClass,
      ].join(',');
    }).sort().join('|');
  }, [map.placements, tileTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track previous maxTriangles to detect changes that require full template purge
  const prevMaxTriRef = useRef<number>(renderSettings.maxTriangles);

  // ---- Incremental mesh rebuild — diff by placement uid (P0 + L1) ----------------
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    const ttMap = ttMapRef.current;
    const maxTriangles = renderSettings.maxTriangles;

    // If maxTriangles changed, all templates are stale → purge everything for full rebuild
    if (prevMaxTriRef.current !== maxTriangles) {
      prevMaxTriRef.current = maxTriangles;
      for (const geo of s.geoTemplates.values()) geo.dispose();
      for (const { mesh } of s.meshByUid.values()) {
        s.meshGroup.remove(mesh);
        mesh.geometry.dispose();
      }
      s.geoTemplates.clear();
      s.geoTemplateRefs.clear();
      s.meshByUid.clear();
      // Materials are still valid — just the geometry poly count changed
    }

    // 1. Compute new per-placement sigs
    interface PlacementInfo {
      p: Placement;
      tt: TileType;
      sig: string;
      ok: string; // orientKey
    }
    const newInfos = new Map<string, PlacementInfo>();
    for (const p of map.placements) {
      const tt = ttMap.get(p.tileTypeId);
      if (!tt) continue;
      newInfos.set(p.uid, {
        p, tt,
        sig: placementSig(p, tt, maxTriangles),
        ok: toOrientKey(tt),
      });
    }

    // 2. Remove stale meshes (uid gone or sig changed)
    for (const [uid, entry] of s.meshByUid) {
      const info = newInfos.get(uid);
      if (!info || info.sig !== entry.sig) {
        s.meshGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        // Decref template
        const refs = s.geoTemplateRefs.get(entry.orientKey);
        if (refs) {
          refs.delete(uid);
          if (refs.size === 0) {
            s.geoTemplates.get(entry.orientKey)?.dispose();
            s.geoTemplates.delete(entry.orientKey);
            s.geoTemplateRefs.delete(entry.orientKey);
          }
        }
        s.meshByUid.delete(uid);
      }
    }

    // 3. Which UIDs need adding?
    const toAdd: PlacementInfo[] = [];
    for (const [uid, info] of newInfos) {
      if (!s.meshByUid.has(uid)) toAdd.push(info);
    }

    // Helper: update prop Y positions for all live props after floor changes
    function updatePropPositions(sc: SceneState, cellTopY: Map<string, number>) {
      for (const [uid, entry] of sc.meshByUid) {
        const info = newInfos.get(uid);
        if (!info || !info.tt.isProp) continue;
        const mt = info.tt.modelTransform;
        const eff = rotateFootprint(info.tt.footprint, info.p.rot);
        const posY = resolvePropY(info.p, cellTopY);
        const offsetY = mt?.offsetY ?? 0;
        entry.mesh.position.set(info.p.gx + eff.w / 2, posY + offsetY, info.p.gy + eff.h / 2);
      }
    }

    if (toAdd.length === 0) {
      // No new meshes — just refresh prop Y in case floor tiles moved
      updatePropPositions(s, buildCellTopY(map.placements, ttMap));
      s.needsRender = true;
      return;
    }

    // 4. Identify which STL blobs need loading for missing templates
    //    Group by stlBlobKey so we load each blob once even if multiple orientations needed
    const blobToOrients = new Map<string, { ok: string; tt: TileType }[]>();
    for (const info of toAdd) {
      if (s.geoTemplates.has(info.ok)) continue; // template already present
      const list = blobToOrients.get(info.tt.stlBlobKey) ?? [];
      // Dedupe: same orientKey may appear multiple times in toAdd
      if (!list.some(x => x.ok === info.ok)) {
        list.push({ ok: info.ok, tt: info.tt });
      }
      blobToOrients.set(info.tt.stlBlobKey, list);
    }

    let cancelled = false;
    const CHUNK = 4;
    const uniqueSTLKeys = [...blobToOrients.keys()];

    async function load(sc: SceneState) {
      // Load missing STL blobs and build geometry templates
      for (let i = 0; i < uniqueSTLKeys.length; i += CHUNK) {
        if (cancelled) return;
        const chunkKeys = uniqueSTLKeys.slice(i, i + CHUNK);

        const blobEntries = await Promise.all(
          chunkKeys.map(async (key) => {
            const blob = await loadSTLBlob(key);
            return [key, blob] as const;
          })
        );
        if (cancelled) return;

        for (const [key, blob] of blobEntries) {
          if (!blob) continue;
          let baseGeo: THREE.BufferGeometry;
          try {
            baseGeo = buildGeometry(blob, maxTriangles);
          } catch {
            continue; // skip bad STL
          }

          // Build all needed oriented templates for this blob
          const orients = blobToOrients.get(key) ?? [];
          for (const { ok, tt } of orients) {
            if (!sc.geoTemplates.has(ok)) {
              const template = applyModelTransform(baseGeo, tt.modelTransform);
              sc.geoTemplates.set(ok, template);
              sc.geoTemplateRefs.set(ok, new Set());
            }
          }
          baseGeo.dispose(); // base geo no longer needed; templates own the GPU data
        }
      }

      if (cancelled) return;

      // Compute cellTopY from ALL current placements (floors only)
      const cellTopY = buildCellTopY(map.placements, ttMap);

      // 5. Instantiate meshes for all new placements
      for (const info of toAdd) {
        if (cancelled) return;
        const template = sc.geoTemplates.get(info.ok);
        if (!template) continue; // STL failed to load

        // Ensure material exists for this tile type
        if (!sc.matCache.has(info.tt.id)) {
          sc.matCache.set(info.tt.id, new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.75 }));
        }

        const mesh = new THREE.Mesh(
          template.clone(), // each mesh owns its geometry (for position-bake freedom)
          sc.matCache.get(info.tt.id)!,
        );

        const mt = info.tt.modelTransform;
        const eff = rotateFootprint(info.tt.footprint, info.p.rot);
        const posY = info.tt.isProp ? resolvePropY(info.p, cellTopY) : 0;
        const offsetY = mt?.offsetY ?? 0;
        mesh.position.set(info.p.gx + eff.w / 2, posY + offsetY, info.p.gy + eff.h / 2);
        mesh.rotation.y = -rotToRad(info.p.rot);

        sc.meshGroup.add(mesh);

        // Register in caches
        sc.meshByUid.set(info.p.uid, { mesh, orientKey: info.ok, sig: info.sig });
        sc.geoTemplateRefs.get(info.ok)!.add(info.p.uid);
      }

      if (cancelled) return;

      // Update all props' Y positions in case new floor tiles changed cell heights
      updatePropPositions(sc, buildCellTopY(map.placements, ttMap));
      sc.needsRender = true;
    }

    load(s);
    return () => { cancelled = true; };
  }, [geomSignature, renderSettings.maxTriangles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sync render settings → Three.js objects + CSS filter ----------------
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.ambientLight.intensity = renderSettings.ambient;
    s.needsRender = true;
  }, [renderSettings.ambient]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.dirLight.intensity = renderSettings.dirLight;
    s.needsRender = true;
  }, [renderSettings.dirLight]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.fog.density = renderSettings.fogDensity;
    s.needsRender = true;
  }, [renderSettings.fogDensity]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.renderer.domElement.style.filter = cssFilter(renderSettings);
    s.needsRender = true;
  }, [renderSettings.contrast, renderSettings.brightness, renderSettings.saturation]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCamera() {
    const s = stateRef.current;
    if (!s) return;
    const next = s.mode === 'persp' ? 'ortho' : 'persp';
    s.mode = next;
    s.needsRender = true;
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
