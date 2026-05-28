import { useState, useEffect, useRef } from 'react';
import type { TileType } from '../../lib/db/schema';
import { requestIcon } from '../../lib/render/iconCache';

interface Props {
  tile: TileType;
  selected: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

export function AssetTileCard({ tile, selected, dragOver, onSelect, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: Props) {
  const [icon, setIcon] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    if (ref.current) obs.observe(ref.current);
    return () => { cancelled = true; obs.disconnect(); };
  }, [tile.id, tile.stlBlobKey, tile.footprint]);

  return (
    <div
      ref={ref}
      className={`asset-tile-card${selected ? ' selected' : ''}${dragOver ? ' drag-over' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      title={tile.name}
    >
      <div className="asset-tile-icon">
        {icon
          ? <img src={icon} alt={tile.name} />
          : <div className={`tile-fallback tile-fallback--${tile.heightClass}`} />
        }
      </div>
      <div className="asset-tile-name">{tile.name}</div>
      <div className="asset-tile-meta">{tile.footprint.w}×{tile.footprint.h} · {tile.heightClass}</div>
    </div>
  );
}
