import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { AddHoldingDialog } from "@/components/features/AddHoldingDialog";
import { LightAddExpenseDialog } from "@/components/features/LightAddExpenseDialog";
import { UniversalCaptureDialog } from "@/components/features/UniversalCaptureDialog";
import { Button } from "@/components/ui/Button";
import { SnapshotButton } from "@/components/features/SnapshotButton";
import { useManualSnapshot } from "@/hooks/useManualSnapshot";
import { calls, controls, finishPendingSave } from "./boundaries";
import "./preview.css";

export function ExperiencePreview() {
  const [open, setOpen] = useState(false);
  const [lightOpen, setLightOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const snapshot = useManualSnapshot("fictional");
  const [theme, setTheme] = useState("light");
  const [callLog, setCallLog] = useState("[]");
  return <MotionConfig reducedMotion="user"><main className="mx-auto max-w-3xl p-6 space-y-6">
    <header><p className="text-sm font-semibold">Local preview · Fictional data · No cloud writes</p><h1 className="mt-4 text-4xl font-semibold">A clearer money picture.</h1><p className="mt-2">Real components, isolated service boundaries.</p></header>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setOpen(true)}>Add an investment</Button>
      <Button onClick={() => setTransactionOpen(true)}>Add transaction</Button>
      <Button onClick={() => setLightOpen(true)}>Add Simple transaction</Button>
      <Button onClick={() => { controls.holdNext = true; }}>Hold next save</Button>
      <Button data-testid="finish-pending" onClick={finishPendingSave}>Finish pending save</Button>
      <Button onClick={() => { controls.includePod = true; }}>Enable shared example</Button>
      <Button onClick={() => { const next = theme === "light" ? "dark" : "light"; setTheme(next); document.documentElement.dataset.theme = next; }}>Switch to {theme === "light" ? "dark" : "light"}</Button>
      <Button onClick={() => { controls.failNext = true; }}>Fail next save</Button>
      <Button onClick={() => { controls.queued = true; }}>Queue saves</Button>
    </div>
    <section className="rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-6 space-y-4">
      <h2 className="text-xl font-semibold">Wealth log</h2>
      <SnapshotButton phase={snapshot.phase} onCapture={() => { void snapshot.capture({ portfolioId: "fictional", takenAt: Date.now(), netWorth: 100, liquid: 100, invested: 0, hardAssets: 0, liabilities: 0, currency: "EUR", isAuto: false }); }} />
      <p role={snapshot.phase === "error" ? "alert" : "status"}>{snapshot.message}</p>
    </section>
    <Button onClick={() => setCallLog(JSON.stringify(calls))}>Inspect local calls</Button><pre data-testid="calls" className="whitespace-pre-wrap break-all text-xs">{callLog}</pre>
    <AddHoldingDialog open={open} onClose={() => setOpen(false)} />
    <LightAddExpenseDialog open={lightOpen} onClose={() => setLightOpen(false)} />
    <UniversalCaptureDialog open={transactionOpen} onClose={() => setTransactionOpen(false)} />
  </main></MotionConfig>;
}
createRoot(document.getElementById("root")!).render(<ExperiencePreview />);
