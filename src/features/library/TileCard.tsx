import { useState, useEffect, useRef } from 'react';
import type { TileType, HeightClass } from '../../lib/db/schema';
import { useLibraryStore } from '../../store/library';
import { requestIcon } from '../../lib/render/iconCache';

interface Props {
  tile: TileType;
  selected: boolean;
  onSelect: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function TileCard({ tile, selected, onSelect, onDragStart, onDragEnd }: Props) {
  const { updateTileType } = useLibraryStore();
  const [icon, setIcon] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    setIcon(null);
    let cancelled = false;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        requestIcon(tile.id, tile.stlBlobKey, tile.footprint).then((url) => {
          if (!cancelled && url) setIcon(url);
        });
      },
      { rootMargin: '200px' },
    );

    obs.observe(el);
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [tile.id, tile.stlBlobKey, tile.footprint]);

  return (
    <div
      ref={cardRef}
      className={`tile-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      draggable={!!(onDragStart || onDragEnd)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="tile-icon">
        {icon ? (
          <img src={icon} alt={tile.name} title={tile.name} />
        ) : (
          <div className={`tile-fallback tile-fallback--${tile.heightClass}`} />
        )}
      </div>

      {!editing ? (
        <div className="tile-info">
          <span className="tile-name">{tile.name}</span>
          <span className="tile-meta">
            {tile.footprint.w}×{tile.footprint.h} · {tile.heightClass}
          </span>
          <div className="tile-stock">
            <label>
              Stock:
              <input
                type="number"
                min={0}
                value={tile.inStock}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  updateTileType(tile.id, { inStock: Math.max(0, parseInt(e.target.value) || 0) })
                }
              />
            </label>
          </div>
          <button
            className="tile-edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <TileEditor tile={tile} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function TileEditor({ tile, onClose }: { tile: TileType; onClose: () => void }) {
  const { updateTileType, removeTileType } = useLibraryStore();
  const [name, setName] = useState(tile.name);
  const [category, setCategory] = useState(tile.category);
  const [fpW, setFpW] = useState(tile.footprint.w);
  const [fpH, setFpH] = useState(tile.footprint.h);
  const [heightClass, setHeightClass] = useState<HeightClass>(tile.heightClass);

  async function save() {
    await updateTileType(tile.id, {
      name,
      category,
      footprint: { w: fpW, h: fpH },
      heightClass,
    });
    onClose();
  }

  return (
    <div className="tile-editor" onClick={(e) => e.stopPropagation()}>
      <label>
        Name: <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Category: <input value={category} onChange={(e) => setCategory(e.target.value)} />
      </label>
      <label>
        Footprint W:
        <input type="number" min={1} value={fpW} onChange={(e) => setFpW(Math.max(1, parseInt(e.target.value) || 1))} />
      </label>
      <label>
        Footprint H:
        <input type="number" min={1} value={fpH} onChange={(e) => setFpH(Math.max(1, parseInt(e.target.value) || 1))} />
      </label>
      <label>
        Height class:
        <select value={heightClass} onChange={(e) => setHeightClass(e.target.value as HeightClass)}>
          <option value="floor">floor</option>
          <option value="wall">wall</option>
          <option value="prop">prop</option>
        </select>
      </label>
      <div className="tile-editor-actions">
        <button onClick={save}>Save</button>
        <button onClick={onClose}>Cancel</button>
        <button
          className="danger"
          onClick={async () => {
            if (confirm(`Delete "${tile.name}"?`)) {
              await removeTileType(tile.id);
              onClose();
            }
          }}
        >
          Delete
        </button>
      </div>
      <div className="tile-size-info">
        {tile.sizeMM.x.toFixed(1)} × {tile.sizeMM.y.toFixed(1)} × {tile.sizeMM.z.toFixed(1)} mm
      </div>
    </div>
  );
}
