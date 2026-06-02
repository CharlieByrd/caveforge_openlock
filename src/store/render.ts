import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RenderSettings {
  contrast: number;      // CSS % — 50-250
  brightness: number;    // CSS % — 20-200
  saturation: number;    // CSS % — 0-200
  ambient: number;       // Three.js intensity — 0-2
  dirLight: number;      // Three.js intensity — 0-4
  fogDensity: number;    // FogExp2 density — 0-0.12
  maxTriangles: number;  // QEM simplify target per STL (1k–1000k, Infinity = off)
}

const DEFAULTS: RenderSettings = {
  contrast: 122,
  brightness: 129,
  saturation: 66,
  ambient: 0.36,
  dirLight: 2.35,
  fogDensity: 0,
  maxTriangles: 195_000,
};

interface RenderState extends RenderSettings {
  set: (patch: Partial<RenderSettings>) => void;
  reset: () => void;
}

export const useRenderStore = create<RenderState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'caveforge-render',
      partialize: (s) => ({
        contrast: s.contrast,
        brightness: s.brightness,
        saturation: s.saturation,
        ambient: s.ambient,
        dirLight: s.dirLight,
        fogDensity: s.fogDensity,
        maxTriangles: s.maxTriangles,
      }),
    },
  ),
);

export function cssFilter(s: RenderSettings): string {
  const parts: string[] = [];
  if (s.contrast !== 100) parts.push(`contrast(${s.contrast}%)`);
  if (s.brightness !== 100) parts.push(`brightness(${s.brightness}%)`);
  if (s.saturation !== 100) parts.push(`saturate(${s.saturation}%)`);
  return parts.length ? parts.join(' ') : 'none';
}
