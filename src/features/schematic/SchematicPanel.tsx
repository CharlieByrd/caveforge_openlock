import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Ruler, Download } from 'lucide-react';
import type { Rotation } from '../../lib/db/schema';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import {
  renderSchematicToCanvas,
  exportSchematicPNG,
  exportSchematicSVG,
  getHitRects,
  type HitRect,
} from '../../lib/schematic/render';
import { CELL_MM } from '../../lib/grid/cell';
import { rotateFootprint } from '../../lib/grid/transform';

interface TipState {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  footprint: string;
  heightClass: string;
  sizeMM: string;
}

export function SchematicPanel() {
  const { map } = useMapStore();
  const { tileTypes, packs } = useLibraryStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(48);
  const [showCoords, setShowCoords] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [excludeProps, setExcludeProps] = useState(false);
  const [rendering, setRendering] = useState(false);
  const hitRectsRef = useRef<HitRect[]>([]);
  const [tip, setTip] = useState<TipState>({ visible: false, x: 0, y: 0, name: '', footprint: '', heightClass: '', sizeMM: '' });

  const packNames = useMemo(() => new Map(packs.map(p => [p.id, p.name])), [packs]);
  const ttMap = useMemo(() => new Map(tileTypes.map(t => [t.id, t])), [tileTypes]);

  const visiblePlacements = useMemo(
    () => excludeProps ? map.placements.filter(p => !ttMap.get(p.tileTypeId)?.isProp) : map.placements,
    [map.placements, ttMap, excludeProps],
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    setRendering(true);
    const canvas = canvasRef.current;
    const id = setTimeout(() => {
      renderSchematicToCanvas(canvas, visiblePlacements, tileTypes, packNames, { cellPx, showCoords, showGrid, showLabels });
      hitRectsRef.current = getHitRects(visiblePlacements, tileTypes, { cellPx, showCoords });
      setRendering(false);
    }, 0);
    return () => clearTimeout(id);
  }, [visiblePlacements, tileTypes, packNames, cellPx, showCoords, showGrid, showLabels]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const cx = e.clientX - canvasRect.left;
    const cy = e.clientY - canvasRect.top;
    const hit = hitRectsRef.current.find(r => cx >= r.x && cy >= r.y && cx < r.x + r.w && cy < r.y + r.h);
    if (!hit) { setTip(t => t.visible ? { ...t, visible: false } : t); return; }
    const tt = ttMap.get(hit.tileTypeId);
    if (!tt) { setTip(t => t.visible ? { ...t, visible: false } : t); return; }
    const eff = rotateFootprint(tt.footprint, hit.rot as Rotation);
    const wMM = (eff.w * CELL_MM).toFixed(1);
    const hMM = (eff.h * CELL_MM).toFixed(1);
    const zMM = tt.sizeMM.z.toFixed(1);
    setTip({
      visible: true,
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top,
      name: tt.name,
      footprint: `${eff.w}×${eff.h}`,
      heightClass: tt.heightClass,
      sizeMM: `${wMM} × ${hMM} × ${zMM} mm`,
    });
  }, [ttMap]);

  const onMouseLeave = useCallback(() => setTip(t => ({ ...t, visible: false })), []);

  function downloadPNG() {
    if (!canvasRef.current) return;
    exportSchematicPNG(canvasRef.current, map.name);
  }

  function downloadSVG() {
    exportSchematicSVG(visiblePlacements, tileTypes, packNames, map.name, { cellPx, showCoords, showGrid, showLabels });
  }

  // IRL dims for sheet header
  const irlDims = useMemo(() => {
    if (visiblePlacements.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of visiblePlacements) {
      const tt = ttMap.get(p.tileTypeId);
      if (!tt) continue;
      const eff = rotateFootprint(tt.footprint, p.rot);
      minX = Math.min(minX, p.gx); minY = Math.min(minY, p.gy);
      maxX = Math.max(maxX, p.gx + eff.w); maxY = Math.max(maxY, p.gy + eff.h);
    }
    const cols = maxX - minX; const rows = maxY - minY;
    const wMM = cols * CELL_MM; const hMM = rows * CELL_MM;
    const wIn = (wMM / 25.4).toFixed(1); const hIn = (hMM / 25.4).toFixed(1);
    return { wMM: wMM.toFixed(0), hMM: hMM.toFixed(0), wIn, hIn, tiles: visiblePlacements.length, cells: cols * rows };
  }, [visiblePlacements, ttMap]);

  // Legend counts by heightClass
  const hcCounts = useMemo(() => {
    const counts = { floor: 0, wall: 0, prop: 0 };
    for (const p of visiblePlacements) {
      const tt = ttMap.get(p.tileTypeId);
      if (!tt) continue;
      if (tt.heightClass === 'floor') counts.floor++;
      else if (tt.heightClass === 'wall') counts.wall++;
      else counts.prop++;
    }
    return counts;
  }, [visiblePlacements, ttMap]);

  const HC_COLORS = { floor: '#4a7c59', wall: '#7c6a4a', prop: '#4a5c7c' };

  return (
    <div className="schematic-panel">
      <div className="schematic-toolbar">
        {/* cell size */}
        <div className="sch-group">
          <Ruler size={14} style={{ color: '#6b86b0', flexShrink: 0 }} />
          <input
            type="range" min={24} max={96} step={8} value={cellPx}
            onChange={e => setCellPx(Number(e.target.value))}
            style={{ width: 90, accentColor: '#e94560' }}
            data-tip="Cell size in pixels"
          />
          <span className="sch-val">{cellPx}px</span>
        </div>
        <div className="sch-divider" />

        {/* toggles */}
        <button
          className={`sch-toggle${showCoords ? ' active' : ''}`}
          onClick={() => setShowCoords(v => !v)}
          data-tip="Toggle coordinate labels"
        >Coordinates</button>
        <button
          className={`sch-toggle${showGrid ? ' active' : ''}`}
          onClick={() => setShowGrid(v => !v)}
          data-tip="Toggle grid lines"
        >Grid</button>
        <button
          className={`sch-toggle${showLabels ? ' active' : ''}`}
          onClick={() => setShowLabels(v => !v)}
          data-tip="Toggle tile abbreviations"
        >Labels</button>
        <button
          className={`sch-toggle${excludeProps ? ' active' : ''}`}
          onClick={() => setExcludeProps(v => !v)}
          data-tip="Hide props from schematic"
        >No Props</button>
        <div className="sch-divider" />

        {/* legend */}
        {visiblePlacements.length > 0 && (
          <div className="sch-legend">
            {(['floor', 'wall', 'prop'] as const).map(hc => (
              <div key={hc} className="sch-legend-item">
                <span className="sch-swatch" style={{ background: HC_COLORS[hc] }} />
                {hc[0].toUpperCase() + hc.slice(1)}
                <b>{hcCounts[hc]}</b>
              </div>
            ))}
          </div>
        )}

        <div className="schematic-spacer" />

        {/* export */}
        <button className="sch-export" onClick={downloadPNG} data-tip="Export PNG">
          <span className="btn-icon-label"><Download size={13} />PNG</span>
        </button>
        <button className="sch-export" onClick={downloadSVG} data-tip="Export SVG">
          <span className="btn-icon-label"><Download size={13} />SVG</span>
        </button>
      </div>

      <div className="schematic-stage">
        {map.placements.length === 0 ? (
          <div className="schematic-empty">
            <p>No tiles placed yet.</p>
            <span>Place tiles on the 2D editor to see the top-down schematic here.</span>
          </div>
        ) : (
          <div className="schematic-sheet">
            {/* sheet header */}
            <div className="schematic-sheet-head">
              <div className="schematic-sheet-title">
                <Ruler size={14} />
                {map.name || 'Untitled Map'}
              </div>
              <span className="schematic-sheet-tag">TOP-DOWN SCHEMATIC</span>
              {irlDims && (
                <div className="schematic-sheet-meta">
                  <span><b>{irlDims.tiles}</b> tiles</span>
                  <span className="dot">·</span>
                  <span><b>{irlDims.cells}</b> cells</span>
                  <span className="dot">·</span>
                  <span className="sch-dim">
                    <Ruler size={11} />
                    <b>{irlDims.wMM}×{irlDims.hMM}</b>
                    <span className="sch-dim-sub">mm</span>
                    <span className="sch-dim-sub">({irlDims.wIn}×{irlDims.hIn} in)</span>
                  </span>
                </div>
              )}
            </div>

            {/* canvas */}
            <div className="schematic-canvas-wrap">
              <div
                ref={wrapRef}
                className="schematic-canvas-pos"
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
              >
                {rendering && <div className="schematic-rendering">Rendering…</div>}
                <canvas ref={canvasRef} style={{ opacity: rendering ? 0 : 1 }} />

                {tip.visible && (
                  <div
                    className="sch-tip"
                    style={{ left: tip.x, top: tip.y }}
                  >
                    <div className="sch-tip-name">
                      <span className="sch-swatch" style={{ background: HC_COLORS[tip.heightClass as keyof typeof HC_COLORS] ?? '#555' }} />
                      {tip.name}
                    </div>
                    <span className="sch-tip-meta">{tip.footprint} · {tip.heightClass}</span>
                    <span className="sch-tip-mm">{tip.sizeMM}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
