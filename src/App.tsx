import { useEffect, useRef, useState } from 'react';
import type { Rotation } from './lib/db/schema';
import { MapPanel } from './features/map/MapPanel';
import { LibraryTree } from './features/library/Tree';
import { RenderBar } from './features/render/RenderBar';
import { GridCanvas } from './features/editor2d/GridCanvas';
import { Scene } from './features/editor3d/Scene';
import { BOMPanel } from './features/bom/BOMPanel';
import { ExportPanel } from './features/export/ExportPanel';
import { SchematicPanel } from './features/schematic/SchematicPanel';
import { AssetsScreen } from './features/assets/AssetsScreen';
import { useLibraryStore } from './store/library';
import { useMapStore } from './store/map';
import './App.css';

type AppTab = 'editor' | 'assets' | 'export' | 'schematic';
type ViewMode = '2d' | '3d' | 'split' | 'bom';

export default function App() {
  const { load: loadLibrary, loading } = useLibraryStore();
  const { load: loadMap, undo, redo, selectedRotation, setSelectedRotation } = useMapStore();
  const [tab, setTab] = useState<AppTab>('editor');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showRender, setShowRender] = useState(false);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  useEffect(() => { loadMap(); }, [loadMap]);

  const rotRef = useRef(selectedRotation);
  useEffect(() => { rotRef.current = selectedRotation; }, [selectedRotation]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.shiftKey ? redo() : undo();
        return;
      }
      if (!inInput && (e.key === 'r' || e.key === 'R')) {
        setSelectedRotation(((rotRef.current + 90) % 360) as Rotation);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setSelectedRotation]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-brand">
          <span className="app-title">OpenLOCK Tile Editor</span>
          <nav className="app-tabs">
            <button className={tab === 'editor'  ? 'active' : ''} onClick={() => setTab('editor')}>Editor</button>
            <button className={tab === 'assets'  ? 'active' : ''} onClick={() => setTab('assets')}>Assets</button>
            <button className={tab === 'export'  ? 'active' : ''} onClick={() => setTab('export')}>Export</button>
            <button className={tab === 'schematic' ? 'active' : ''} onClick={() => setTab('schematic')}>Schematic</button>
          </nav>
        </div>

        {tab === 'editor' && (
          <div className="app-header-toolbar">
            <div className="toolbar-group">
              <button className={viewMode === '2d'    ? 'active' : ''} onClick={() => setViewMode('2d')}>2D</button>
              <button className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>Split</button>
              <button className={viewMode === '3d'    ? 'active' : ''} onClick={() => setViewMode('3d')}>3D</button>
              <button className={viewMode === 'bom'   ? 'active' : ''} onClick={() => setViewMode('bom')}>BOM</button>
            </div>
            <div className="toolbar-separator" />
            <div className="toolbar-group">
              <span className="toolbar-label">R:</span>
              {([0, 90, 180, 270] as const).map(r => (
                <button
                  key={r}
                  className={selectedRotation === r ? 'active' : ''}
                  onClick={() => setSelectedRotation(r)}
                >{r}°</button>
              ))}
            </div>
            <div className="toolbar-separator" />
            <div className="toolbar-group">
              <button onClick={undo} title="Cmd+Z">↩</button>
              <button onClick={redo} title="Cmd+Shift+Z">↪</button>
            </div>
            <div className="toolbar-status">
              <span className="status-idle">Select tile · R to rotate</span>
            </div>
            <div className="toolbar-separator" />
            <button
              className={showRender ? 'active' : ''}
              onClick={() => setShowRender(v => !v)}
              title="Render settings"
            >⚙ Render</button>
          </div>
        )}

        <div className="app-header-maps">
          <MapPanel compact />
        </div>
      </header>

      {showRender && tab === 'editor' && <RenderBar />}

      {/* Editor tab — kept mounted (display:none) to preserve 3D Scene state */}
      <div className="app-body" style={{ display: tab === 'editor' ? 'flex' : 'none' }}>
        <aside className="sidebar">
          <LibraryTree />
        </aside>

        <div className="editor-area">
          <div className={`editor-views editor-views--${viewMode}`}>
            {viewMode === 'bom' && <BOMPanel />}
            {(viewMode === '2d' || viewMode === 'split') && (
              <div className="view-pane view-pane--2d">
                <div className="view-label">2D Grid</div>
                <div className="canvas-scroll">
                  {loading ? <div className="placeholder">Loading…</div> : <GridCanvas />}
                </div>
              </div>
            )}
            {(viewMode === '3d' || viewMode === 'split') && (
              <div className="view-pane view-pane--3d">
                <div className="view-label">3D Preview</div>
                <Scene />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assets tab */}
      <div className="app-body" style={{ display: tab === 'assets' ? 'flex' : 'none' }}>
        <AssetsScreen />
      </div>

      {/* Export tab */}
      <div className="app-body app-body--centered" style={{ display: tab === 'export' ? 'flex' : 'none' }}>
        <ExportPanel />
      </div>

      {/* Schematic tab — conditionally mounted to avoid blocking main thread on app load */}
      {tab === 'schematic' && (
        <div className="app-body" style={{ flexDirection: 'column', overflow: 'hidden' }}>
          <SchematicPanel />
        </div>
      )}
    </div>
  );
}
