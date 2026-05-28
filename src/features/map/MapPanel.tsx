import { useState, useRef } from 'react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { importMapZip } from '../../lib/export/mapShare';

interface Props {
  compact?: boolean;
}

export function MapPanel({ compact }: Props) {
  const { map, allMaps, newMap, switchMap, renameMap, clearMap, deleteMap } = useMapStore();
  const { load: reloadLibrary } = useLibraryStore();
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportMsg('');
    try {
      const result = await importMapZip(file);
      await reloadLibrary();
      await switchMap(result.mapId);
      setImportMsg(`✓ ${result.tilesAdded} added, ${result.tilesSkipped} skipped`);
    } catch (e) {
      setImportMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function startRename() {
    setNameInput(map.name);
    setRenaming(true);
  }

  async function commitRename() {
    if (nameInput.trim()) await renameMap(nameInput.trim());
    setRenaming(false);
  }

  async function commitNew() {
    if (newName.trim()) await newMap(newName.trim());
    setNewName('');
    setCreating(false);
  }

  function handleClear() {
    if (confirm(`Clear all tiles from "${map.name}"?`)) clearMap();
  }

  async function handleDelete(id: string, name: string) {
    if (confirm(`Delete map "${name}"?`)) await deleteMap(id);
  }

  if (compact) {
    return (
      <div className="map-panel map-panel--compact">
        {creating ? (
          <div className="map-compact-new">
            <input
              className="map-name-input"
              placeholder="Map name…"
              value={newName}
              autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNew();
                if (e.key === 'Escape') setCreating(false);
              }}
            />
            <button onClick={commitNew}>✓</button>
            <button onClick={() => setCreating(false)}>✕</button>
          </div>
        ) : renaming ? (
          <div className="map-compact-rename">
            <input
              className="map-name-input"
              value={nameInput}
              autoFocus
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onBlur={commitRename}
            />
          </div>
        ) : (
          <>
            <select
              className="map-select"
              value={map.id}
              onChange={e => switchMap(e.target.value)}
            >
              {allMaps.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button className="map-compact-btn" title="Rename map" onClick={startRename}>✏</button>
            <button className="map-compact-btn" title="New map" onClick={() => setCreating(true)}>+</button>
            <button
              className="map-compact-btn"
              title="Import map pack (.zip)"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >{importing ? '…' : '↑'}</button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
            />
            <button className="map-compact-btn danger-subtle" title="Clear map" onClick={handleClear}>✕</button>
            {allMaps.length > 1 && (
              <button
                className="map-compact-btn danger-subtle"
                title={`Delete "${map.name}"`}
                onClick={() => handleDelete(map.id, map.name)}
              >🗑</button>
            )}
            <span className="map-tile-count" title={importMsg || undefined}>{importMsg || `${map.placements.length}t`}</span>
          </>
        )}
      </div>
    );
  }

  const others = allMaps.filter(m => m.id !== map.id);

  return (
    <div className="map-panel">
      <div className="map-panel-current">
        {renaming ? (
          <input
            className="map-name-input"
            value={nameInput}
            autoFocus
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            onBlur={commitRename}
          />
        ) : (
          <span className="map-name" onClick={startRename} title="Click to rename">{map.name}</span>
        )}
        <span className="map-count">{map.placements.length} tiles</span>
      </div>

      <div className="map-panel-actions">
        <button onClick={() => setCreating(v => !v)} title="New map">+ New</button>
        <button className="danger-subtle" onClick={handleClear} title="Clear all tiles">Clear</button>
      </div>

      {creating && (
        <div className="map-new-row">
          <input
            className="map-name-input"
            placeholder="Map name…"
            value={newName}
            autoFocus
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitNew(); if (e.key === 'Escape') setCreating(false); }}
          />
          <button onClick={commitNew}>Create</button>
        </div>
      )}

      {others.length > 0 && (
        <div className="map-list">
          {others.map(m => (
            <div key={m.id} className="map-list-item">
              <span className="map-list-name" onClick={() => switchMap(m.id)} title="Load map">
                {m.name}
              </span>
              <span className="map-list-meta">{m.placements.length}t</span>
              <button
                className="map-list-delete"
                onClick={() => handleDelete(m.id, m.name)}
                title="Delete map"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
