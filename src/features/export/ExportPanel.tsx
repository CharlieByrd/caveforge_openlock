import { useState, useRef } from 'react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { loadSTLBlob } from '../../lib/db/blobs';
import { buildExportItems } from '../../lib/export/printExport';
import { exportMapZip, downloadBlob } from '../../lib/export/mapShare';
import type { ExportRequest, ExportMessage } from '../../workers/exportWorker';

interface ExportState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  error: string | null;
}

export function ExportPanel() {
  const { map } = useMapStore();
  const { tileTypes, packs } = useLibraryStore();
  const [splitN, setSplitN] = useState(1);
  const [considerInventory, setConsiderInventory] = useState(true);
  const [splitByPack, setSplitByPack] = useState(false);
  const [state, setState] = useState<ExportState>({ running: false, done: 0, total: 0, label: '', error: null });
  const workerRef = useRef<Worker | null>(null);

  async function loadBlobs(): Promise<Map<string, ArrayBuffer>> {
    const keys = [...new Set(tileTypes.map(t => t.stlBlobKey))];
    const blobs = new Map<string, ArrayBuffer>();
    for (const key of keys) {
      const raw = await loadSTLBlob(key);
      if (raw) blobs.set(key, raw);
    }
    return blobs;
  }

  async function run() {
    if (state.running) return;
    setState({ running: true, done: 0, total: 0, label: 'Loading STL blobs…', error: null });

    const blobs = await loadBlobs();
    const items = buildExportItems(map.placements, tileTypes, blobs, considerInventory);

    if (items.length === 0) {
      setState({ running: false, done: 0, total: 0, label: '', error: 'Nothing to export (all items covered by inventory).' });
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
        setState(s => ({ ...s, done: msg.done, total: msg.total, label: msg.label }));
      } else if (msg.type === 'done') {
        setState({ running: false, done: msg.files.length, total: msg.files.length, label: 'Done', error: null });
        for (const file of msg.files) downloadFile(file.name, file.data);
        worker.terminate();
      } else if (msg.type === 'error') {
        setState({ running: false, done: 0, total: 0, label: '', error: msg.message });
        worker.terminate();
      }
    };

    worker.postMessage(req);
  }

  function downloadFile(name: string, data: ArrayBuffer) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  async function shareMap() {
    if (sharing) return;
    setSharing(true);
    setShareMsg('');
    try {
      const blob = await exportMapZip(map, tileTypes, packs);
      const safeName = map.name.replace(/\s+/g, '_').toLowerCase();
      downloadBlob(blob, `caveforge_${safeName}.zip`);
      setShareMsg('✓ Downloaded');
    } catch (e) {
      setShareMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSharing(false);
    }
  }

  const toPrint = tileTypes.reduce((s, tt) => {
    const req = map.placements.filter(p => p.tileTypeId === tt.id).length;
    return s + (considerInventory ? Math.max(0, req - tt.inStock) : req);
  }, 0);

  return (
    <div className="export-panel">
      <div className="export-section">
        <div className="export-section-title">Share Map</div>
        <p className="export-share-hint">Exports current map + all tiles it uses into a single ZIP. Recipient imports it via Map panel → Import.</p>
        <button className="export-btn export-share-btn" onClick={shareMap} disabled={sharing || map.placements.length === 0}>
          {sharing ? 'Packing…' : '↓ Export Map Pack'}
        </button>
        {shareMsg && <p className={shareMsg.startsWith('✓') ? 'export-done' : 'export-error'}>{shareMsg}</p>}
      </div>

      <div className="export-section">
        <div className="export-section-title">Print Export</div>
      </div>

      <div className="export-section">
        <label className="export-toggle">
          <input type="checkbox" checked={considerInventory} onChange={e => setConsiderInventory(e.target.checked)} />
          Subtract inventory
        </label>
        <label className="export-toggle">
          <input type="checkbox" checked={splitByPack} onChange={e => setSplitByPack(e.target.checked)} />
          Split by pack
        </label>
        <span className="export-count">{toPrint} copies to print</span>
      </div>

      <div className="export-section">
        <div className="export-section-title">Split across printers</div>
        <div className="split-row">
          <input
            type="range" min={1} max={10} value={splitN}
            onChange={e => setSplitN(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#e94560' }}
          />
          <span className="split-label">{splitN} {splitN === 1 ? 'job' : 'jobs'}</span>
        </div>
        {splitN > 1 && <p className="split-hint">Downloads {splitN} ZIP files, copies distributed evenly.</p>}
      </div>

      <div className="export-section">
        <button
          className="export-btn"
          onClick={run}
          disabled={state.running}
        >
          {state.running ? 'Exporting…' : '↓ Export ZIP'}
        </button>
      </div>

      {state.running && (
        <div className="export-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${state.total ? (state.done / state.total) * 100 : 0}%` }} />
          </div>
          <p className="export-progress-label">{state.label}</p>
        </div>
      )}

      {state.error && <p className="export-error">{state.error}</p>}
      {!state.running && state.label === 'Done' && <p className="export-done">✓ Downloaded</p>}
    </div>
  );
}
