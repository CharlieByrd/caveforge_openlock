import { useMemo, useState } from 'react';
import { useMapStore } from '../../store/map';
import { useLibraryStore } from '../../store/library';
import { computeBOM, exportBOMCSV, exportBOMJSON } from '../../lib/bom/compute';

export function BOMPanel() {
  const { map } = useMapStore();
  const { tileTypes, packs, updateTileType } = useLibraryStore();
  const [considerInventory, setConsiderInventory] = useState(true);

  const packNames = useMemo(() => new Map(packs.map(p => [p.id, p.name])), [packs]);

  const bom = useMemo(
    () => computeBOM(map.placements, tileTypes, packNames),
    [map.placements, tileTypes, packNames],
  );

  function downloadText(content: string, filename: string, mime: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const mapSlug = map.name.replace(/\s+/g, '_').toLowerCase();

  return (
    <div className="bom-panel">
      <div className="bom-header">
        <div className="bom-summary">
          <span><b>{bom.rows.length}</b> types</span>
          <span><b>{bom.totalRequired}</b> total</span>
          <span><b>{bom.clips}</b> clips</span>
          <span><b>{bom.areaCells}</b> cells</span>
          {considerInventory && <span className="bom-to-print"><b>{bom.totalToPrint}</b> to print</span>}
        </div>
        <div className="bom-controls">
          <label className="bom-toggle">
            <input type="checkbox" checked={considerInventory} onChange={e => setConsiderInventory(e.target.checked)} />
            Use inventory
          </label>
          <button onClick={() => downloadText(exportBOMCSV(bom.rows), `${mapSlug}_bom.csv`, 'text/csv')}>CSV</button>
          <button onClick={() => downloadText(exportBOMJSON(bom), `${mapSlug}_bom.json`, 'application/json')}>JSON</button>
        </div>
      </div>

      {bom.rows.length === 0 ? (
        <p className="bom-empty">No tiles placed yet.</p>
      ) : (
        <div className="bom-table-wrap">
          <table className="bom-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th>Category</th>
                <th>Name</th>
                <th>FP</th>
                <th>Class</th>
                <th>Req</th>
                <th>Stock</th>
                {considerInventory && <th className="col-print">Print</th>}
              </tr>
            </thead>
            <tbody>
              {bom.rows.map(row => (
                <tr key={row.tileTypeId} className={considerInventory && row.toPrint === 0 ? 'row-done' : ''}>
                  <td className="td-pack">{row.packName}</td>
                  <td className="td-cat">{row.category}</td>
                  <td className="td-name">{row.name}</td>
                  <td className="td-fp">{row.footprint.w}×{row.footprint.h}</td>
                  <td className="td-class">{row.heightClass}</td>
                  <td className="td-num">{row.required}</td>
                  <td className="td-num">
                    <input
                      className="stock-input"
                      type="number"
                      min={0}
                      value={row.inStock}
                      onChange={e => updateTileType(row.tileTypeId, { inStock: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                  </td>
                  {considerInventory && (
                    <td className={`td-num ${row.toPrint > 0 ? 'col-print' : 'col-done'}`}>
                      {row.toPrint > 0 ? row.toPrint : '✓'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bom-totals">
                <td colSpan={5}>Total</td>
                <td className="td-num">{bom.totalRequired}</td>
                <td />
                {considerInventory && <td className="td-num col-print">{bom.totalToPrint}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
