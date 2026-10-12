import { useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export function AISharingControl() {
  return <ErrorBoundary fallback={(_error, retry) => <Card><CardBody>
    <section aria-label="Privacy and AI sharing" className="space-y-3">
      <h2 className="text-lg font-bold">Privacy & AI sharing</h2>
      <p role="alert">Privacy controls are unavailable. AI requests require verified permission. Manual tracking remains available.</p>
      <Button onClick={retry}>Retry privacy controls</Button>
    </section>
  </CardBody></Card>}><AISharingChoices /></ErrorBoundary>;
}

function AISharingChoices() {
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(api.privacy.status, isAuthenticated ? {} : "skip");
  const save = useMutation(api.privacy.setAISharing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<{ userId: string; allowed: boolean; version: string; id: string } | null>(null);
  const currentUser = useRef(status?.userId);
  currentUser.current = status?.userId;

  async function choose(allowed: boolean) {
    if (!status?.userId || busy) return;
    const userId = status.userId;
    if (intent.current?.userId !== userId || intent.current?.allowed !== allowed || intent.current?.version !== status.requiredVersion) {
      intent.current = { userId, allowed, version: status.requiredVersion, id: `privacy-${crypto.randomUUID()}` };
    }
    const attempt = intent.current;
    setBusy(true); setError(null);
    try {
      await save({ expectedUserId: status.userId, allowed, version: attempt.version, clientMutationId: attempt.id });
      if (currentUser.current === userId) intent.current = null;
    } catch {
      if (currentUser.current === userId) setError("Could not confirm your choice. Retry the same choice safely.");
    } finally { if (currentUser.current === userId) setBusy(false); }
  }

  if (!isAuthenticated) return null;
  return <Card><CardBody><section className="space-y-4" aria-label="Privacy and AI sharing">
    <h2 className="text-lg font-bold">Privacy & AI sharing</h2>
    {!status ? <p>Loading privacy controls. AI requires verified permission.</p> : <>
      <p className="font-semibold" role="status">AI sharing is {status.allowed ? "on" : "off"}.</p>
      <p>Who receives data: {status.disclosure.recipients}.</p>
      <p>{status.disclosure.data}</p><p>{status.disclosure.purpose}</p>
      <p>{status.disclosure.withdrawal}</p><p>{status.disclosure.retention}</p>
      <p className="font-semibold">{status.disclosure.alternative}</p>
      <div className="flex flex-wrap gap-4">{status.disclosure.links.map(link => <a className="underline" key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>
      {error && <p role="alert">{error}</p>}
      {status.deletionPending ? <p>AI sharing is disabled during account deletion.</p> : <div className="flex flex-wrap gap-3">
        {status.allowed ? <Button disabled={busy} onClick={() => void choose(false)}>Withdraw AI sharing permission</Button>
          : <><Button disabled={busy} onClick={() => void choose(true)}>I agree to this AI data sharing</Button><Button disabled={busy} onClick={() => void choose(false)}>Keep AI sharing off</Button></>}
      </div>}
    </>}
  </section></CardBody></Card>;
}
