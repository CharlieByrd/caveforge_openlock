export interface Pack {
  id: string;
  name: string;
  createdAt: number;
}

export type HeightClass = 'floor' | 'wall' | 'prop';
export type Rotation = 0 | 90 | 180 | 270;

export interface TileType {
  id: string;
  packId: string;
  category: string;
  name: string;
  fileName: string;
  stlBlobKey: string;
  sizeMM: { x: number; y: number; z: number };
  footprint: { w: number; h: number };
  heightClass: HeightClass;
  hash: string;
  inStock: number;
  order?: number;
}

export interface BlobRecord {
  key: string;
  bytes: ArrayBuffer;
  mime: string;
}

export interface Placement {
  uid: string;
  tileTypeId: string;
  gx: number;
  gy: number;
  z: number;
  rot: Rotation;
}

export interface MapDoc {
  id: string;
  name: string;
  placements: Placement[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  considerInventory: boolean;
  viewMode: 'top' | 'iso';
  splitStrategy: 'volume' | 'count';
}
