import { buildFormatA, splitByN } from '../lib/export/printExport';
import type { ExportItem, JobFile } from '../lib/export/printExport';

export interface ExportRequest {
  items: ExportItem[];
  splitN: number;
  splitByPack: boolean;
  packNames: Record<string, string>; // packId → pack name
  mapName: string;
}

export type ExportMessage =
  | { type: 'progress'; done: number; total: number; label: string }
  | { type: 'done'; files: { name: string; data: ArrayBuffer }[] }
  | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<ExportRequest>) => {
  const { items, splitN, splitByPack, packNames, mapName } = e.data;

  function progress(done: number, total: number, label: string) {
    self.postMessage({ type: 'progress', done, total, label } satisfies ExportMessage);
  }

  try {
    const slug = mapName.replace(/\s+/g, '_').toLowerCase();

    // Group by pack first if requested, then split each group by N
    const groups: Array<{ label: string; items: ExportItem[] }> = [];
    if (splitByPack) {
      const byPack = new Map<string, ExportItem[]>();
      for (const item of items) {
        if (!byPack.has(item.packId)) byPack.set(item.packId, []);
        byPack.get(item.packId)!.push(item);
      }
      for (const [packId, packItems] of byPack) {
        const packSlug = (packNames[packId] ?? packId).replace(/\s+/g, '_').toLowerCase();
        const jobs = splitByN(packItems, splitN);
        for (let j = 0; j < jobs.length; j++) {
          const lbl = splitN > 1 ? `${slug}_${packSlug}_job_${j + 1}_of_${splitN}` : `${slug}_${packSlug}`;
          groups.push({ label: lbl, items: jobs[j] });
        }
      }
    } else {
      const jobs = splitByN(items, splitN);
      for (let j = 0; j < jobs.length; j++) {
        const lbl = splitN > 1 ? `${slug}_job_${j + 1}_of_${splitN}` : `${slug}_print`;
        groups.push({ label: lbl, items: jobs[j] });
      }
    }

    const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
    let done = 0;
    const files: JobFile[] = [];

    for (const group of groups) {
      const sub = await buildFormatA(group.items, group.label, (d, _t, l) => progress(done + d, totalItems, l));
      files.push(...sub);
      done += group.items.length;
    }

    const msg: ExportMessage = { type: 'done', files: files.map(f => ({ name: f.name, data: f.data })) };
    self.postMessage(msg, { transfer: files.map(f => f.data) });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies ExportMessage);
  }
};
