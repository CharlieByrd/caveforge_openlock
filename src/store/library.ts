import { create } from 'zustand';
import type { Pack, TileType } from '../lib/db/schema';
import { getAllPacks, getAllTileTypes, putTileType, deleteTileType, putPack, deletePack as deletePackIDB } from '../lib/db/idb';

interface LibraryState {
  packs: Pack[];
  tileTypes: TileType[];
  selectedTileTypeId: string | null;
  recentTileTypeIds: string[];
  loading: boolean;
  load: () => Promise<void>;
  updateTileType: (id: string, patch: Partial<TileType>) => Promise<void>;
  removeTileType: (id: string) => Promise<void>;
  selectTileType: (id: string | null) => void;
  renamePack: (id: string, name: string) => Promise<void>;
  deletePack: (id: string) => Promise<void>;
  reorderTiles: (orderedIds: string[]) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  packs: [],
  tileTypes: [],
  selectedTileTypeId: null,
  recentTileTypeIds: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const [packs, tileTypes] = await Promise.all([getAllPacks(), getAllTileTypes()]);
    set({ packs, tileTypes, loading: false });
  },

  updateTileType: async (id, patch) => {
    const tt = get().tileTypes.find((t) => t.id === id);
    if (!tt) return;
    const updated = { ...tt, ...patch };
    await putTileType(updated);
    set((s) => ({ tileTypes: s.tileTypes.map((t) => (t.id === id ? updated : t)) }));
  },

  removeTileType: async (id) => {
    await deleteTileType(id);
    set((s) => ({ tileTypes: s.tileTypes.filter((t) => t.id !== id) }));
  },

  selectTileType: (id) => set((s) => {
    if (!id) return { selectedTileTypeId: null };
    const recent = [id, ...s.recentTileTypeIds.filter((r) => r !== id)].slice(0, 5);
    return { selectedTileTypeId: id, recentTileTypeIds: recent };
  }),

  renamePack: async (id, name) => {
    const pack = get().packs.find((p) => p.id === id);
    if (!pack) return;
    const updated = { ...pack, name };
    await putPack(updated);
    set((s) => ({ packs: s.packs.map((p) => (p.id === id ? updated : p)) }));
  },

  reorderTiles: async (orderedIds) => {
    const tiles = get().tileTypes;
    const updated: TileType[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const tile = tiles.find((t) => t.id === orderedIds[i]);
      if (!tile) continue;
      const u = { ...tile, order: i };
      updated.push(u);
      await putTileType(u);
    }
    set((s) => ({
      tileTypes: s.tileTypes.map((t) => updated.find((u) => u.id === t.id) ?? t),
    }));
  },

  deletePack: async (id) => {
    const tilesToDelete = get().tileTypes.filter((t) => t.packId === id);
    await Promise.all(tilesToDelete.map((t) => deleteTileType(t.id)));
    await deletePackIDB(id);
    set((s) => ({
      packs: s.packs.filter((p) => p.id !== id),
      tileTypes: s.tileTypes.filter((t) => t.packId !== id),
      selectedTileTypeId: tilesToDelete.some((t) => t.id === s.selectedTileTypeId)
        ? null
        : s.selectedTileTypeId,
    }));
  },
}));
