import { useEffect, useRef, useState, useMemo } from 'react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { renderSchematicToCanvas, exportSchematicPNG, exportSchematicSVG } from '../../lib/schematic/render';

export function SchematicPanel() {
  const { map } = useMapStore();
  const { tileTypes, packs } = useLibraryStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cellPx, setCellPx] = useState(48);
  const [showCoords, setShowCoords] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [rendering, setRendering] = useState(false);

  const packNames = useMemo(() => new Map(packs.map(p => [p.id, p.name])), [packs]);

  useEffect(() => {
    if (!canvasRef.current) return;
    setRendering(true);
    const canvas = canvasRef.current;
    const id = setTimeout(() => {
      renderSchematicToCanvas(canvas, map.placements, tileTypes, packNames, { cellPx, showCoords, showLegend });
      setRendering(false);
    }, 0);
    return () => clearTimeout(id);
  }, [map.placements, tileTypes, packNames, cellPx, showCoords, showLegend]);

  function downloadPNG() {
    if (!canvasRef.current) return;
    exportSchematicPNG(canvasRef.current, map.name);
  }

  function downloadSVG() {
    exportSchematicSVG(map.placements, tileTypes, packNames, map.name, { cellPx, showCoords, showLegend });
  }

  return (
    <div className="schematic-panel">
      <div className="schematic-toolbar">
        <label className="schematic-ctrl">
          Cell size:
          <input
            type="range" min={24} max={96} step={8} value={cellPx}
            onChange={e => setCellPx(Number(e.target.value))}
          />
          <span>{cellPx}px</span>
        </label>
        <label className="schematic-toggle">
          <input type="checkbox" checked={showCoords} onChange={e => setShowCoords(e.target.checked)} />
          Coords
        </label>
        <label className="schematic-toggle">
          <input type="checkbox" checked={showLegend} onChange={e => setShowLegend(e.target.checked)} />
          Legend
        </label>
        <div className="schematic-btns">
          <button onClick={downloadPNG}>↓ PNG</button>
          <button onClick={downloadSVG}>↓ SVG</button>
        </div>
      </div>
      <div className="schematic-preview">
        {rendering && <div className="schematic-rendering">Rendering…</div>}
        <canvas ref={canvasRef} style={{ opacity: rendering ? 0 : 1 }} />
      </div>
    </div>
  );
}
