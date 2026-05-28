import { useState, useEffect, useRef } from 'react';
import type { TileType } from '../../lib/db/schema';
import { useLibraryStore } from '../../store/library';
import { PaletteTile } from './PaletteTile';

export function LibraryTree() {
  const { packs, tileTypes, selectedTileTypeId, recentTileTypeIds, selectTileType, loading } = useLibraryStore();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initialCollapseDone = useRef(false);

  useEffect(() => {
    if (initialCollapseDone.current || packs.length === 0) return;
    initialCollapseDone.current = true;
    const keys: string[] = [];
    packs.forEach((pack) => {
      keys.push(`pack:${pack.id}`);
      [...new Set(tileTypes.filter((t) => t.packId === pack.id).map((t) => t.category))].forEach((cat) => {
        keys.push(`cat:${pack.id}:${cat}`);
      });
    });
    setCollapsed(new Set(keys));
  }, [packs, tileTypes]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const recentTiles = recentTileTypeIds
    .map((id) => tileTypes.find((t) => t.id === id))
    .filter((t): t is TileType => !!t);

  const allSorted = tileTypes.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const filtered = search
    ? allSorted.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : allSorted;

  return (
    <div className="library-tree">
      {recentTiles.length > 0 && (
        <div className="recent-section">
          <div className="recent-header">Recent</div>
          <div className="palette-list">
            {recentTiles.map((tile) => (
              <PaletteTile
                key={tile.id}
                tile={tile}
                selected={selectedTileTypeId === tile.id}
                onSelect={() => selectTileType(tile.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="library-controls">
        <input
          className="search-input"
          placeholder="Search tiles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="collapse-all-btn"
          title="Collapse all"
          onClick={() => {
            const keys: string[] = [];
            packs.forEach((pack) => {
              keys.push(`pack:${pack.id}`);
              [...new Set(tileTypes.filter((t) => t.packId === pack.id).map((t) => t.category))].forEach((cat) => {
                keys.push(`cat:${pack.id}:${cat}`);
              });
            });
            setCollapsed(new Set(keys));
          }}
        >⊖</button>
      </div>

      {loading && <p className="loading">Loading…</p>}

      {packs.map((pack) => {
        const packTiles = filtered.filter((t) => t.packId === pack.id);
        if (packTiles.length === 0) return null;
        const categories = [...new Set(packTiles.map((t) => t.category))].sort();
        const packKey = `pack:${pack.id}`;

        return (
          <div key={pack.id} className="pack-group">
            <div className="pack-header" onClick={() => toggle(packKey)}>
              <span className="collapse-icon">{collapsed.has(packKey) ? '▶' : '▼'}</span>
              <span className="pack-name">{pack.name}</span>
              <span className="pack-count">({packTiles.length})</span>
            </div>
            {!collapsed.has(packKey) && categories.map((cat) => {
              const catTiles = packTiles.filter((t) => t.category === cat);
              const catKey = `cat:${pack.id}:${cat}`;
              return (
                <div key={cat} className="category-group">
                  <div className="category-header" onClick={() => toggle(catKey)}>
                    <span className="collapse-icon">{collapsed.has(catKey) ? '▶' : '▼'}</span>
                    <span className="category-name">{cat}</span>
                    <span className="category-count">({catTiles.length})</span>
                  </div>
                  {!collapsed.has(catKey) && (
                    <div className="palette-list">
                      {catTiles.map((tile) => (
                        <PaletteTile
                          key={tile.id}
                          tile={tile}
                          selected={selectedTileTypeId === tile.id}
                          onSelect={() => selectTileType(tile.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {!loading && packs.length === 0 && (
        <p className="empty-hint">No tiles. Use Assets → Import STL.</p>
      )}
    </div>
  );
}
