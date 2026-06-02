# CaveForge — OpenLOCK Tile Editor

Plan and preview your [OpenLOCK](https://www.printablescenery.com/openlock/) terrain before you print a single piece. Import your STL collection, lay out a map on a grid, see how it looks assembled in 3D, try your minis and other terrain — then export exactly what you need to print.

Everything runs in the browser. Your models and designs never leave your computer.

**Hosted on:** https://charliebyrd.github.io/caveforge_openlock/

---

## Features

### STL Library
- Import STL files individually or a whole folder at once (STL only)
- Collection organized into packs (e.g. Cave, Dungeon, Wooden Tiles) and categories, auto-detected from your folder structure
- Footprint (in grid cells) and height class (`floor` / `wall` / `prop`) calculated automatically at import
- Same STL stored only once no matter how many categories reference it

### Assets Management
- Browse packs and categories in a side panel
- Drag tiles between packs and categories; reorder tiles within a category
- Inline editing: name, pack, category, footprint, height class, inventory count, prop flag
- Per-tile **3D color** — choose how each tile looks in the 3D preview
- Rename and delete packs

### STL Orientation Editor
- Adjust rotation around X, Y, Z axes and vertical offset (Y) per tile type
- Live 3D preview with orbit drag and a ground grid for reference
- Step buttons (−90° / +90°) or type exact degrees; reset to default in one click

### 2D Grid Editor
- Click or drag to place tiles; right-click to erase
- Tiles cannot overlap — collision is checked automatically
- Rotate selected tile with `R` (0 / 90 / 180 / 270°)
- Pan with Space+drag or middle mouse; zoom with scroll wheel
- Undo / Redo (`Cmd+Z` / `Cmd+Shift+Z`, 50-step history)

### 3D Preview
- Real-time view of your full map using your actual STL geometry
- Toggle between orbit camera and top-down orthographic view
- Supports maps with hundreds of pieces without slowdown

### Split Mode
- View the 2D grid and 3D preview side by side
- Quick view switcher in the editor toolbar: **2D** / **Split** / **3D** / **BOM**

### Render Settings
Tune the look of the 3D preview with a live slider bar:

| Setting | What it controls |
|---|---|
| Contrast | Overall contrast of the 3D view |
| Brightness | Overall brightness |
| Saturation | Color richness |
| Ambient | Fill-light intensity |
| Depth | Key-light intensity (shadows and depth) |
| Fog | Distance haze |
| Decimation | Model detail vs. performance trade-off |

Reset to defaults with one click. All settings are saved automatically.

### Bill of Materials (BOM)
- Per-tile breakdown: required (placed on map) vs. in stock vs. to print
- OpenLOCK clip count based on tile adjacency
- Toggle inventory on/off; toggle props in/out
- Export as CSV or JSON

### Inventory
- Enter how many of each tile you've already printed
- Those copies are subtracted from the to-print count automatically
- Edit inventory in the Assets panel or directly in the BOM table

### Print Export
- Export as a ZIP: original STL for each tile type + `manifest.json` with quantities
- Options: subtract inventory, exclude props, one folder per pack
- Split across up to 10 printers — copies distributed evenly, each printer gets its own ZIP
- Progress bar during export; ZIPs download automatically when ready

### Schematic Export
- Top-down plan view with chess-style coordinate labels (A1, B2…)
- Toggles: coordinates, grid lines, tile labels, props
- Color-coded by category with legend and real-world dimensions (mm + inches)
- Export as PNG or SVG; adjustable cell size

### Map Sharing
- **Export Map Pack:** bundles the current map and all its STL tiles into a single `.zip`
- **Import Map Pack:** load the archive on any machine — existing tiles are matched by content, new ones are added automatically

### Multiple Maps
- Create, rename, switch, clear, and delete maps
- All maps saved in the browser — no account needed

---

## Limitations

### Multipart tiles
CaveForge works with one STL per tile. Some models come as separate parts (e.g. a door frame + door leaf as individual files). Two options:
1. Combine the parts into a single assembly in your slicer and export one STL.
2. Use only the base part.

Multipart pieces are also a problem for print export since CaveForge can't group them automatically. **Recommended:** print these parts in advance and record them in your inventory so they're excluded from the print list.

### Flat maps only
CaveForge is a single-level, top-down editor. Vertical construction — multi-story builds, stacked floors, elevated walkways — is not supported. All tiles are placed on one plane.

### STL only
3MF, OBJ, and other formats are not supported.

### Footprint and orientation are independent
Footprint and height class are measured at import time. If you later re-orient a model in the Orientation Editor, those values are not recalculated automatically — adjust them manually if needed.

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
- STL files are exported unchanged — geometry is read only to measure footprint and render the preview
