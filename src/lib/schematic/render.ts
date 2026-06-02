import type { Placement, TileType, Rotation } from '../db/schema';
import { rotateFootprint } from '../grid/transform';
import { CELL_MM } from '../grid/cell';

// Height-class colors — matches editor2d/GridCanvas.tsx
const HC_COLORS: Record<string, string> = {
  floor: '#4a7c59',
  wall:  '#7c6a4a',
  prop:  '#4a5c7c',
};
const FALLBACK_COLOR = '#555566';

const CELL_PX = 48;
const MARGIN_PX = 40;
const FONT = '11px monospace';
const LABEL_FONT = '10px monospace';

function hcColor(heightClass: string): string {
  return HC_COLORS[heightClass] ?? FALLBACK_COLOR;
}

function colLabel(x: number): string {
  let s = '';
  x += 1;
  while (x > 0) {
    x--;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

function abbrev(name: string): string {
  // "Cave Wall Corner" → "CWC", "floor_2x2" → "F2", single word → first 3 chars
  const words = name.replace(/[_-]/g, ' ').trim().split(/\s+/);
  if (words.length >= 2) return words.map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 4);
  return name.slice(0, 3).toUpperCase();
}

export interface SchematicOptions {
  cellPx?: number;
  showCoords?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  /** @deprecated use showGrid */
  showLegend?: boolean;
}

export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  tileTypeId: string;
  rot: Rotation;
}

export function getHitRects(
  placements: Placement[],
  tileTypes: TileType[],
  opts: SchematicOptions = {},
): HitRect[] {
  const cellPx = opts.cellPx ?? CELL_PX;
  const showCoords = opts.showCoords ?? true;
  const margin = showCoords ? MARGIN_PX : 8;
  const ttMap = new Map(tileTypes.map(t => [t.id, t]));

  if (placements.length === 0) return [];

  let minX = Infinity, minY = Infinity;
  for (const p of placements) {
    minX = Math.min(minX, p.gx);
    minY = Math.min(minY, p.gy);
  }

  const ox = margin - minX * cellPx;
  const oy = margin - minY * cellPx;

  return placements.flatMap(p => {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) return [];
    const eff = rotateFootprint(tt.footprint, p.rot);
    return [{
      x: ox + p.gx * cellPx,
      y: oy + p.gy * cellPx,
      w: eff.w * cellPx,
      h: eff.h * cellPx,
      tileTypeId: p.tileTypeId,
      rot: p.rot as Rotation,
    }];
  });
}

export function renderSchematicToCanvas(
  canvas: HTMLCanvasElement,
  placements: Placement[],
  tileTypes: TileType[],
  _packNames: Map<string, string>,
  opts: SchematicOptions = {},
): void {
  const cellPx = opts.cellPx ?? CELL_PX;
  const showCoords = opts.showCoords ?? true;
  const showGrid = opts.showGrid ?? (opts.showLegend ?? true);
  const showLabels = opts.showLabels ?? true;
  const dpr = window.devicePixelRatio || 1;

  const ttMap = new Map(tileTypes.map(t => [t.id, t]));

  if (placements.length === 0) {
    const w = 400; const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#555';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No tiles placed', 200, 105);
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    minX = Math.min(minX, p.gx); minY = Math.min(minY, p.gy);
    maxX = Math.max(maxX, p.gx + eff.w); maxY = Math.max(maxY, p.gy + eff.h);
  }

  const cols = maxX - minX;
  const rows = maxY - minY;
  const margin = showCoords ? MARGIN_PX : 8;
  const SCALE_H = 28; // scale bar footer strip height

  const cssW = margin + cols * cellPx + 8;
  const cssH = margin + rows * cellPx + SCALE_H + 8;

  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, cssW, cssH);

  const ox = margin - minX * cellPx;
  const oy = margin - minY * cellPx;

  // Grid lines
  if (showGrid) {
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
  }

  // Origin crosshair
  ctx.strokeStyle = 'rgba(233,69,96,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ox + minX * cellPx, margin);
  ctx.lineTo(ox + minX * cellPx, margin + rows * cellPx);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(margin, oy + minY * cellPx);
  ctx.lineTo(margin + cols * cellPx, oy + minY * cellPx);
  ctx.stroke();
  ctx.setLineDash([]);

  // Place tiles
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    const color = hcColor(tt.heightClass);
    const px = ox + p.gx * cellPx;
    const py = oy + p.gy * cellPx;
    const w = eff.w * cellPx;
    const h = eff.h * cellPx;

    ctx.fillStyle = color + 'cc';
    ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);

    // Abbreviated label
    if (showLabels && w >= 20 && h >= 14) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(abbrev(tt.name), px + w / 2, py + h / 2);
    }
  }

  // Coordinate labels
  if (showCoords) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (let x = minX; x < maxX; x++) {
      ctx.textAlign = 'center';
      ctx.fillText(colLabel(x - minX), ox + x * cellPx + cellPx / 2, margin / 2);
    }
    for (let y = minY; y < maxY; y++) {
      ctx.textAlign = 'right';
      ctx.fillText(String(y - minY + 1), margin - 4, oy + y * cellPx + cellPx / 2);
    }
  }

  // Scale bar footer
  const scaleBarY = margin + rows * cellPx + 8;
  const inchCells = Math.max(1, Math.round(4 * (cellPx / 48)));
  const barW = inchCells * cellPx;
  const barX = margin;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(barX, scaleBarY + 4, barW, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(barX, scaleBarY + 4, barW / 2, 8);

  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barX, scaleBarY + 2); ctx.lineTo(barX, scaleBarY + 14);
  ctx.moveTo(barX + barW, scaleBarY + 2); ctx.lineTo(barX + barW, scaleBarY + 14);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const mmVal = (inchCells * CELL_MM).toFixed(0);
  const inVal = (inchCells * CELL_MM / 25.4).toFixed(1);
  ctx.fillText(`${inVal} in · ${mmVal} mm`, barX + barW + 8, scaleBarY + 4);
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
  _packNames: Map<string, string>,
  mapName: string,
  opts: SchematicOptions = {},
): void {
  const cellPx = opts.cellPx ?? CELL_PX;
  const showCoords = opts.showCoords ?? true;
  const showGrid = opts.showGrid ?? (opts.showLegend ?? true);
  const showLabels = opts.showLabels ?? true;

  const ttMap = new Map(tileTypes.map(t => [t.id, t]));
  if (placements.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    minX = Math.min(minX, p.gx); minY = Math.min(minY, p.gy);
    maxX = Math.max(maxX, p.gx + eff.w); maxY = Math.max(maxY, p.gy + eff.h);
  }

  const cols = maxX - minX; const rows = maxY - minY;
  const margin = showCoords ? MARGIN_PX : 8;
  const SCALE_H = 28;
  const W = margin + cols * cellPx + 8;
  const H = margin + rows * cellPx + SCALE_H + 8;
  const ox = margin - minX * cellPx;
  const oy = margin - minY * cellPx;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#1a1a2e;font-family:monospace">`);

  if (showGrid) {
    for (let x = minX; x <= maxX; x++) {
      const bold = (x - minX) % 5 === 0;
      lines.push(`<line x1="${ox + x * cellPx}" y1="${margin}" x2="${ox + x * cellPx}" y2="${margin + rows * cellPx}" stroke="white" stroke-opacity="${bold ? 0.18 : 0.08}" stroke-width="${bold ? 1 : 0.5}"/>`);
    }
    for (let y = minY; y <= maxY; y++) {
      const bold = (y - minY) % 5 === 0;
      lines.push(`<line x1="${margin}" y1="${oy + y * cellPx}" x2="${margin + cols * cellPx}" y2="${oy + y * cellPx}" stroke="white" stroke-opacity="${bold ? 0.18 : 0.08}" stroke-width="${bold ? 1 : 0.5}"/>`);
    }
  }

  for (const p of placements) {
    const tt = ttMap.get(p.tileTypeId);
    if (!tt) continue;
    const eff = rotateFootprint(tt.footprint, p.rot);
    const color = hcColor(tt.heightClass);
    const px = ox + p.gx * cellPx; const py = oy + p.gy * cellPx;
    const w = eff.w * cellPx; const h = eff.h * cellPx;
    lines.push(`<rect x="${px + 1}" y="${py + 1}" width="${w - 2}" height="${h - 2}" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>`);
    if (showLabels && w >= 20 && h >= 14) {
      lines.push(`<text x="${px + w / 2}" y="${py + h / 2}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.9)" font-size="10">${escXML(abbrev(tt.name))}</text>`);
    }
  }

  if (showCoords) {
    for (let x = minX; x < maxX; x++) {
      lines.push(`<text x="${ox + x * cellPx + cellPx / 2}" y="${margin / 2}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11">${colLabel(x - minX)}</text>`);
    }
    for (let y = minY; y < maxY; y++) {
      lines.push(`<text x="${margin - 4}" y="${oy + y * cellPx + cellPx / 2}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11">${y - minY + 1}</text>`);
    }
  }

  // Scale bar
  const scaleBarY = margin + rows * cellPx + 8;
  const inchCells = Math.max(1, Math.round(4 * (cellPx / 48)));
  const barW = inchCells * cellPx;
  const mmVal = (inchCells * CELL_MM).toFixed(0);
  const inVal = (inchCells * CELL_MM / 25.4).toFixed(1);
  lines.push(`<rect x="${margin}" y="${scaleBarY + 4}" width="${barW}" height="8" fill="white" fill-opacity="0.12"/>`);
  lines.push(`<rect x="${margin}" y="${scaleBarY + 4}" width="${barW / 2}" height="8" fill="white" fill-opacity="0.35"/>`);
  lines.push(`<text x="${margin + barW + 8}" y="${scaleBarY + 12}" fill="rgba(255,255,255,0.45)" font-size="9">${inVal} in · ${mmVal} mm</text>`);

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
