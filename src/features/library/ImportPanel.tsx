import { useRef, useState } from 'react';
import { importFiles, groupFilesByPack, type ImportProgress, type PackGroup } from './importLogic';
import { useLibraryStore } from '../../store/library';

type Phase = 'idle' | 'preview' | 'importing' | 'done';

export function ImportPanel() {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [groups, setGroups] = useState<PackGroup[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [done, setDone] = useState<{ imported: number; errors: { file: string; error: string }[] } | null>(null);
  const { load } = useLibraryStore();

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setDone(null);
    const grouped = groupFilesByPack(files);
    if (grouped.length === 0) return;
    setGroups(grouped);
    setPhase('preview');
  }

  function renameGroup(idx: number, newName: string) {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, displayName: newName } : g));
  }

  function mergeGroupInto(fromIdx: number, toIdx: number) {
    setGroups(prev => {
      const next = [...prev];
      const from = next[fromIdx];
      const to = next[toIdx];
      next[toIdx] = { ...to, files: [...to.files, ...from.files] };
      next.splice(fromIdx, 1);
      return next;
    });
  }

  async function confirmImport() {
    setPhase('importing');
    const allFiles = groups.flatMap(g => g.files);
    const overrides = new Map<string, string>(
      groups.map(g => [g.originalName, g.displayName])
    );
    const result = await importFiles(allFiles, setProgress, overrides);
    setDone(result);
    setProgress(null);
    setPhase('done');
    await load();
  }

  function reset() {
    setPhase('idle');
    setGroups([]);
    setProgress(null);
    setDone(null);
    if (folderRef.current) folderRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  }

  return (
    <div className="import-panel">
      <h3>Import STL</h3>

      {phase === 'idle' && (
        <div className="import-buttons">
          <button onClick={() => folderRef.current?.click()}>Import Folder</button>
          <button onClick={() => filesRef.current?.click()}>Import Files</button>
        </div>
      )}

      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error webkitdirectory not in TS typings
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={filesRef}
        type="file"
        accept=".stl"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {phase === 'preview' && (
        <div className="import-preview">
          <div className="import-preview-header">
            <span className="import-preview-title">Pack split — {groups.length} pack{groups.length !== 1 ? 's' : ''}</span>
            <span className="import-preview-total">{groups.reduce((n, g) => n + g.files.length, 0)} files</span>
          </div>
          <div className="import-pack-list">
            {groups.map((g, i) => (
              <div key={i} className="import-pack-row">
                <input
                  className="import-pack-name"
                  value={g.displayName}
                  onChange={e => renameGroup(i, e.target.value)}
                  title="Rename pack"
                />
                <span className="import-pack-count">{g.files.length}f</span>
                {groups.length > 1 && (
                  <select
                    className="import-merge-select"
                    defaultValue=""
                    onChange={e => {
                      const toIdx = parseInt(e.target.value);
                      if (!isNaN(toIdx)) mergeGroupInto(i, toIdx);
                    }}
                    title="Merge into…"
                  >
                    <option value="" disabled>↗ merge</option>
                    {groups.map((other, j) => j !== i && (
                      <option key={j} value={j}>{other.displayName}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          <div className="import-preview-actions">
            <button onClick={confirmImport}>Import</button>
            <button onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'importing' && progress && (
        <div className="import-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <p>{progress.done}/{progress.total} — {progress.current}</p>
        </div>
      )}

      {phase === 'done' && done && (
        <div className="import-result">
          <p>✓ Imported: {done.imported}</p>
          {done.errors.length > 0 && (
            <details>
              <summary>⚠ Errors: {done.errors.length}</summary>
              <ul>
                {done.errors.map((e, i) => (
                  <li key={i}><b>{e.file}</b>: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
          <button style={{ marginTop: 6, fontSize: 11 }} onClick={reset}>Import more</button>
        </div>
      )}
    </div>
  );
}
