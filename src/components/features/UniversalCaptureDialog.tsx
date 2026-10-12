import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ListPlus, Mic, ScanLine } from "lucide-react";
import { Dialog, Field, Select, TextArea, TextInput } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { DialogLoadingFallback } from "@/components/layout/DialogLoadingFallback";
import { useDomainActions } from "@/services/domainActions";
import { usePodActions } from "@/services/podActions";
import { makeClientMutationId } from "@/services/writeQueue";
import { useAssets, useCategories, useCurrentPortfolioId, useCurrentUser, useMoneyPods, usePodMembers, usePortfolio } from "@/services/store";
import { formatMoneyDecimal } from "@/lib/money";
import { localEntryDate, parseEntryAmount, parseEntryBatch, validEntryDate } from "@/lib/transactionEntry";
import { occurredAtFromIsoDate } from "@/lib/occurredAt";
import { useAppMode } from "@/lib/appMode";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/types";

type EntryMode = "text" | "voice" | "receipt" | "manual";
const ScanDialog = lazy(() => import("./ScanDialog").then(module => ({ default: module.ScanDialog })));
const VoiceDialog = lazy(() => import("./VoiceDialog").then(module => ({ default: module.VoiceDialog })));
type PersonalInput = Parameters<ReturnType<typeof useDomainActions>["createTransaction"]>[0];
type PodInput = Parameters<ReturnType<typeof usePodActions>["addPodExpense"]>[0];
type ReviewSummary = { entries: { description: string; amount: number }[]; currency: CurrencyCode; date: string; kind: "expense" | "income"; destination: string; shared: string | null };
type SaveEntry = { target: "personal"; input: PersonalInput; receipt: string } | { target: "pod"; input: PodInput; receipt: string };

// Each opening mounts a new draft. Compatibility commands remain stable;
// ordinary "text" and "manual" commands both open this amount-first form.
export function UniversalCaptureDialog({ open, initialMode = "manual", onClose }: {
  open: boolean; initialMode?: EntryMode; onClose: () => void;
}) {
  return open ? <TransactionEntry initialMode={initialMode} onClose={onClose} /> : null;
}

function TransactionEntry({ initialMode, onClose }: { initialMode: EntryMode; onClose: () => void }) {
  const [currentPortfolioId] = useCurrentPortfolioId();
  const [draftPortfolioId] = useState(currentPortfolioId);
  const portfolio = usePortfolio(draftPortfolioId);
  const me = useCurrentUser();
  const [draftUserId] = useState(me.id);
  const categories = useCategories(draftPortfolioId);
  const assets = useAssets(draftPortfolioId);
  const pods = useMoneyPods();
  const [appMode] = useAppMode();
  const domain = useDomainActions();
  const podActions = usePodActions();
  const [destination, setDestination] = useState(appMode === "shared" && pods[0] ? pods[0].id : "personal");
  const pod = pods.find(item => item.id === destination);
  const members = usePodMembers(pod?.id ?? "");
  const myMemberId = members.find(member => member.linkedUserId === me.id || (member.email && me.email && member.email.toLowerCase() === me.email.toLowerCase()))?.id ?? "";
  const [payerId, setPayerId] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [personalCurrency, setCurrency] = useState<CurrencyCode>(portfolio.defaultCurrency);
  const currency = pod?.currency ?? personalCurrency;
  const [date, setDate] = useState(localEntryDate);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [batch, setBatch] = useState(false);
  const [text, setText] = useState("");
  const [review, setReview] = useState(false);
  const [auxiliary, setAuxiliary] = useState<"voice" | "receipt" | null>(AI_ENABLED && (initialMode === "voice" || initialMode === "receipt") ? initialMode : null);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [queued, setQueued] = useState(false);
  const [frozenReview, setFrozenReview] = useState<ReviewSummary | null>(null);
  const [progress, setProgress] = useState({ completed: 0, queued: 0 });
  const [error, setError] = useState<string | null>(null);
  // Freeze payloads and receipts on the first save. A partial batch retries only
  // unfinished entries with their original identity, date, payer and target.
  const submission = useRef<{ entries: SaveEntry[]; cursor: number; queued: number } | null>(null);
  const savingRef = useRef(false);
  const formId = useId();
  // Focus after Dialog records its trigger for restoration. React
  // runs earlier and would make Escape restore the now-removed amount input.
  useEffect(() => {
    if (auxiliary || review || locked) return;
    const frame = requestAnimationFrame(() => document.getElementById(`${formId}-${batch ? "batch" : "amount"}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [auxiliary, review, locked, batch, formId]);
  const parsed = parseEntryBatch(text);
  const numericAmount = parseEntryAmount(amount);
  const contextChanged = currentPortfolioId !== draftPortfolioId || me.id !== draftUserId;
  const targetValid = destination === "personal" || Boolean(pod && members.length && members.some(member => member.id === (payerId || myMemberId)));
  const valid = (batch ? parsed.valid : numericAmount !== null && description.trim().length > 0)
    && validEntryDate(date) && targetValid && ["EUR", "USD"].includes(currency);
  const isPod = destination !== "personal";
  const entryKind = isPod ? "expense" : kind;
  const kindName = entryKind === "income" ? "income" : "expense";
  const count = batch ? parsed.entries.length : 1;
  const saveLabel = batch ? `Save ${count} ${kindName === "expense" ? (count === 1 ? "expense" : "expenses") : (count === 1 ? "income entry" : "income entries")}` : `Save ${kindName}`;
  const destinationName = isPod ? pod?.name ?? "Unavailable shared pod" : portfolio.name;
  const reviewSummary = frozenReview ?? {
    entries: parsed.entries, currency, date, kind: entryKind, destination: destinationName,
    shared: isPod ? `Paid by ${members.find(member => member.id === (payerId || myMemberId))?.displayName ?? "—"}. Split equally between ${members.map(member => member.displayName).join(", ")}.` : null
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current || queued) return;
    if (contextChanged) { setError("Your account or space changed. Close this form and reopen it in the original space."); return; }
    if (!submission.current) {
      if (!valid) return;
      if (batch && !review) { setReview(true); return; }
      const lines = batch ? parsed.entries : [{ description: description.trim(), amount: numericAmount! }];
      const occurredAt = occurredAtFromIsoDate(date);
      const entries: SaveEntry[] = lines.map(line => {
        const receipt = makeClientMutationId(isPod ? "moneyPods.addExpense" : "transactions.add");
        return pod ? { target: "pod", receipt, input: { ...line, podId: pod.id, paidByMemberId: payerId || myMemberId, currency, occurredAt, splitMode: "equal_people", participantMemberIds: members.map(member => member.id), clientMutationId: receipt } }
          : { target: "personal", receipt, input: { ...line, portfolioId: draftPortfolioId, currency, occurredAt, kind, categoryId: categoryId || undefined, accountId: accountId || undefined, createdByUserId: draftUserId } };
      });
      submission.current = { entries, cursor: 0, queued: 0 };
      setFrozenReview({ ...reviewSummary, entries: lines });
    }
    const intent = submission.current;
    savingRef.current = true; setSaving(true); setLocked(true); setError(null);
    try {
      while (intent.cursor < intent.entries.length) {
        const entry = intent.entries[intent.cursor]!;
        const result = entry.target === "pod"
          ? await podActions.addPodExpense(entry.input)
          : await domain.createTransaction(entry.input, { clientMutationId: entry.receipt });
        if ("queued" in result && result.queued === true) intent.queued += 1;
        intent.cursor += 1;
        setProgress({ completed: intent.cursor, queued: intent.queued });
      }
      if (intent.queued) setQueued(true);
      else onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save. Try again.");
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }

  return <>
    <Dialog open={!auxiliary} onClose={onClose} dismissible={!saving} width={520}
      title={<span className="text-2xl font-semibold tracking-tight">{queued ? "Waiting to sync" : review ? "Review entries" : "Add transaction"}</span>}
      description={`In ${reviewSummary.destination}`}
      footer={queued ? <Button variant="primary" className="w-full" onClick={onClose}>Done</Button> : <div className="flex items-center gap-3">
        {review && !locked ? <Button variant="ghost" onClick={() => setReview(false)}>Back</Button> : null}
        <Button variant="primary" className="flex-1 min-h-12 whitespace-normal disabled:!opacity-50" type="submit" form={formId} disabled={saving || contextChanged || (!locked && !valid)}>
          {saving ? "Saving…" : locked ? "Retry save" : batch && !review ? "Review entries" : saveLabel}
        </Button>
      </div>}
    >
      {queued ? <div role="status" className="space-y-3 py-4"><Check className="text-[color:var(--color-positive)]" aria-hidden="true" /><p>{progress.completed - progress.queued} saved · {progress.queued} queued on this device.</p><p className="text-sm text-[color:var(--color-ink-2)]">Queued entries are not confirmed in the cloud yet. Numa will retry when connected. You don’t need to add them again.</p></div> :
        <form id={formId} onSubmit={submit} noValidate aria-busy={saving} className="space-y-5">
          {contextChanged ? <p role="alert" className="text-sm text-[color:var(--color-negative)]">Your account or space changed. Close and reopen this form to continue.</p> : null}
          {error ? <div role="alert" className="rounded-2xl bg-[color:var(--color-negative-mist)] p-3 text-sm"><p>{error}</p>{locked ? <p className="mt-2">Your entries are kept for a safe retry. Completed entries won’t be added again.</p> : null}</div> : null}
          <fieldset disabled={locked || saving || contextChanged} className="min-w-0 space-y-5">
            <legend className="sr-only">Transaction details</legend>
            {review || locked ? <>
              <p className="text-sm text-[color:var(--color-ink-2)]">{reviewSummary.entries.length} {reviewSummary.kind === "expense" ? "expense entries" : "income entries"} · {reviewSummary.date} · {reviewSummary.currency}</p>
              <ul aria-label="Entries to save" className="divide-y divide-[color:var(--color-line)] rounded-2xl border border-[color:var(--color-line)] px-4">
                {reviewSummary.entries.map((entry, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="min-w-0 break-words">{entry.description}</span><strong className="tabular-nums">{formatMoneyDecimal(entry.amount, reviewSummary.currency)}</strong></li>)}
              </ul>
              {reviewSummary.shared ? <p className="text-sm">{reviewSummary.shared}</p> : null}
              <p role="status" className="text-sm text-[color:var(--color-ink-2)]">{locked
                ? `${progress.completed - progress.queued} saved · ${progress.queued} queued · ${reviewSummary.entries.length - progress.completed} remaining. Retry continues the same entries.`
                : "Nothing is saved until you confirm below."}</p>
            </> : <>
              {!isPod ? <div role="group" aria-label="Transaction type" className="grid grid-cols-2 gap-1 rounded-2xl bg-[color:var(--color-bg)] p-1">
                {(["expense", "income"] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setCategoryId(""); }} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", kind === value ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] shadow-sm" : "text-[color:var(--color-ink-2)]")}>
                  {value === "expense" ? <ArrowUpRight size={16} aria-hidden="true" /> : <ArrowDownLeft size={16} aria-hidden="true" />}{value === "expense" ? "Expense" : "Income"}
                </button>)}
              </div> : null}
              {batch ? <Field label="Entries" hint="One entry per line: description, then amount. All entries use the date and currency below.">
                <TextArea id={`${formId}-batch`} aria-label="Entries" value={text} onChange={event => setText(event.target.value)} placeholder={"Coffee 5.50\nGroceries 80"} rows={5} />
              </Field> : <>
                <div className="rounded-2xl bg-[color:var(--color-bg)] px-4 py-4">
                  <label htmlFor={`${formId}-amount`} className="text-sm text-[color:var(--color-ink-2)]">Amount</label>
                  <div className="mt-2 flex items-center gap-3">
                    <input id={`${formId}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" aria-invalid={Boolean(amount && numericAmount === null)} aria-describedby={amount && numericAmount === null ? `${formId}-amount-error` : undefined} className="w-full min-w-0 rounded-lg bg-transparent py-1 text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-tight tracking-tight text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus-visible:outline-2 focus-visible:outline-[color:var(--color-ink)]" />
                    {isPod ? <span className="text-sm font-semibold">{currency}</span> : <Select aria-label="Currency" value={personalCurrency} onChange={event => { setCurrency(event.target.value as CurrencyCode); setAccountId(""); }}><option>EUR</option><option>USD</option></Select>}
                  </div>
                  {amount && numericAmount === null ? <p id={`${formId}-amount-error`} className="mt-2 text-sm text-[color:var(--color-negative)]">Use a positive amount with up to two decimals, like 12.50 or 12,50. No thousands separators.</p> : null}
                </div>
                <Field label={entryKind === "expense" ? "What was it for?" : "Where did it come from?"}>
                  <TextInput value={description} onChange={event => setDescription(event.target.value)} placeholder={entryKind === "expense" ? "e.g. Coffee with Alex" : "e.g. October salary"} autoComplete="off" />
                </Field>
              </>}
              {batch && text && parsed.errors.length ? <ul role="alert" className="space-y-2 text-sm text-[color:var(--color-negative)]">{parsed.errors.map(message => <li key={message}>{message}</li>)}</ul> : null}
              {pods.length > 0 ? <Field label="Save to"><Select value={destination} onChange={event => { setDestination(event.target.value); setPayerId(""); setCategoryId(""); setAccountId(""); }}><option value="personal">{portfolio.name}</option>{pods.map(item => <option key={item.id} value={item.id}>{item.name} · Shared</option>)}</Select></Field> : null}
              {isPod ? <div className="space-y-2 rounded-2xl bg-[color:var(--color-bg)] p-3">
                <Field label="Paid by"><Select value={payerId || myMemberId} onChange={event => setPayerId(event.target.value)}><option value="">Choose who paid</option>{members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</Select></Field>
                <p className="text-sm text-[color:var(--color-ink-2)]">Split equally between {members.map(member => member.displayName).join(", ") || "the pod’s members"}.</p>
              </div> : null}
              <details className="group rounded-2xl border border-[color:var(--color-line)] px-4 py-3">
                <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium"><span>{date === localEntryDate() ? "Today" : date} · {isPod ? currency : "Date, category & account"}</span><ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" /></summary>
                <div className="mt-4 space-y-4">
                  <Field label="Date"><TextInput type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
                  {!validEntryDate(date) ? <p role="alert" className="text-sm text-[color:var(--color-negative)]">Choose a valid date.</p> : null}
                  {batch && !isPod ? <Field label="Currency"><Select value={personalCurrency} onChange={event => { setCurrency(event.target.value as CurrencyCode); setAccountId(""); }}><option>EUR</option><option>USD</option></Select></Field> : null}
                  {!isPod ? <>
                    <Field label="Category"><Select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Uncategorized</option>{categories.filter(category => category.kind === kind).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
                    <Field label="Account" hint="Optional. Choose a cash account to update its balance."><Select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Don’t link an account</option>{assets.filter(asset => asset.kind === "cash" && asset.currency === currency).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</Select></Field>
                  </> : null}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" className="whitespace-normal text-sm" onClick={() => { setBatch(!batch); setError(null); }}><ListPlus size={16} aria-hidden="true" />{batch ? "Enter one at a time" : "Add several at once"}</Button>
                {AI_ENABLED && !isPod ? <><Button type="button" variant="ghost" onClick={() => setAuxiliary("voice")}><Mic size={16} aria-hidden="true" />Speak</Button><Button type="button" variant="ghost" onClick={() => setAuxiliary("receipt")}><ScanLine size={16} aria-hidden="true" />Scan receipt</Button></> : null}
              </div>
            </>}
          </fieldset>
        </form>}
    </Dialog>
    <Suspense fallback={<DialogLoadingFallback />}>
      {auxiliary === "voice" ? <VoiceDialog open onClose={() => setAuxiliary(null)} /> : null}
      {auxiliary === "receipt" ? <ScanDialog open onClose={() => setAuxiliary(null)} /> : null}
    </Suspense>
  </>;
}
