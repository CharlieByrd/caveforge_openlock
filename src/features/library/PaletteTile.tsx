import { useState, useEffect, useRef } from 'react';
import type { TileType } from '../../lib/db/schema';
import { requestIcon } from '../../lib/render/iconCache';

interface Props {
  tile: TileType;
  selected: boolean;
  onSelect: () => void;
}

export function PaletteTile({ tile, selected, onSelect }: Props) {
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
      className={`palette-tile${selected ? ' selected' : ''}`}
      onClick={onSelect}
      title={`${tile.name} (${tile.footprint.w}×${tile.footprint.h} ${tile.heightClass})`}
    >
      <div className="palette-tile-icon">
        {icon
          ? <img src={icon} alt={tile.name} />
          : <div className={`tile-fallback tile-fallback--${tile.heightClass}`} />
        }
      </div>
      <span className="palette-tile-name">{tile.name}</span>
    </div>
  );
}
