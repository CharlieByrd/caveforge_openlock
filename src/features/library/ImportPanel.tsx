import { useRef, useState } from 'react';
import { UploadCloud, Download, FileUp, FolderUp, ShieldCheck, LoaderCircle, Check, X } from 'lucide-react';
import { importFromPlan, guessCategory, type ImportProgress } from './importLogic';
import { useLibraryStore } from '../../store/library';

type Phase = 'idle' | 'dragging' | 'dest' | 'importing' | 'done';
type DestMode = 'existing' | 'new';

export function ImportPanel({ onCancel }: { onCancel?: () => void }) {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [destMode, setDestMode] = useState<DestMode>('existing');
  const [destPackId, setDestPackId] = useState('');
  const [newPackName, setNewPackName] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [done, setDone] = useState<{ imported: number; packName: string; errors: { file: string; error: string }[] } | null>(null);
  const [importAsProps, setImportAsProps] = useState(false);

  const { packs, load } = useLibraryStore();

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const stl = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.stl'));
    if (stl.length === 0) return;
    setPendingFiles(stl);
    if (!destPackId && packs.length > 0) setDestPackId(packs[0].id);
    setPhase('dest');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setPhase('idle');
    handleFiles(e.dataTransfer.files);
  }

  async function startImport() {
    const chosenPackName = destMode === 'existing'
      ? (packs.find(p => p.id === destPackId)?.name ?? 'Unsorted')
      : newPackName.trim() || 'Unsorted';

    setPhase('importing');
    setProgress(null);

    const items = pendingFiles.map(file => ({
      file,
      packName: chosenPackName,
      category: importAsProps ? 'props' : guessCategory((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name),
      name: file.name.replace(/\.stl$/i, ''),
      isProp: importAsProps,
    }));

    const result = await importFromPlan(items, (p) => setProgress({ ...p }));
    setDone({ ...result, packName: chosenPackName });
    setProgress(null);
    setPhase('done');
    await load();
  }

  function reset() {
    setPhase('idle');
    setPendingFiles([]);
    setProgress(null);
    setDone(null);
    setNewPackName('');
    setImportAsProps(false);
    if (folderRef.current) folderRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  }

  function cancelAndExit() {
    reset();
    onCancel?.();
  }

  const destOk = destMode === 'existing' ? !!destPackId : newPackName.trim().length > 0;

  return (
    <div className="import-stage">
      <input
        ref={filesRef}
        type="file"
        accept=".stl"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error webkitdirectory not in TS typings
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {(phase === 'idle' || phase === 'dragging') && (
        <div
          className={`import-dropzone${phase === 'dragging' ? ' drag' : ''}`}
          onClick={() => filesRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setPhase('dragging'); }}
          onDragLeave={() => setPhase('idle')}
          onDrop={onDrop}
        >
          <div className="import-badge">
            {phase === 'dragging'
              ? <Download size={30} strokeWidth={1.75} />
              : <UploadCloud size={30} strokeWidth={1.75} />
            }
          </div>
          <h2 className="import-title">{phase === 'dragging' ? 'Drop to import' : 'Drag & drop STL files'}</h2>
          <p className="import-sub">Drop tiles anywhere in this panel, or browse below. Folders are scanned recursively.</p>
          <div className="import-actions" onClick={e => e.stopPropagation()}>
            <button className="active" onClick={() => filesRef.current?.click()}>
              <span className="btn-icon-label"><FileUp size={14} />Browse Files</span>
            </button>
            <button onClick={() => folderRef.current?.click()}>
              <span className="btn-icon-label"><FolderUp size={14} />Browse Folder</span>
            </button>
          </div>
          <div className="import-formats">
            <ShieldCheck size={12} /> .stl only · stored &amp; exported byte-for-byte · works offline
          </div>
          {onCancel && (
            <button
              className="import-cancel-btn"
              onClick={e => { e.stopPropagation(); cancelAndExit(); }}
            >
              <span className="btn-icon-label"><X size={13} />Cancel</span>
            </button>
          )}
        </div>
      )}

      {phase === 'dest' && (
        <div className="import-card">
          <div className="import-badge"><UploadCloud size={26} strokeWidth={1.75} /></div>
          <h2 className="import-title">Import {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}</h2>
          <p className="import-sub">Choose which collection to add these tiles to.</p>

          <div className="import-dest">
            <div className="import-dest-label">Add to collection</div>
            <div className="import-seg">
              <button className={destMode === 'existing' ? 'active' : ''} onClick={() => setDestMode('existing')}>Existing</button>
              <button className={destMode === 'new' ? 'active' : ''} onClick={() => setDestMode('new')}>New collection</button>
            </div>
            {destMode === 'existing' ? (
              packs.length > 0 ? (
                <select
                  className="import-dest-input"
                  value={destPackId}
                  onChange={e => setDestPackId(e.target.value)}
                >
                  {packs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <p className="import-sub" style={{ textAlign: 'left', marginTop: 4 }}>No collections yet — use New collection.</p>
              )
            ) : (
              <input
                className="import-dest-input"
                placeholder="New collection name…"
                value={newPackName}
                autoFocus
                onChange={e => setNewPackName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && destOk) startImport(); }}
              />
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#b0b8c8', marginTop: 12, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={importAsProps}
              onChange={e => setImportAsProps(e.target.checked)}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
            Import as props <span style={{ color: '#6a7a96', fontSize: 11 }}>(overlap freely, no collision check)</span>
          </label>

          <div className="import-actions">
            <button className="active" disabled={!destOk} onClick={startImport}>
              <span className="btn-icon-label">
                <Check size={14} />
                {destMode === 'existing'
                  ? `Add to ${packs.find(p => p.id === destPackId)?.name ?? 'collection'}`
                  : (newPackName.trim() ? `Create "${newPackName.trim()}" & add` : 'Create collection')
                }
              </span>
            </button>
            <button onClick={cancelAndExit}>
              <span className="btn-icon-label"><X size={13} />Cancel</span>
            </button>
          </div>
        </div>
      )}

      {phase === 'importing' && progress && (
        <div className="import-card import-card--busy">
          <div className="import-badge"><LoaderCircle size={26} className="import-spin" /></div>
          <h2 className="import-title">Importing…</h2>
          <p className="import-sub import-current">{progress.current}</p>
          <div className="import-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
            </div>
            <div className="import-progress-meta">
              <span>{progress.done} of {progress.total}</span>
              <span>{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && done && (
        <div className="import-card import-card--done">
          <div className="import-badge import-badge--ok"><Check size={26} strokeWidth={2.5} /></div>
          <h2 className="import-title">Imported {done.imported} tile{done.imported !== 1 ? 's' : ''}</h2>
          <p className="import-sub">Added to <strong>{done.packName}</strong>. Tiles are stored byte-for-byte.</p>
          {done.errors.length > 0 && (
            <details style={{ fontSize: 11, color: '#e67e22', width: '100%', maxWidth: 340, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer' }}>⚠ {done.errors.length} error{done.errors.length !== 1 ? 's' : ''}</summary>
              <ul style={{ marginTop: 4, paddingLeft: 14, color: '#e74c3c' }}>
                {done.errors.map((e, i) => <li key={i}><b>{e.file}</b>: {e.error}</li>)}
              </ul>
            </details>
          )}
          <div className="import-actions">
            <button className="active" onClick={reset}>
              <span className="btn-icon-label"><UploadCloud size={14} />Import more</span>
            </button>
            {onCancel && (
              <button onClick={cancelAndExit}>
                <span className="btn-icon-label"><X size={13} />Close</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
