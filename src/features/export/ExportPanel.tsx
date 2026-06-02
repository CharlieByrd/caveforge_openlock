import { useState, useRef, useMemo } from 'react';
import { Printer, Share2, Download, Info, CircleCheck } from 'lucide-react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { loadSTLBlob } from '../../lib/db/blobs';
import { buildExportItems } from '../../lib/export/printExport';
import { exportMapZip, downloadBlob } from '../../lib/export/mapShare';
import type { ExportRequest, ExportMessage } from '../../workers/exportWorker';

type ExportMode = 'print' | 'share';

interface PrintState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  finished: boolean;
  error: string | null;
}

export function ExportPanel() {
  const { map } = useMapStore();
  const { tileTypes, packs } = useLibraryStore();

  const [mode, setMode] = useState<ExportMode>('print');
  const [considerInventory, setConsiderInventory] = useState(true);
  const [excludeProps, setExcludeProps] = useState(false);
  const [splitByPack, setSplitByPack] = useState(false);
  const [splitN, setSplitN] = useState(1);
  const [printState, setPrintState] = useState<PrintState>({ running: false, done: 0, total: 0, label: '', finished: false, error: null });
  const [sharing, setSharing] = useState(false);
  const [shareFinished, setShareFinished] = useState(false);
  const [shareError, setShareError] = useState('');
  const workerRef = useRef<Worker | null>(null);

  const ttMap = useMemo(() => new Map(tileTypes.map(t => [t.id, t])), [tileTypes]);

  const activePlacements = useMemo(
    () => excludeProps ? map.placements.filter(p => !ttMap.get(p.tileTypeId)?.isProp) : map.placements,
    [map.placements, ttMap, excludeProps],
  );

  const empty = activePlacements.length === 0;

  // Compute BOM totals for summary line
  const toPrintCount = tileTypes.reduce((s, tt) => {
    const req = activePlacements.filter(p => p.tileTypeId === tt.id).length;
    return s + (considerInventory ? Math.max(0, req - tt.inStock) : req);
  }, 0);
  const typeCount = new Set(activePlacements.map(p => p.tileTypeId)).size;
  const fileCount = mode === 'share' ? 1 : (splitByPack ? packs.filter(pk => tileTypes.some(tt => tt.packId === pk.id && map.placements.some(p => p.tileTypeId === tt.id))).length * splitN : splitN);

  async function loadBlobs(): Promise<Map<string, ArrayBuffer>> {
    const keys = [...new Set(tileTypes.map(t => t.stlBlobKey))];
    const blobs = new Map<string, ArrayBuffer>();
    for (const key of keys) {
      const raw = await loadSTLBlob(key);
      if (raw) blobs.set(key, raw);
    }
    return blobs;
  }

  async function runPrint() {
    if (printState.running || empty) return;
    setPrintState({ running: true, done: 0, total: 0, label: 'Loading STL files…', finished: false, error: null });

    const blobs = await loadBlobs();
    const items = buildExportItems(activePlacements, tileTypes, blobs, considerInventory);

    if (items.length === 0) {
      setPrintState({ running: false, done: 0, total: 0, label: '', finished: false, error: 'Nothing to export — all tiles covered by inventory.' });
      return;
    }

    const packNames = Object.fromEntries(packs.map(p => [p.id, p.name]));
    const req: ExportRequest = { items, splitN, splitByPack, packNames, mapName: map.name };

    workerRef.current?.terminate();
    const worker = new Worker(new URL('../../workers/exportWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<ExportMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setPrintState(s => ({ ...s, done: msg.done, total: msg.total, label: msg.label }));
      } else if (msg.type === 'done') {
        for (const file of msg.files) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([file.data], { type: 'application/zip' }));
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(a.href);
        }
        setPrintState({ running: false, done: msg.files.length, total: msg.files.length, label: '', finished: true, error: null });
        worker.terminate();
      } else if (msg.type === 'error') {
        setPrintState({ running: false, done: 0, total: 0, label: '', finished: false, error: msg.message });
        worker.terminate();
      }
    };

    worker.postMessage(req);
  }

  async function runShare() {
    if (sharing || empty) return;
    setSharing(true);
    setShareFinished(false);
    setShareError('');
    try {
      const blob = await exportMapZip({ ...map, placements: activePlacements }, tileTypes, packs);
      const safeName = map.name.replace(/\s+/g, '_').toLowerCase();
      downloadBlob(blob, `caveforge_${safeName}.zip`);
      setShareFinished(true);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  }

  function switchMode(m: ExportMode) {
    setMode(m);
    setPrintState({ running: false, done: 0, total: 0, label: '', finished: false, error: null });
    setShareFinished(false);
    setShareError('');
  }

  const isRunning = mode === 'print' ? printState.running : sharing;
  const isFinished = mode === 'print' ? printState.finished : shareFinished;
  const runError = mode === 'print' ? printState.error : (shareError || null);

  return (
    <div className="export-panel">
      <div className="export-head">
        <h2 className="export-h">Export</h2>
        <p className="export-h-sub">Save your map for printing, or share it as a self-contained pack.</p>
      </div>

      {/* mode chooser */}
      <div className="export-modes">
        <button className={`export-mode${mode === 'print' ? ' active' : ''}`} onClick={() => switchMode('print')}>
          <Printer size={20} strokeWidth={1.75} />
          <span className="export-mode-name">Print files</span>
          <span className="export-mode-desc">STL files ready to slice &amp; print</span>
        </button>
        <button className={`export-mode${mode === 'share' ? ' active' : ''}`} onClick={() => switchMode('share')}>
          <Share2 size={20} strokeWidth={1.75} />
          <span className="export-mode-name">Share pack</span>
          <span className="export-mode-desc">One ZIP — map + every tile it uses</span>
        </button>
      </div>

      {/* options */}
      {mode === 'print' ? (
        <div className="export-options">
          <label className="export-opt">
            <input type="checkbox" checked={considerInventory} onChange={e => setConsiderInventory(e.target.checked)} />
            <span className="export-opt-text">
              <span className="export-opt-name">Subtract inventory</span>
              <span className="export-opt-hint">Only export tiles you still need to print</span>
            </span>
          </label>
          <label className="export-opt">
            <input type="checkbox" checked={excludeProps} onChange={e => setExcludeProps(e.target.checked)} />
            <span className="export-opt-text">
              <span className="export-opt-name">Exclude props</span>
              <span className="export-opt-hint">Skip decorative props from the export</span>
            </span>
          </label>
          <label className="export-opt">
            <input type="checkbox" checked={splitByPack} onChange={e => setSplitByPack(e.target.checked)} />
            <span className="export-opt-text">
              <span className="export-opt-name">Folder per pack</span>
              <span className="export-opt-hint">Generate a separate ZIP per collection</span>
            </span>
          </label>
          <div className="export-opt export-opt--slider">
            <span className="export-opt-text">
              <span className="export-opt-name">Split across printers</span>
              <span className="export-opt-hint">Spread copies over multiple ZIP jobs</span>
            </span>
            <div className="split-row">
              <input
                type="range" min={1} max={10} value={splitN}
                onChange={e => setSplitN(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#e94560' }}
              />
              <span className="split-label">{splitN} {splitN === 1 ? 'job' : 'jobs'}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="export-options export-share-note">
            <Info size={15} />
            <p>Bundles the current map and a byte-for-byte copy of every tile it places. The recipient opens it in CaveForge via <b>Map → Import pack</b> — no missing files.</p>
          </div>
          <div className="export-options" style={{ paddingTop: 0 }}>
            <label className="export-opt">
              <input type="checkbox" checked={excludeProps} onChange={e => setExcludeProps(e.target.checked)} />
              <span className="export-opt-text">
                <span className="export-opt-name">Exclude props</span>
                <span className="export-opt-hint">Skip decorative props from the export</span>
              </span>
            </label>
          </div>
        </>
      )}

      {/* summary */}
      <div className="export-summary">
        {empty ? (
          <span className="export-summary-empty">Place tiles on the map to enable export.</span>
        ) : mode === 'print' ? (
          <>
            <span><b>{toPrintCount}</b> copies</span>
            <span className="dot">·</span>
            <span><b>{typeCount}</b> tile types</span>
            <span className="dot">·</span>
            <span><b>{fileCount}</b> ZIP{fileCount !== 1 ? 's' : ''}</span>
          </>
        ) : (
          <>
            <span><b>{typeCount}</b> tiles bundled</span>
            <span className="dot">·</span>
            <span>1 shareable ZIP</span>
          </>
        )}
      </div>

      <button
        className="export-btn"
        onClick={mode === 'print' ? runPrint : runShare}
        disabled={isRunning || empty}
      >
        <span className="btn-icon-label">
          {isRunning ? 'Exporting…' : (
            <>
              <Download size={15} />
              {mode === 'share' ? 'Export Map Pack' : (fileCount > 1 ? `Export ${fileCount} ZIPs` : 'Export ZIP')}
            </>
          )}
        </span>
      </button>

      {mode === 'print' && printState.running && (
        <div className="export-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${printState.total ? Math.round((printState.done / printState.total) * 100) : 0}%` }} />
          </div>
          <p className="export-progress-label">{printState.label}</p>
        </div>
      )}

      {isFinished && !isRunning && (
        <div className="export-done-row">
          <CircleCheck size={15} />
          <span>Done — {mode === 'share' ? 'map pack downloaded' : `${fileCount} file${fileCount !== 1 ? 's' : ''} downloaded`}.</span>
        </div>
      )}

      {runError && <p className="export-error">{runError}</p>}
    </div>
  );
}
