# CaveForge — OpenLOCK Tile Editor

A browser-based map editor for tabletop RPG terrain built with the [OpenLOCK](https://www.printablescenery.com/openlock/) system. Import your own STL files, lay out tiles on a grid, preview in 3D, calculate your bill of materials, and export print-ready files — all offline, all in the browser.

**Live demo:** https://charliebyrd.github.io/caveforge_openlock/

---

## Features

### STL Library
- Import STL files by folder or individual files
- Automatic pack/category detection from folder structure
- Auto-calculated footprint (in OpenLOCK grid cells) and height class (`floor` / `wall` / `prop`)
- SHA-256 deduplication — same STL stored once regardless of how many categories reference it
- Pre-rendered top-down and isometric icons generated from the actual geometry

### Assets Management
- Browse packs and categories in a navigator panel
- Drag tiles between packs and categories
- Reorder tiles within a category by dragging
- Inline tile editing: name, pack, category, footprint, height class, inventory count
- Rename and delete packs

### 2D Grid Editor
- Click or drag to place tiles; right-click to erase
- Collision detection — tiles cannot overlap
- Rotate selected tile with `R` (0 / 90 / 180 / 270°)
- Pan with Space+drag or middle mouse; zoom with scroll wheel
- Undo / Redo (`Cmd+Z` / `Cmd+Shift+Z`, 50-step history)

### 3D Preview
- Real-time Three.js render of the full map using actual STL geometry
- InstancedMesh for high-performance rendering of 500+ placements
- Adjustable lighting, contrast, brightness, saturation, and fog (settings saved automatically)
- Orbit camera with smooth controls

### Bill of Materials (BOM)
- Per-tile count of required vs. in-stock vs. to-print
- OpenLOCK clip count based on shared tile edges
- Inventory toggle to temporarily ignore stock
- CSV and JSON export

### Print Export
- **Format A — ZIP with originals:** each tile type as its original STL file + `manifest.json` with quantities
- **Format B — merged STL:** all copies concatenated into one file (coordinates unchanged)
- Split across N printers with balanced distribution
- Web Worker processing with progress bar — never blocks the UI

### Schematic Export
- Top-down plan view rendered to canvas with chess-style coordinate labels (A1, B2…)
- Color-coded by category with legend
- Export as PNG or SVG
- Adjustable cell size

### Map Sharing
- **Export Map Pack:** bundles the current map + all STL tiles it uses into a single `.zip` archive
- **Import Map Pack:** loads the archive on another machine, deduplicates tiles by hash, and switches to the imported map

### Multiple Maps
- Create, rename, and switch between maps
- All maps persist in the browser's IndexedDB

---

## Tested Model Collections

These OpenLOCK-compatible packs work well with CaveForge (Cave, Dungeon, Wooden, Sewer packs tested):

- [Together3D Collections on MakerWorld](https://makerworld.com/en/@Together3D/collections)
- [OpenForge SinglePrint Collection](https://makerworld.com/en/collections/2702727-openforge-singleprint)

---

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite |
| 3D | Three.js |
| State | Zustand |
| Storage | IndexedDB via `idb` |
| ZIP | JSZip |
| Tests | Vitest |

No backend. No server. Works offline after first load.

---

## Local Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

```bash
npm run build   # production build
npm test        # run unit tests
```

---

## OpenLOCK Grid

- 1 cell = **25.4 mm** (1 inch)
- STL files are stored and exported **byte-for-byte unchanged** — geometry is parsed only for bbox measurement and rendering
- Parse errors are reported clearly; invalid files are never added to the library
