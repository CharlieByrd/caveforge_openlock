import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { MapDoc, Placement, Rotation } from '../lib/db/schema';
import { getDB } from '../lib/db/idb';
import { getAllMaps, deleteMap as dbDeleteMap } from '../lib/db/idb';

const INITIAL_MAP: MapDoc = {
  id: 'default',
  name: 'Untitled Map',
  placements: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

interface HistoryEntry {
  placements: Placement[];
}

interface MapState {
  map: MapDoc;
  allMaps: MapDoc[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  selectedRotation: Rotation;

  load: (id?: string) => Promise<void>;
  loadAllMaps: () => Promise<void>;
  save: () => Promise<void>;
  newMap: (name: string) => Promise<void>;
  switchMap: (id: string) => Promise<void>;
  renameMap: (name: string) => Promise<void>;
  clearMap: () => void;
  deleteMap: (id: string) => Promise<void>;
  addPlacement: (tileTypeId: string, gx: number, gy: number, z: number) => void;
  removePlacement: (uid: string) => void;
  rotatePlacement: (uid: string, rot: Rotation) => void;
  setSelectedRotation: (rot: Rotation) => void;
  undo: () => void;
  redo: () => void;
}

function snapshot(placements: Placement[]): Placement[] {
  return placements.map(p => ({ ...p }));
}

export const useMapStore = create<MapState>((set, get) => ({
  map: INITIAL_MAP,
  allMaps: [],
  past: [],
  future: [],
  selectedRotation: 0,

  async load(id = 'default') {
    const db = await getDB();
    const doc = await db.get('maps', id);
    if (doc) set({ map: doc, past: [], future: [] });
    else {
      await db.put('maps', INITIAL_MAP);
      set({ map: INITIAL_MAP, past: [], future: [] });
    }
    await get().loadAllMaps();
  },

  async loadAllMaps() {
    const maps = await getAllMaps();
    set({ allMaps: maps.sort((a, b) => b.updatedAt - a.updatedAt) });
  },

  async save() {
    const db = await getDB();
    const map = { ...get().map, updatedAt: Date.now() };
    await db.put('maps', map);
    set({ map });
    await get().loadAllMaps();
  },

  async newMap(name) {
    const map: MapDoc = {
      id: uuid(),
      name: name.trim() || 'Untitled Map',
      placements: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const db = await getDB();
    await db.put('maps', map);
    set({ map, past: [], future: [] });
    await get().loadAllMaps();
  },

  async switchMap(id) {
    const db = await getDB();
    const doc = await db.get('maps', id);
    if (doc) set({ map: doc, past: [], future: [] });
  },

  async renameMap(name) {
    const map = { ...get().map, name: name.trim() || 'Untitled Map' };
    const db = await getDB();
    await db.put('maps', map);
    set({ map });
    await get().loadAllMaps();
  },

  clearMap() {
    const map = { ...get().map, placements: [], updatedAt: Date.now() };
    set({ map, past: [], future: [] });
    void get().save();
  },

  async deleteMap(id) {
    await dbDeleteMap(id);
    const { map } = get();
    if (map.id === id) {
      // Switch to another map or create default
      const remaining = (await getAllMaps()).filter(m => m.id !== id);
      if (remaining.length > 0) {
        set({ map: remaining[0], past: [], future: [] });
      } else {
        const fresh: MapDoc = { ...INITIAL_MAP, id: uuid(), createdAt: Date.now(), updatedAt: Date.now() };
        const db = await getDB();
        await db.put('maps', fresh);
        set({ map: fresh, past: [], future: [] });
      }
    }
    await get().loadAllMaps();
  },

  addPlacement(tileTypeId, gx, gy, z) {
    const { map, past, selectedRotation } = get();
    const placement: Placement = { uid: uuid(), tileTypeId, gx, gy, z, rot: selectedRotation };
    set({
      past: [...past, { placements: snapshot(map.placements) }],
      future: [],
      map: { ...map, placements: [...map.placements, placement], updatedAt: Date.now() },
    });
    void get().save();
  },

  removePlacement(uid) {
    const { map, past } = get();
    set({
      past: [...past, { placements: snapshot(map.placements) }],
      future: [],
      map: { ...map, placements: map.placements.filter(p => p.uid !== uid), updatedAt: Date.now() },
    });
    void get().save();
  },

  rotatePlacement(uid, rot) {
    const { map, past } = get();
    set({
      past: [...past, { placements: snapshot(map.placements) }],
      future: [],
      map: { ...map, placements: map.placements.map(p => p.uid === uid ? { ...p, rot } : p), updatedAt: Date.now() },
    });
    void get().save();
  },

  setSelectedRotation(rot) {
    set({ selectedRotation: rot });
  },

  undo() {
    const { past, future, map } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [{ placements: snapshot(map.placements) }, ...future],
      map: { ...map, placements: prev.placements, updatedAt: Date.now() },
    });
    void get().save();
  },

  redo() {
    const { past, future, map } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      past: [...past, { placements: snapshot(map.placements) }],
      future: future.slice(1),
      map: { ...map, placements: next.placements, updatedAt: Date.now() },
    });
    void get().save();
  },
}));
