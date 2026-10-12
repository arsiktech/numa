import type { ExportManifest, ExportPage } from '@/cloud/api';
import { exportFileName, exportSpace, type ExportReads } from './exportSpace';

const manifest: ExportManifest = { format: 'numa-space-export-v1', name: 'Personal', currency: 'EUR', startedAt: 1, sections: ['portfolio', 'transactions'], consistency: '', interpretation: '', exclusions: [] };
const scope = { expectedUserId: 'u1', portfolioId: 'p1', requestId: 'r1' };
const page = (rows: unknown[], next: string | null, retryLimit: ExportPage['retryLimit'] = null): ExportPage =>
  ({ rowsJSON: JSON.stringify(rows), rowCount: rows.length, isDone: next === null, continueCursor: next, sampledAt: 1, retryLimit });

describe('exportSpace', () => {
  it('follows cursors to the end of every section', async () => {
    const calls: string[] = [];
    const reads: ExportReads = {
      manifest: async () => manifest,
      page: async ({ section, cursor }) => {
        calls.push(`${section}:${cursor}`);
        if (section === 'portfolio') return page([{ name: 'Personal' }], null);
        return cursor === null ? page([{ id: 't1' }, { id: 't2' }], 'c1') : page([{ id: 't3' }], null);
      },
    };
    const out = await exportSpace(reads, scope);
    expect(calls).toEqual(['portfolio:null', 'transactions:null', 'transactions:c1']);
    expect(out.sections.transactions).toEqual([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);
    expect(out.manifest.name).toBe('Personal');
  });

  it('retries a page that did not fit from the same cursor with the smaller limit', async () => {
    const calls: string[] = [];
    const reads: ExportReads = {
      manifest: async () => ({ ...manifest, sections: ['transactions'] }),
      page: async ({ cursor, limit }) => {
        calls.push(`${cursor}:${limit}`);
        if (cursor === 'c1' && limit === 32) return page([], 'c1', 8);
        return cursor === null ? page([{ id: 'a' }], 'c1') : page([{ id: 'b' }], null);
      },
    };
    const out = await exportSpace(reads, scope);
    expect(calls).toEqual(['null:32', 'c1:32', 'c1:8']);
    expect(out.sections.transactions).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('fails instead of producing a partial file', async () => {
    const reads: ExportReads = { manifest: async () => manifest, page: async () => { throw new Error('A record exceeds the safe export limit.'); } };
    await expect(exportSpace(reads, scope)).rejects.toThrow('safe export limit');
  });
});

describe('exportFileName', () => {
  it('uses a safe slug and the day', () => {
    expect(exportFileName('Studio Ltd. (EU)', Date.UTC(2026, 9, 12))).toBe('numa-studio-ltd-eu-2026-10-12.json');
    expect(exportFileName('★', Date.UTC(2026, 9, 12))).toBe('numa-space-2026-10-12.json');
  });
});
