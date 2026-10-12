import type { ExportLimit, ExportManifest, ExportPage, ExportScope } from '@/cloud/api';

/** The two server reads an export needs. Injected so the loop can be tested without a backend. */
export type ExportReads = {
  manifest: (scope: ExportScope) => Promise<ExportManifest>;
  page: (args: ExportScope & { section: string; cursor: string | null; limit: ExportLimit }) => Promise<ExportPage>;
};

export type SpaceExport = {
  manifest: ExportManifest;
  sections: Record<string, unknown[]>;
  finishedAt: number;
};

const MAX_PAGES = 20_000;

/**
 * Reads every section of one space, page by page. A page the server could not fit is
 * retried from the same cursor with the smaller limit it asks for, never skipped,
 * so the file is complete or the export fails.
 */
export async function exportSpace(reads: ExportReads, scope: ExportScope, onProgress?: (section: string, rows: number) => void): Promise<SpaceExport> {
  const manifest = await reads.manifest(scope);
  const sections: Record<string, unknown[]> = {};
  let pages = 0;
  for (const section of manifest.sections) {
    const rows: unknown[] = [];
    let cursor: string | null = null;
    let limit: ExportLimit = 32;
    for (;;) {
      if (++pages > MAX_PAGES) throw new Error('This space is too large to export here.');
      const page = await reads.page({ ...scope, section, cursor, limit });
      if (page.retryLimit !== null) { limit = page.retryLimit; continue; }
      rows.push(...(JSON.parse(page.rowsJSON) as unknown[]));
      onProgress?.(section, rows.length);
      if (page.isDone || page.continueCursor === null) break;
      cursor = page.continueCursor;
      limit = 32;
    }
    sections[section] = rows;
  }
  return { manifest, sections, finishedAt: Date.now() };
}

/** "numa-personal-2026-10-12.json": the space name, made safe for any file system. */
export function exportFileName(spaceName: string, at: number): string {
  const slug = spaceName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'space';
  return `numa-${slug}-${new Date(at).toISOString().slice(0, 10)}.json`;
}
