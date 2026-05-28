import type { Placement, TileType } from '../db/schema';
import { rotateFootprint } from '../grid/transform';
import { CELL_MM } from '../grid/cell';

const CATEGORY_COLORS: Record<string, string> = {
  floor:   '#4a7c59',
  wall:    '#7c4a4a',
  corner:  '#7c6a4a',
  stair:   '#4a6a7c',
  pillar:  '#6a4a7c',
  river:   '#4a6a7c',
  door:    '#7c7c4a',
  stalag:  '#5a5a7a',
  stalac:  '#5a5a7a',
  prop:    '#5a5a5a',
};

const FALLBACK_COLOR = '#555566';
const CELL_PX = 48;
const MARGIN_PX = 40; // space for coordinates
const LEGEND_W = 200;
const FONT = '11px monospace';
const LABEL_FONT = '10px monospace';

function catColor(category: string): string {
  const key = Object.keys(CATEGORY_COLORS).find(k => category.toLowerCase().includes(k));
  return key ? CATEGORY_COLORS[key] : FALLBACK_COLOR;
}

function colLabel(x: number): string {
  // 0→A, 1→B, ... 25→Z, 26→AA
  let s = '';
  x += 1;
  while (x > 0) {
    x--;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

export interface SchematicOptions {
  cellPx?: number;
  showCoords?: boolean;
  showLegend?: boolean;
}

export function renderSchematicToCanvas(
  canvas: HTMLCanvasElement,
  placements: Placement[],
  tileTypes: TileType[],
  packNames: Map<string, string>,
  opts: SchematicOptions = {},
): void {
  const cellPx = opts.cellPx ?? CELL_PX;
  const showCoords = opts.showCoords ?? true;
  const showLegend = opts.showLegend ?? true;

  const ttMap = new Map(tileTypes.map(t => [t.id, t]));

  if (placements.length === 0) {
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 400, 200);
    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No tiles placed', 200, 105);
    return;
  }

  // Compute bounding box of map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    minX = Math.min(minX, p.gx);
    minY = Math.min(minY, p.gy);
    maxX = Math.max(maxX, p.gx + eff.w);
    maxY = Math.max(maxY, p.gy + eff.h);
  }

  const cols = maxX - minX;
  const rows = maxY - minY;
  const margin = showCoords ? MARGIN_PX : 8;
  const legendW = showLegend ? LEGEND_W : 0;

  canvas.width  = margin + cols * cellPx + legendW + 8;
  canvas.height = margin + rows * cellPx + 8;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ox = margin - minX * cellPx;
  const oy = margin - minY * cellPx;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  for (let x = minX; x <= maxX; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * cellPx, margin);
    ctx.lineTo(ox + x * cellPx, margin + rows * cellPx);
    ctx.stroke();
  }
  for (let y = minY; y <= maxY; y++) {
    ctx.beginPath();
    ctx.moveTo(margin, oy + y * cellPx);
    ctx.lineTo(margin + cols * cellPx, oy + y * cellPx);
    ctx.stroke();
  }
  // Bold every 5
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let x = minX; x <= maxX; x++) {
    if ((x - minX) % 5 === 0) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cellPx, margin);
      ctx.lineTo(ox + x * cellPx, margin + rows * cellPx);
      ctx.stroke();
    }
  }
  for (let y = minY; y <= maxY; y++) {
    if ((y - minY) % 5 === 0) {
      ctx.beginPath();
      ctx.moveTo(margin, oy + y * cellPx);
      ctx.lineTo(margin + cols * cellPx, oy + y * cellPx);
      ctx.stroke();
    }
  }

  // Place tiles
  // Build label index for legend (name → color, count)
  const legendItems = new Map<string, { color: string; count: number; label: string }>();

  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    const color = catColor(tt.category);
    const px = ox + p.gx * cellPx;
    const py = oy + p.gy * cellPx;
    const w = eff.w * cellPx;
    const h = eff.h * cellPx;

    // Tile fill
    ctx.fillStyle = color + 'cc';
    ctx.fillRect(px + 1, py + 1, w - 2, h - 2);

    // Tile border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);

    // Short name label inside tile if enough space
    if (w >= 28 && h >= 14) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const shortName = tt.name.length > 10 ? tt.name.slice(0, 9) + '…' : tt.name;
      ctx.fillText(shortName, px + w / 2, py + h / 2);
    }

    // Legend accumulate
    const packName = packNames.get(tt.packId) ?? tt.packId;
    const legendKey = tt.id;
    if (!legendItems.has(legendKey)) {
      legendItems.set(legendKey, { color, count: 1, label: `${packName} / ${tt.name}` });
    } else {
      legendItems.get(legendKey)!.count++;
    }
  }

  // Coordinate labels
  if (showCoords) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = FONT;
    ctx.textBaseline = 'middle';

    // Column labels (A, B, …) on top
    for (let x = minX; x < maxX; x++) {
      ctx.textAlign = 'center';
      ctx.fillText(colLabel(x - minX), ox + x * cellPx + cellPx / 2, margin / 2);
    }
    // Row labels (1, 2, …) on left
    for (let y = minY; y < maxY; y++) {
      ctx.textAlign = 'right';
      ctx.fillText(String(y - minY + 1), margin - 4, oy + y * cellPx + cellPx / 2);
    }
  }

  // Legend
  if (showLegend && legendItems.size > 0) {
    const lx = margin + cols * cellPx + 12;
    let ly = margin;

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Legend', lx, ly);
    ly += 18;

    // Scale
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.fillText(`1 cell = ${CELL_MM} mm`, lx, ly);
    ly += 16;

    for (const [, item] of legendItems) {
      if (ly + 14 > canvas.height) break;
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, ly + 1, 12, 10);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, ly + 1, 12, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px monospace';
      ctx.textBaseline = 'top';
      const label = `×${item.count} ${item.label.length > 22 ? item.label.slice(0, 21) + '…' : item.label}`;
      ctx.fillText(label, lx + 16, ly);
      ly += 14;
    }
  }
}

export function exportSchematicPNG(canvas: HTMLCanvasElement, mapName: string): void {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${mapName.replace(/\s+/g, '_').toLowerCase()}_schematic.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

export function exportSchematicSVG(
  placements: Placement[],
  tileTypes: TileType[],
  packNames: Map<string, string>,
  mapName: string,
  opts: SchematicOptions = {},
): void {
  const cellPx = opts.cellPx ?? CELL_PX;
  const showCoords = opts.showCoords ?? true;
  const showLegend = opts.showLegend ?? true;

  const ttMap = new Map(tileTypes.map(t => [t.id, t]));
  if (placements.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    minX = Math.min(minX, p.gx);
    minY = Math.min(minY, p.gy);
    maxX = Math.max(maxX, p.gx + eff.w);
    maxY = Math.max(maxY, p.gy + eff.h);
  }

  const cols = maxX - minX;
  const rows = maxY - minY;
  const margin = showCoords ? MARGIN_PX : 8;
  const legendW = showLegend ? LEGEND_W : 0;
  const W = margin + cols * cellPx + legendW + 8;
  const H = margin + rows * cellPx + 8;
  const ox = margin - minX * cellPx;
  const oy = margin - minY * cellPx;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#1a1a2e;font-family:monospace">`);

  // Grid
  for (let x = minX; x <= maxX; x++) {
    const lw = (x - minX) % 5 === 0 ? 1 : 0.5;
    const op = (x - minX) % 5 === 0 ? 0.18 : 0.08;
    lines.push(`<line x1="${ox + x * cellPx}" y1="${margin}" x2="${ox + x * cellPx}" y2="${margin + rows * cellPx}" stroke="white" stroke-opacity="${op}" stroke-width="${lw}"/>`);
  }
  for (let y = minY; y <= maxY; y++) {
    const lw = (y - minY) % 5 === 0 ? 1 : 0.5;
    const op = (y - minY) % 5 === 0 ? 0.18 : 0.08;
    lines.push(`<line x1="${margin}" y1="${oy + y * cellPx}" x2="${margin + cols * cellPx}" y2="${oy + y * cellPx}" stroke="white" stroke-opacity="${op}" stroke-width="${lw}"/>`);
  }

  // Legend map
  const legendItems = new Map<string, { color: string; count: number; label: string }>();

  // Tiles
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    const color = catColor(tt.category);
    const px = ox + p.gx * cellPx;
    const py = oy + p.gy * cellPx;
    const w = eff.w * cellPx;
    const h = eff.h * cellPx;
    lines.push(`<rect x="${px + 1}" y="${py + 1}" width="${w - 2}" height="${h - 2}" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>`);
    if (w >= 28 && h >= 14) {
      const shortName = tt.name.length > 10 ? tt.name.slice(0, 9) + '…' : tt.name;
      lines.push(`<text x="${px + w / 2}" y="${py + h / 2}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.85)" font-size="10">${escXML(shortName)}</text>`);
    }
    const packName = packNames.get(tt.packId) ?? tt.packId;
    if (!legendItems.has(tt.id)) {
      legendItems.set(tt.id, { color, count: 1, label: `${packName} / ${tt.name}` });
    } else {
      legendItems.get(tt.id)!.count++;
    }
  }

  // Coord labels
  if (showCoords) {
    for (let x = minX; x < maxX; x++) {
      lines.push(`<text x="${ox + x * cellPx + cellPx / 2}" y="${margin / 2}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11">${colLabel(x - minX)}</text>`);
    }
    for (let y = minY; y < maxY; y++) {
      lines.push(`<text x="${margin - 4}" y="${oy + y * cellPx + cellPx / 2}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11">${y - minY + 1}</text>`);
    }
  }

  // Legend
  if (showLegend && legendItems.size > 0) {
    const lx = margin + cols * cellPx + 12;
    let ly = margin;
    lines.push(`<text x="${lx}" y="${ly + 11}" fill="rgba(255,255,255,0.7)" font-size="11">Legend</text>`);
    ly += 18;
    lines.push(`<text x="${lx}" y="${ly + 10}" fill="rgba(255,255,255,0.4)" font-size="10">1 cell = ${CELL_MM} mm</text>`);
    ly += 16;
    for (const [, item] of legendItems) {
      if (ly + 14 > H) break;
      lines.push(`<rect x="${lx}" y="${ly + 1}" width="12" height="10" fill="${item.color}" stroke="${item.color}" stroke-width="1"/>`);
      const label = `×${item.count} ${item.label.length > 22 ? item.label.slice(0, 21) + '…' : item.label}`;
      lines.push(`<text x="${lx + 16}" y="${ly + 10}" fill="rgba(255,255,255,0.75)" font-size="10">${escXML(label)}</text>`);
      ly += 14;
    }
  }

  lines.push('</svg>');
  const svg = lines.join('\n');
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${mapName.replace(/\s+/g, '_').toLowerCase()}_schematic.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escXML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
