import { useConvex, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { cloud } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { exportFileName, exportSpace } from './exportSpace';
import { saveTextFile } from './saveFile';

export type ExportState = { kind: 'idle' } | { kind: 'running'; section: string } | { kind: 'done'; file: string } | { kind: 'failed'; message: string };

/** Downloads a complete copy of the current space as one JSON file. */
export function useExport() {
  const convex = useConvex();
  const me = useQuery(cloud.me, {});
  const data = useCloudData();
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const ready = data.status === 'ready' && !!me;

  const run = useCallback(async () => {
    if (data.status !== 'ready' || !me) return;
    const scope = { expectedUserId: me.id, portfolioId: data.portfolioId, requestId: `numa-export-${Date.now().toString(36)}` };
    setState({ kind: 'running', section: 'portfolio' });
    try {
      const out = await exportSpace(
        { manifest: (s) => convex.query(cloud.exportManifest, s), page: (a) => convex.query(cloud.exportPage, a) },
        scope,
        (section) => setState({ kind: 'running', section }),
      );
      const file = exportFileName(data.space.name, out.finishedAt);
      await saveTextFile(file, JSON.stringify(out, null, 2));
      setState({ kind: 'done', file });
    } catch (e) {
      const message = e instanceof Error && /too large|safe export limit|account changed|no longer exists|Sharing/.test(e.message) ? e.message : 'Couldn’t finish the copy. Nothing partial was saved. Try again.';
      setState({ kind: 'failed', message });
    }
  }, [convex, data, me]);

  return { state, run, ready };
}
