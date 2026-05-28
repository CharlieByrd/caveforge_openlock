import { openDB, type IDBPDatabase } from 'idb';
import type { Pack, TileType, BlobRecord, MapDoc, Settings } from './schema';

const DB_NAME = 'caveforge';
const DB_VERSION = 1;

export type CaveForgeDB = IDBPDatabase<{
  packs: { key: string; value: Pack };
  tileTypes: { key: string; value: TileType; indexes: { byPackId: string; byHash: string } };
  blobs: { key: string; value: BlobRecord };
  maps: { key: string; value: MapDoc };
  settings: { key: string; value: Settings };
}>;

let _db: CaveForgeDB | null = null;

export async function getDB(): Promise<CaveForgeDB> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('packs')) {
        db.createObjectStore('packs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tileTypes')) {
        const ttStore = db.createObjectStore('tileTypes', { keyPath: 'id' });
        ttStore.createIndex('byPackId', 'packId');
        ttStore.createIndex('byHash', 'hash');
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('maps')) {
        db.createObjectStore('maps', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });
  return _db;
}

// --- Packs ---
export async function putPack(pack: Pack) {
  const db = await getDB();
  return db.put('packs', pack);
}

export async function getAllPacks(): Promise<Pack[]> {
  const db = await getDB();
  return db.getAll('packs');
}

export async function deletePack(id: string) {
  const db = await getDB();
  return db.delete('packs', id);
}

// --- TileTypes ---
export async function putTileType(tt: TileType) {
  const db = await getDB();
  return db.put('tileTypes', tt);
}

export async function getTileType(id: string): Promise<TileType | undefined> {
  const db = await getDB();
  return db.get('tileTypes', id);
}

export async function getAllTileTypes(): Promise<TileType[]> {
  const db = await getDB();
  return db.getAll('tileTypes');
}

export async function getTileTypesByPack(packId: string): Promise<TileType[]> {
  const db = await getDB();
  return db.getAllFromIndex('tileTypes', 'byPackId', packId);
}

export async function getTileTypesByHash(hash: string): Promise<TileType[]> {
  const db = await getDB();
  return db.getAllFromIndex('tileTypes', 'byHash', hash);
}

export async function deleteTileType(id: string) {
  const db = await getDB();
  return db.delete('tileTypes', id);
}

// --- Blobs ---
export async function putBlob(record: BlobRecord) {
  const db = await getDB();
  return db.put('blobs', record);
}

export async function getBlob(key: string): Promise<BlobRecord | undefined> {
  const db = await getDB();
  return db.get('blobs', key);
}

export async function deleteBlob(key: string) {
  const db = await getDB();
  return db.delete('blobs', key);
}

// --- Maps ---
export async function putMap(map: MapDoc) {
  const db = await getDB();
  return db.put('maps', map);
}

export async function getMap(id: string): Promise<MapDoc | undefined> {
  const db = await getDB();
  return db.get('maps', id);
}

export async function getAllMaps(): Promise<MapDoc[]> {
  const db = await getDB();
  return db.getAll('maps');
}

export async function deleteMap(id: string) {
  const db = await getDB();
  return db.delete('maps', id);
}

// --- Settings ---
const SETTINGS_KEY = 'global';

export const DEFAULT_SETTINGS: Settings = {
  considerInventory: true,
  viewMode: 'top',
  splitStrategy: 'volume',
};

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const val = await db.get('settings', SETTINGS_KEY);
  return val ?? DEFAULT_SETTINGS;
}

export async function putSettings(s: Settings) {
  const db = await getDB();
  return db.put('settings', s, SETTINGS_KEY);
}
