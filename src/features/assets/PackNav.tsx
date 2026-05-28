import { useState } from 'react';
import { useLibraryStore } from '../../store/library';

interface Props {
  selectedPackId: string | null;
  selectedCategory: string | null;
  onSelect: (packId: string | null, category: string | null) => void;
  draggingTileId: string | null;
  onDropOnPack: (packId: string) => void;
  onDropOnCategory: (packId: string, category: string) => void;
}

export function PackNav({
  selectedPackId, selectedCategory, onSelect,
  draggingTileId, onDropOnPack, onDropOnCategory,
}: Props) {
  const { packs, tileTypes, renamePack, deletePack } = useLibraryStore();
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function startRename(packId: string, current: string) {
    setEditName(current);
    setEditingPackId(packId);
  }

  async function commitRename(packId: string, fallback: string) {
    await renamePack(packId, editName.trim() || fallback);
    setEditingPackId(null);
  }

  return (
    <nav className="pack-nav">
      <div
        className={`pack-nav-all${!selectedPackId ? ' active' : ''}`}
        onClick={() => onSelect(null, null)}
      >
        <span>All tiles</span>
        <span className="pack-nav-count">{tileTypes.length}</span>
      </div>

      {packs.map((pack) => {
        const packTiles = tileTypes.filter((t) => t.packId === pack.id);
        const categories = [...new Set(packTiles.map((t) => t.category))].sort();
        const packDropKey = `pack:${pack.id}`;
        const isPackDrop = dropTarget === packDropKey && draggingTileId !== null;

        return (
          <div key={pack.id} className="pack-nav-item">
            {editingPackId === pack.id ? (
              <div className="pack-nav-rename">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(pack.id, pack.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(pack.id, pack.name);
                    if (e.key === 'Escape') setEditingPackId(null);
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <div
                className={`pack-nav-pack-header${selectedPackId === pack.id && !selectedCategory ? ' active' : ''}${isPackDrop ? ' drop-target' : ''}`}
                onClick={() => onSelect(pack.id, null)}
                onDragOver={draggingTileId ? (e) => { e.preventDefault(); setDropTarget(packDropKey); } : undefined}
                onDragLeave={draggingTileId ? () => setDropTarget(null) : undefined}
                onDrop={draggingTileId ? (e) => { e.preventDefault(); onDropOnPack(pack.id); setDropTarget(null); } : undefined}
              >
                <span className="pack-nav-pack-name">{pack.name}</span>
                <span className="pack-nav-count">{packTiles.length}</span>
                <button
                  className="pack-nav-action"
                  title="Rename"
                  onClick={(e) => { e.stopPropagation(); startRename(pack.id, pack.name); }}
                >✏</button>
                <button
                  className="pack-nav-action pack-nav-action--danger"
                  title="Delete pack"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete pack "${pack.name}" and all ${packTiles.length} tiles?`)) {
                      deletePack(pack.id);
                    }
                  }}
                >🗑</button>
              </div>
            )}

            <div className="pack-nav-cats">
              {categories.map((cat) => {
                const count = packTiles.filter((t) => t.category === cat).length;
                const catKey = `cat:${pack.id}:${cat}`;
                const isCatDrop = dropTarget === catKey && draggingTileId !== null;

                return (
                  <div
                    key={cat}
                    className={`pack-nav-cat${selectedPackId === pack.id && selectedCategory === cat ? ' active' : ''}${isCatDrop ? ' drop-target' : ''}`}
                    onClick={() => onSelect(pack.id, cat)}
                    onDragOver={draggingTileId ? (e) => { e.preventDefault(); setDropTarget(catKey); } : undefined}
                    onDragLeave={draggingTileId ? () => setDropTarget(null) : undefined}
                    onDrop={draggingTileId ? (e) => { e.preventDefault(); onDropOnCategory(pack.id, cat); setDropTarget(null); } : undefined}
                  >
                    <span className="pack-nav-cat-name">{cat}</span>
                    <span className="pack-nav-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
