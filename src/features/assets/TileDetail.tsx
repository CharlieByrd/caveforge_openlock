import { useState, useEffect } from 'react';
import type { TileType, HeightClass } from '../../lib/db/schema';
import { useLibraryStore } from '../../store/library';

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
  const [inStock, setInStock] = useState(tile.inStock);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setName(tile.name);
    setPackId(tile.packId);
    setCategory(tile.category);
    setFpW(tile.footprint.w);
    setFpH(tile.footprint.h);
    setHeightClass(tile.heightClass);
    setInStock(tile.inStock);
    setDirty(false);
  }, [tile.id]);

  function mark() { setDirty(true); }

  async function save() {
    await updateTileType(tile.id, {
      name, packId, category,
      footprint: { w: fpW, h: fpH },
      heightClass, inStock,
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
