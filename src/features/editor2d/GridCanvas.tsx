import { useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { useRenderStore, cssFilter } from '../../store/render';
import { buildOccupancySet, canPlace } from '../../lib/grid/collide';
import { rotateFootprint } from '../../lib/grid/transform';
import { requestIcon } from '../../lib/render/iconCache';
import type { TileType } from '../../lib/db/schema';

const BASE_CELL_PX = 48;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

function tileColor(tt: TileType): string {
  switch (tt.heightClass) {
    case 'floor': return '#4a7c59';
    case 'wall':  return '#7c6a4a';
    case 'prop':  return '#4a5c7c';
  }
}

export function GridCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const { map, selectedRotation, addPlacement, removePlacement } = useMapStore();
  const { tileTypes, selectedTileTypeId } = useLibraryStore();
  const renderSettings = useRenderStore();

  // Camera — in refs so mousemove doesn't trigger React re-renders
  const cam      = useRef({ panX: 200, panY: 200, zoom: 1 });
  const panState = useRef({ active: false, startMx: 0, startMy: 0, startPx: 0, startPy: 0 });
  const spaceDown  = useRef(false);
  const isPainting = useRef(false);
  const hoverCell      = useRef<{ gx: number; gy: number } | null>(null);
  const hoverPlacement = useRef<string | null>(null); // uid of placement under cursor
  const dirtyRef       = useRef(true);

  // Mirrors of React state/props in refs (avoid stale closures in native listeners)
  const mapRef            = useRef(map);
  const ttMapRef          = useRef<Map<string, TileType>>(new Map());
  const fpMapRef          = useRef<Map<string, { w: number; h: number }>>(new Map());
  const selectedIdRef     = useRef(selectedTileTypeId);
  const selectedRotRef    = useRef(selectedRotation);
  const addPlacementRef   = useRef(addPlacement);
  const removePlacementRef = useRef(removePlacement);

  useEffect(() => { mapRef.current = map; dirtyRef.current = true; }, [map]);
  useEffect(() => { selectedIdRef.current = selectedTileTypeId; dirtyRef.current = true; }, [selectedTileTypeId]);
  useEffect(() => { selectedRotRef.current = selectedRotation; dirtyRef.current = true; }, [selectedRotation]);
  useEffect(() => { addPlacementRef.current = addPlacement; }, [addPlacement]);
  useEffect(() => { removePlacementRef.current = removePlacement; }, [removePlacement]);

  useEffect(() => {
    ttMapRef.current = new Map(tileTypes.map(t => [t.id, t]));
    fpMapRef.current = new Map(tileTypes.map(t => [t.id, t.footprint]));
    dirtyRef.current = true;
  }, [tileTypes]);

  // Icon cache: tileId → { top: img|null, iso: img|null }
  const iconCache = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    for (const tt of tileTypes) {
      const cacheKey = tt.id;
      if (iconCache.current.has(cacheKey)) continue;
      requestIcon(tt.id, tt.stlBlobKey, tt.footprint).then((dataUrl) => {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => { iconCache.current.set(cacheKey, img); dirtyRef.current = true; };
        img.src = dataUrl;
      });
    }
  }, [tileTypes]);

  // ---- Draw ----------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { panX, panY, zoom } = cam.current;
    const cellPx = zoom * BASE_CELL_PX;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // === Tile sprites (cell-space transform) ===
    ctx.save();
    ctx.setTransform(cellPx, 0, 0, cellPx, panX, panY);

    const placements = mapRef.current.placements;
    const sorted = [...placements].sort((a, b) => a.z - b.z);

    for (const p of sorted) {
      const tt = ttMapRef.current.get(p.tileTypeId);
      if (!tt) continue;
      const eff = rotateFootprint(tt.footprint, p.rot);
      const icon = iconCache.current.get(tt.id);

      if (icon) {
        ctx.save();
        ctx.translate(p.gx + eff.w / 2, p.gy + eff.h / 2);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.drawImage(icon, -tt.footprint.w / 2, -tt.footprint.h / 2, tt.footprint.w, tt.footprint.h);
        ctx.restore();
      } else {
        // fallback colored rect
        ctx.fillStyle = tileColor(tt);
        ctx.fillRect(p.gx + 0.04, p.gy + 0.04, eff.w - 0.08, eff.h - 0.08);
      }
    }

    // Hover highlight — existing tile under cursor
    const hovUid = hoverPlacement.current;
    if (hovUid) {
      const hovP = placements.find(p => p.uid === hovUid);
      if (hovP) {
        const tt = ttMapRef.current.get(hovP.tileTypeId);
        if (tt) {
          const eff = rotateFootprint(tt.footprint, hovP.rot);
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = '#ff3a3a';
          ctx.fillRect(hovP.gx, hovP.gy, eff.w, eff.h);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,70,70,0.9)';
          ctx.lineWidth = 2 / cellPx;
          ctx.strokeRect(hovP.gx + 0.03, hovP.gy + 0.03, eff.w - 0.06, eff.h - 0.06);
        }
      }
    }

    // Hover ghost
    const hc = hoverCell.current;
    const selId = selectedIdRef.current;
    const selRot = selectedRotRef.current;
    if (hc && selId) {
      const tt = ttMapRef.current.get(selId);
      if (tt) {
        const eff = rotateFootprint(tt.footprint, selRot);
        const occupied = buildOccupancySet(placements, fpMapRef.current);
        const z = tt.heightClass === 'floor' ? 0 : 1;
        const ok = canPlace(hc.gx, hc.gy, z, tt.footprint, selRot, occupied);
        const icon = iconCache.current.get(tt.id);

        ctx.save();
        ctx.globalAlpha = 0.65;
        if (icon) {
          ctx.translate(hc.gx + eff.w / 2, hc.gy + eff.h / 2);
          ctx.rotate((selRot * Math.PI) / 180);
          ctx.drawImage(icon, -tt.footprint.w / 2, -tt.footprint.h / 2, tt.footprint.w, tt.footprint.h);
        } else {
          ctx.fillStyle = ok ? '#64dc64' : '#dc4040';
          ctx.fillRect(hc.gx + 0.04, hc.gy + 0.04, eff.w - 0.08, eff.h - 0.08);
        }
        ctx.restore();

        // Tint overlay
        ctx.save();
        ctx.globalAlpha = ok ? 0.2 : 0.35;
        ctx.fillStyle = ok ? '#00ff00' : '#ff4040';
        ctx.fillRect(hc.gx, hc.gy, eff.w, eff.h);
        ctx.restore();

        // Border
        ctx.strokeStyle = ok ? 'rgba(80,255,80,0.9)' : 'rgba(255,60,60,0.9)';
        ctx.lineWidth = 1.5 / cellPx;
        ctx.strokeRect(hc.gx + 0.03, hc.gy + 0.03, eff.w - 0.06, eff.h - 0.06);
      }
    }

    ctx.restore(); // end cell-space

    // === Grid lines (screen-space, drawn OVER tiles) ===
    const startCX = Math.floor(-panX / cellPx) - 1;
    const startCY = Math.floor(-panY / cellPx) - 1;
    const endCX   = Math.ceil((W - panX) / cellPx) + 1;
    const endCY   = Math.ceil((H - panY) / cellPx) + 1;

    for (let gx = startCX; gx <= endCX; gx++) {
      const major = gx % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(120,130,155,0.65)' : 'rgba(65,70,85,0.45)';
      ctx.lineWidth   = major ? 1 : 0.5;
      const sx = panX + gx * cellPx;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    for (let gy = startCY; gy <= endCY; gy++) {
      const major = gy % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(120,130,155,0.65)' : 'rgba(65,70,85,0.45)';
      ctx.lineWidth   = major ? 1 : 0.5;
      const sy = panY + gy * cellPx;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
  }, []); // all state via refs — stable forever

  // RAF render loop
  useEffect(() => {
    let rafId: number;
    function loop() {
      if (dirtyRef.current) { draw(); dirtyRef.current = false; }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  // Resize observer — canvas fills container
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      dirtyRef.current = true;
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, []);

  // ---- Helpers -------------------------------------------------------------

  const screenToCell = useCallback((sx: number, sy: number) => {
    const { panX, panY, zoom } = cam.current;
    const cellPx = zoom * BASE_CELL_PX;
    return { gx: Math.floor((sx - panX) / cellPx), gy: Math.floor((sy - panY) / cellPx) };
  }, []);

  const canvasPos = useCallback((e: PointerEvent | WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const placeTile = useCallback((gx: number, gy: number) => {
    const selId  = selectedIdRef.current;
    const selRot = selectedRotRef.current;
    if (!selId) return;
    const tt = ttMapRef.current.get(selId);
    if (!tt) return;
    const occupied = buildOccupancySet(mapRef.current.placements, fpMapRef.current);
    const z = tt.heightClass === 'floor' ? 0 : 1;
    if (canPlace(gx, gy, z, tt.footprint, selRot, occupied)) {
      addPlacementRef.current(selId, gx, gy, z);
    }
  }, []);

  const eraseAt = useCallback((gx: number, gy: number) => {
    const hit = [...mapRef.current.placements].reverse().find(p => {
      const tt = ttMapRef.current.get(p.tileTypeId);
      if (!tt) return false;
      const eff = rotateFootprint(tt.footprint, p.rot);
      return gx >= p.gx && gx < p.gx + eff.w && gy >= p.gy && gy < p.gy + eff.h;
    });
    if (hit) removePlacementRef.current(hit.uid);
  }, []);

  // ---- Native pointer/wheel events ----------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onPointerDown(e: PointerEvent) {
      const { x, y } = canvasPos(e);
      const wantPan = e.button === 1 || (e.button === 0 && spaceDown.current);

      if (wantPan) {
        e.preventDefault();
        panState.current = { active: true, startMx: x, startMy: y, startPx: cam.current.panX, startPy: cam.current.panY };
        canvasRef.current!.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button === 0) {
        canvasRef.current!.setPointerCapture(e.pointerId);
        isPainting.current = true;
        placeTile(screenToCell(x, y).gx, screenToCell(x, y).gy);
        return;
      }
      if (e.button === 2) {
        const c = screenToCell(x, y);
        eraseAt(c.gx, c.gy);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const { x, y } = canvasPos(e);

      if (panState.current.active) {
        cam.current.panX = panState.current.startPx + (x - panState.current.startMx);
        cam.current.panY = panState.current.startPy + (y - panState.current.startMy);
        dirtyRef.current = true;
        return;
      }

      const c = screenToCell(x, y);
      const prev = hoverCell.current;
      if (!prev || prev.gx !== c.gx || prev.gy !== c.gy) {
        hoverCell.current = c;

        // Find topmost placement under cursor
        const hit = [...mapRef.current.placements].reverse().find(p => {
          const tt = ttMapRef.current.get(p.tileTypeId);
          if (!tt) return false;
          const eff = rotateFootprint(tt.footprint, p.rot);
          return c.gx >= p.gx && c.gx < p.gx + eff.w && c.gy >= p.gy && c.gy < p.gy + eff.h;
        });
        hoverPlacement.current = hit?.uid ?? null;

        dirtyRef.current = true;
      }

      if (isPainting.current && e.buttons === 1 && !spaceDown.current) {
        placeTile(c.gx, c.gy);
      }
    }

    function onPointerUp() {
      panState.current.active = false;
      isPainting.current = false;
    }

    function onPointerLeave() {
      hoverCell.current = null;
      hoverPlacement.current = null;
      isPainting.current = false;
      dirtyRef.current = true;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { x, y } = canvasPos(e);
      const factor   = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom  = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.current.zoom * factor));
      const ratio    = newZoom / cam.current.zoom;
      cam.current.panX  = x - (x - cam.current.panX) * ratio;
      cam.current.panY  = y - (y - cam.current.panY) * ratio;
      cam.current.zoom  = newZoom;
      dirtyRef.current  = true;
    }

    canvas.addEventListener('pointerdown',  onPointerDown);
    canvas.addEventListener('pointermove',  onPointerMove);
    canvas.addEventListener('pointerup',    onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel',        onWheel, { passive: false });
    canvas.addEventListener('contextmenu',  e => e.preventDefault());

    return () => {
      canvas.removeEventListener('pointerdown',  onPointerDown);
      canvas.removeEventListener('pointermove',  onPointerMove);
      canvas.removeEventListener('pointerup',    onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel',        onWheel);
    };
  }, [canvasPos, screenToCell, placeTile, eraseAt]);

  // Space = pan mode cursor
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceDown.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = selectedIdRef.current ? 'crosshair' : 'default';
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // Update cursor when tile selection changes
  useEffect(() => {
    if (canvasRef.current && !spaceDown.current) {
      canvasRef.current.style.cursor = selectedTileTypeId ? 'crosshair' : 'default';
    }
  }, [selectedTileTypeId]);

  // Apply CSS filter from render store
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.filter = cssFilter(renderSettings);
    }
  }, [renderSettings.contrast, renderSettings.brightness, renderSettings.saturation]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetCamera() {
    cam.current = { panX: 80, panY: 80, zoom: 1 };
    dirtyRef.current = true;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button
        onClick={resetCamera}
        style={{
          position: 'absolute', bottom: 10, right: 10,
          padding: '4px 8px', fontSize: 16, lineHeight: 1,
          background: 'rgba(15,52,96,0.85)', border: '1px solid #1a5276',
          color: '#e0e0e0', borderRadius: 4, cursor: 'pointer', zIndex: 10,
        }}
        title="Reset view (Home)"
      >⌂</button>
    </div>
  );
}
