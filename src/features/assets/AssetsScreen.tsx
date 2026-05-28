import { useState } from 'react';
import { useLibraryStore } from '../../store/library';
import { PackNav } from './PackNav';
import { AssetTileCard } from './AssetTileCard';
import { TileDetail } from './TileDetail';
import { ImportPanel } from '../library/ImportPanel';

function sortByOrder<T extends { order?: number; name: string }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export function AssetsScreen() {
  const { tileTypes, updateTileType, reorderTiles } = useLibraryStore();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const [dragOverTileId, setDragOverTileId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  function handleNavSelect(packId: string | null, category: string | null) {
    setSelectedPackId(packId);
    setSelectedCategory(category);
    setSelectedTileId(null);
  }

  function handleDropOnPack(packId: string) {
    if (!draggingTileId) return;
    const tile = tileTypes.find((t) => t.id === draggingTileId);
    if (!tile || tile.packId === packId) return;
    updateTileType(draggingTileId, { packId, category: tile.category });
    setDraggingTileId(null);
  }

  function handleDropOnCategory(packId: string, category: string) {
    if (!draggingTileId) return;
    const tile = tileTypes.find((t) => t.id === draggingTileId);
    if (!tile || (tile.packId === packId && tile.category === category)) return;
    updateTileType(draggingTileId, { packId, category });
    setDraggingTileId(null);
  }

  function handleDropOnTile(targetId: string) {
    if (!draggingTileId || draggingTileId === targetId) return;
    const dragTile = tileTypes.find((t) => t.id === draggingTileId);
    const targetTile = tileTypes.find((t) => t.id === targetId);
    if (!dragTile || !targetTile) return;
    // Only reorder within same pack+category
    if (dragTile.packId !== targetTile.packId || dragTile.category !== targetTile.category) return;

    const catTiles = sortByOrder(
      tileTypes.filter((t) => t.packId === dragTile.packId && t.category === dragTile.category),
    );
    const withoutDrag = catTiles.filter((t) => t.id !== draggingTileId);
    const targetIdx = withoutDrag.findIndex((t) => t.id === targetId);
    withoutDrag.splice(targetIdx, 0, dragTile);
    reorderTiles(withoutDrag.map((t) => t.id));
    setDraggingTileId(null);
    setDragOverTileId(null);
  }

  let filtered = tileTypes;
  if (selectedPackId) filtered = filtered.filter((t) => t.packId === selectedPackId);
  if (selectedCategory) filtered = filtered.filter((t) => t.category === selectedCategory);
  if (search) filtered = filtered.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  filtered = sortByOrder(filtered);

  const selectedTile = selectedTileId ? (tileTypes.find((t) => t.id === selectedTileId) ?? null) : null;

  return (
    <div className={`assets-screen${selectedTile ? ' assets-screen--detail' : ''}`}>
      <div className="assets-nav">
        <button
          className={`assets-import-btn${showImport ? ' active' : ''}`}
          onClick={() => setShowImport((v) => !v)}
        >
          {showImport ? '✕ Cancel Import' : '+ Import STL'}
        </button>
        <PackNav
          selectedPackId={selectedPackId}
          selectedCategory={selectedCategory}
          onSelect={handleNavSelect}
          draggingTileId={draggingTileId}
          onDropOnPack={handleDropOnPack}
          onDropOnCategory={handleDropOnCategory}
        />
      </div>

      <div className="assets-content">
        {showImport ? (
          <div className="assets-import-area">
            <ImportPanel />
          </div>
        ) : (
          <>
            <div className="assets-toolbar">
              <input
                className="search-input"
                placeholder="Search tiles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="assets-count">{filtered.length} tile{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="assets-grid">
              {filtered.map((tile) => (
                <AssetTileCard
                  key={tile.id}
                  tile={tile}
                  selected={selectedTileId === tile.id}
                  dragOver={dragOverTileId === tile.id}
                  onSelect={() => setSelectedTileId(tile.id === selectedTileId ? null : tile.id)}
                  onDragStart={() => { setDraggingTileId(tile.id); setDragOverTileId(null); }}
                  onDragEnd={() => { setDraggingTileId(null); setDragOverTileId(null); }}
                  onDragOver={() => setDragOverTileId(tile.id)}
                  onDragLeave={() => setDragOverTileId(null)}
                  onDrop={() => handleDropOnTile(tile.id)}
                />
              ))}
              {filtered.length === 0 && (
                <p className="assets-empty">
                  {tileTypes.length === 0 ? 'No tiles yet. Import STL files.' : 'No tiles match.'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {selectedTile && (
        <TileDetail tile={selectedTile} onClose={() => setSelectedTileId(null)} />
      )}
    </div>
  );
}
