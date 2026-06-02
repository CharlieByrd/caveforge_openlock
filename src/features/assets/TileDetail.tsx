import { useState, useEffect, useRef } from 'react';
import type { TileType, HeightClass } from '../../lib/db/schema';
import { useLibraryStore } from '../../store/library';
import { heightClassOf } from '../../lib/grid/cell';
import { AssetPreview } from './AssetPreview';

interface Props {
  tile: TileType;
  onClose: () => void;
}

export function TileDetail({ tile, onClose }: Props) {
  const { packs, updateTileType, removeTileType } = useLibraryStore();
  const [name, setName] = useState(tile.name);
  const [packId, setPackId] = useState(tile.packId);
  const [category, setCategory] = useState(tile.category);
  const [fpW, setFpW] = useState(tile.footprint.w);
  const [fpH, setFpH] = useState(tile.footprint.h);
  const [heightClass, setHeightClass] = useState<HeightClass>(tile.heightClass);
  const [isProp, setIsProp] = useState(tile.isProp ?? false);
  const [inStock, setInStock] = useState(tile.inStock);
  const [rx, setRx] = useState(tile.modelTransform?.rx ?? 0);
  const [ry, setRy] = useState(tile.modelTransform?.ry ?? 0);
  const [rz, setRz] = useState(tile.modelTransform?.rz ?? 0);
  const [offsetY, setOffsetY] = useState(tile.modelTransform?.offsetY ?? 0);
  const [dirty, setDirty] = useState(false);

  // Debounced transform values — 3D preview only rebuilds after 100ms of silence.
  // The sliders themselves stay instant; only the expensive geometry swap is deferred.
  const [previewRx, setPreviewRx] = useState(rx);
  const [previewRy, setPreviewRy] = useState(ry);
  const [previewRz, setPreviewRz] = useState(rz);
  const [previewOffsetY, setPreviewOffsetY] = useState(offsetY);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedulePreviewUpdate(nrx: number, nry: number, nrz: number, noff: number) {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPreviewRx(nrx);
      setPreviewRy(nry);
      setPreviewRz(nrz);
      setPreviewOffsetY(noff);
    }, 100);
  }

  useEffect(() => {
    setName(tile.name);
    setPackId(tile.packId);
    setCategory(tile.category);
    setFpW(tile.footprint.w);
    setFpH(tile.footprint.h);
    setHeightClass(tile.heightClass);
    setIsProp(tile.isProp ?? false);
    setInStock(tile.inStock);
    const nrx = tile.modelTransform?.rx ?? 0;
    const nry = tile.modelTransform?.ry ?? 0;
    const nrz = tile.modelTransform?.rz ?? 0;
    const noff = tile.modelTransform?.offsetY ?? 0;
    setRx(nrx); setRy(nry); setRz(nrz); setOffsetY(noff);
    setPreviewRx(nrx); setPreviewRy(nry); setPreviewRz(nrz); setPreviewOffsetY(noff);
    setDirty(false);
  }, [tile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function mark() { setDirty(true); }

  function step(setter: (v: number) => void, current: number, delta: number,
                others: { rx: number; ry: number; rz: number; offsetY: number },
                key: 'rx' | 'ry' | 'rz') {
    const next = ((current + delta) % 360 + 360) % 360;
    setter(next);
    mark();
    schedulePreviewUpdate(
      key === 'rx' ? next : others.rx,
      key === 'ry' ? next : others.ry,
      key === 'rz' ? next : others.rz,
      others.offsetY,
    );
  }

  function parseAngle(s: string) {
    const n = parseFloat(s);
    return isNaN(n) ? 0 : ((n % 360) + 360) % 360;
  }

  async function save() {
    await updateTileType(tile.id, {
      name, packId, category,
      footprint: { w: fpW, h: fpH },
      heightClass, isProp, inStock,
      modelTransform: { rx, ry, rz, offsetY },
    });
    setDirty(false);
  }

  return (
    <div className="tile-detail">
      <div className="tile-detail-header">
        <span className="tile-detail-title">Tile Details</span>
        <button className="tile-detail-close" onClick={onClose}>✕</button>
      </div>

      <div className="tile-detail-body">
        <div className="tile-detail-field">
          <label>Name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); mark(); }} />
        </div>

        <div className="tile-detail-field">
          <label>Pack</label>
          <select value={packId} onChange={(e) => { setPackId(e.target.value); mark(); }}>
            {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="tile-detail-field">
          <label>Category</label>
          <input value={category} onChange={(e) => { setCategory(e.target.value); mark(); }} />
        </div>

        <div className="tile-detail-field tile-detail-fp">
          <label>Footprint</label>
          <div className="tile-detail-fp-inputs">
            <input
              type="number" min={1} value={fpW}
              onChange={(e) => { setFpW(Math.max(1, parseInt(e.target.value) || 1)); mark(); }}
            />
            <span>×</span>
            <input
              type="number" min={1} value={fpH}
              onChange={(e) => { setFpH(Math.max(1, parseInt(e.target.value) || 1)); mark(); }}
            />
          </div>
        </div>

        <div className="tile-detail-field">
          <label>Height class</label>
          <select value={heightClass} onChange={(e) => { setHeightClass(e.target.value as HeightClass); mark(); }}>
            <option value="floor">floor</option>
            <option value="wall">wall</option>
            <option value="prop">prop</option>
          </select>
        </div>

        <div className="tile-detail-prop">
          <label className="tile-detail-prop-row">
            <input
              type="checkbox"
              checked={isProp}
              onChange={(e) => {
                const on = e.target.checked;
                setIsProp(on);
                setHeightClass(on ? 'prop' : heightClassOf(tile.sizeMM, { w: fpW, h: fpH }));
                mark();
              }}
            />
            <span className="tile-detail-prop-name">Prop</span>
          </label>
          <div className="tile-detail-prop-hint">Free placement, excluded from BOM/export</div>
        </div>

        <div className="tile-detail-field">
          <label>In stock</label>
          <input
            type="number" min={0} value={inStock}
            onChange={(e) => { setInStock(Math.max(0, parseInt(e.target.value) || 0)); mark(); }}
          />
        </div>

        <div className="tile-detail-size">
          {tile.sizeMM.x.toFixed(1)} × {tile.sizeMM.y.toFixed(1)} × {tile.sizeMM.z.toFixed(1)} mm
        </div>

        {/* ---- Orientation ---- */}
        <div className="tile-detail-section-label">Orientation</div>

        <AssetPreview tile={tile} rx={previewRx} ry={previewRy} rz={previewRz} offsetY={previewOffsetY} />

        <div className="orient-note">
          Note: footprint/height class are import-time and won't auto-update when axes change.
          Adjust them manually above if needed.
        </div>

        {([
          { label: 'X', val: rx, set: setRx, key: 'rx' as const },
          { label: 'Y', val: ry, set: setRy, key: 'ry' as const },
          { label: 'Z', val: rz, set: setRz, key: 'rz' as const },
        ]).map(({ label, val, set, key }) => (
          <div key={label} className="orient-row">
            <span className="orient-axis">{label}</span>
            <button className="orient-step" onClick={() => step(set, val, -90, { rx, ry, rz, offsetY }, key)}>−90°</button>
            <button className="orient-step" onClick={() => step(set, val, +90, { rx, ry, rz, offsetY }, key)}>+90°</button>
            <input
              className="orient-input"
              type="number"
              step={1}
              value={val}
              onChange={(e) => {
                const next = parseAngle(e.target.value);
                set(next);
                mark();
                schedulePreviewUpdate(
                  key === 'rx' ? next : rx,
                  key === 'ry' ? next : ry,
                  key === 'rz' ? next : rz,
                  offsetY,
                );
              }}
            />
            <span className="orient-unit">°</span>
          </div>
        ))}

        <div className="orient-row">
          <span className="orient-axis">Y↕</span>
          <span className="orient-offset-label">Offset</span>
          <input
            className="orient-input orient-input--offset"
            type="number"
            step={0.1}
            value={offsetY}
            onChange={(e) => {
              const next = parseFloat(e.target.value) || 0;
              setOffsetY(next);
              mark();
              schedulePreviewUpdate(rx, ry, rz, next);
            }}
          />
          <span className="orient-unit">cells</span>
        </div>

        <button
          className="orient-reset"
          onClick={() => {
            setRx(0); setRy(0); setRz(0); setOffsetY(0);
            mark();
            schedulePreviewUpdate(0, 0, 0, 0);
          }}
        >Reset orientation</button>

        <div className="tile-detail-actions">
          <button
            className="tile-detail-save"
            onClick={save}
            disabled={!dirty}
          >Save</button>
          <button
            className="tile-detail-delete"
            onClick={async () => {
              if (confirm(`Delete "${tile.name}"?`)) {
                await removeTileType(tile.id);
                onClose();
              }
            }}
          >Delete</button>
        </div>
      </div>
    </div>
  );
}
