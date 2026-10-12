import { useEffect, useId, useRef, useState } from "react";
import { Dialog, Field, TextInput, Select } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { searchAssetCatalog, type AssetCatalogItem } from "@/lib/assetCatalog";
import { makeClientMutationId } from "@/services/writeQueue";
import { useDomainActions } from "@/services/domainActions";
import {
  useCurrentPortfolioId,
  usePortfolio
} from "@/services/store";
import type { CurrencyCode, Holding, HoldingKind } from "@/lib/types";
import { Check, Search, ArrowUpRight } from "lucide-react";
import { HOLDING_CURRENCIES, HOLDING_KINDS, validateHoldingDraft, type HoldingDraft } from "@/lib/holdingDraft";
import { formatMoneyDecimal } from "@/lib/money";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided, the dialog edits this holding instead of creating one. */
  holding?: Holding;
}

export function AddHoldingDialog({ open, onClose, holding }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const actions = useDomainActions();

  const formId = useId();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof HoldingDraft, string>>>({});
  const [manual, setManual] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HoldingKind>("stock");
  const [quantity, setQuantity] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetCatalogItem | null>(null);
  const results = searchAssetCatalog(assetQuery);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const draftPortfolioId = useRef(portfolio.id);
  const submitted = useRef<{ input: Omit<Holding, "id">; clientMutationId: string } | null>(null);
  const [locked, setLocked] = useState(false);

  // Sync fields whenever the dialog opens: prefill from the holding being
  // edited, or reset to a blank "new holding" form.
  useEffect(() => {
    if (!open) return;
    draftPortfolioId.current = portfolio.id;
    submitted.current = null;
    setLocked(false);
    setError(null);
    setFieldErrors({});
    setManual(Boolean(holding));
    if (holding) {
      setSymbol(holding.symbol);
      setName(holding.name);
      setKind(holding.kind);
      setQuantity(String(holding.quantity));
      setCostBasis(String(holding.costBasis));
      setCurrency(holding.currency);
    } else {
      setSymbol("");
      setName("");
      setKind("stock");
      setQuantity("");
      setCostBasis("");
      setCurrency("USD");
    }
    setAssetQuery("");
    setSelectedAsset(null);
    // Async holding refreshes must not reset an open form or its retry identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holding?.id]);

  function pickAsset(asset: AssetCatalogItem) {
    setSelectedAsset(asset);
    setManual(false);
    setFieldErrors({});
    setAssetQuery(`${asset.name} (${asset.symbol})`);
    setSymbol(asset.symbol);
    setName(asset.name);
    setKind(asset.kind);
    if (HOLDING_CURRENCIES.some(code => code === asset.currency)) setCurrency(asset.currency);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (draftPortfolioId.current !== portfolio.id) {
      setError("The active portfolio changed. Reopen this form in the original portfolio.");
      return;
    }
    const parsed = validateHoldingDraft({ symbol, name, kind, quantity, costBasis, currency });
    if (!submitted.current) {
      setFieldErrors(parsed.errors);
      if (!parsed.valid) {
        setError("Check the highlighted details before saving.");
        if (parsed.errors.symbol) setManual(true);
        requestAnimationFrame(() => document.getElementById(`${formId}-${Object.keys(parsed.errors)[0]}`)?.focus());
        return;
      }
      submitted.current = {
        input: { portfolioId: portfolio.id, symbol: symbol.trim().toUpperCase(), name: name.trim() || symbol.trim().toUpperCase(),
          kind, quantity: parsed.quantity, costBasis: parsed.costBasis, currency, acquiredAt: holding?.acquiredAt ?? Date.now() },
        clientMutationId: makeClientMutationId(holding ? "holdings.update" : "holdings.add")
      };
    }
    const intent = submitted.current;
    if (intent.input.portfolioId !== portfolio.id) {
      setError("The active portfolio changed. Reopen this form in the original portfolio.");
      return;
    }
    savingRef.current = true;
    setSaving(true); setLocked(true); setError(null);
    try {
      if (holding) {
        const { symbol, name, kind, quantity, costBasis, currency, acquiredAt } = intent.input;
        const patch = { symbol, name, kind, quantity, costBasis, currency, acquiredAt };
        await actions.updateHolding(holding.id, patch, portfolio.id, intent.clientMutationId);
      } else {
        await actions.createHolding(intent.input, { recordPurchase: true, clientMutationId: intent.clientMutationId });
      }
      submitted.current = null;
      setLocked(false);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The holding could not be saved. Retry the same record.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const preview = validateHoldingDraft({ symbol, name, kind, quantity, costBasis, currency });
  function feedback(field: keyof HoldingDraft) {
    return fieldErrors[field] ? <p id={`${formId}-${field}-error`} className="text-sm text-[color:var(--color-negative)]">{fieldErrors[field]}</p> : null;
  }
  function inputA11y(field: keyof HoldingDraft) {
    const labels = { symbol: "Symbol", name: "Name", kind: "Investment type", quantity: "Quantity", costBasis: "Total paid", currency: "Currency paid" };
    return { id: `${formId}-${field}`, "aria-invalid": Boolean(fieldErrors[field]),
      "aria-label": labels[field],
      "aria-describedby": fieldErrors[field] ? `${formId}-${field}-error` : undefined };
  }
  return (
    <Dialog open={open} onClose={onClose} dismissible={!saving}
      title={holding ? "Edit holding" : "Add an investment"}
      description={`In ${portfolio.name} · Track what you own, at your pace.`}
      footer={<div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button form={formId} type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : locked ? "Retry save" : holding ? "Save changes" : "Add holding"}
          {!saving && !locked ? <ArrowUpRight size={16} aria-hidden="true" /> : null}
        </Button>
      </div>}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5" aria-busy={saving}>
        {error ? <div role="alert" className="rounded-2xl bg-[color:var(--color-negative-mist)] p-4 text-sm text-[color:var(--color-ink)]">
          <p className="font-semibold">{error}</p>
          {locked ? <p className="mt-1">Your details are kept for a safe retry. Retrying will not add a second holding.</p> : null}
        </div> : null}
        <fieldset disabled={saving || locked} className="flex min-w-0 flex-col gap-5">
          <legend className="sr-only">Investment details</legend>
          {selectedAsset && !manual ? (
            <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-brand-mist)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--color-paper)] font-semibold" aria-hidden="true">{symbol.slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{name}</p>
                  <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">{symbol} · {kind.toUpperCase()}</p>
                </div>
                <Check size={18} className="shrink-0 mt-1" aria-hidden="true" />
              </div>
              <Button type="button" variant="ghost" className="mt-2 -ml-3" onClick={() => { setSelectedAsset(null); setAssetQuery(""); setSymbol(""); setName(""); }}>Change investment</Button>
            </div>
          ) : !manual ? (
            <div className="space-y-3">
              <Field label="Find your investment">
                <TextInput placeholder="Search Apple, Bitcoin, or a ticker…" value={assetQuery}
                  onChange={event => setAssetQuery(event.target.value)} autoFocus />
              </Field>
              {assetQuery.trim() ? <div className="overflow-hidden rounded-2xl border border-[color:var(--color-line)]">
                {results.length ? <ul aria-label="Matching investments">{results.map(asset => <li key={asset.symbol}>
                  <button type="button" aria-label={`${asset.name} (${asset.symbol}), ${asset.kind.toUpperCase()}, ${asset.currency}`} onClick={() => pickAsset(asset)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[color:var(--color-brand-mist)] focus-visible:outline-2 focus-visible:outline-[color:var(--color-brand)] focus-visible:-outline-offset-2">
                    <span className="min-w-0"><span className="block font-medium">{asset.name}</span><span className="block text-sm text-[color:var(--color-ink-3)]">{asset.symbol} · {asset.kind.toUpperCase()}</span></span>
                    <span className="text-sm">{asset.currency}</span>
                  </button>
                </li>)}</ul> : <p role="status" className="p-4 text-sm">No match yet. Enter the details yourself below.</p>}
              </div> : <div className="flex items-start gap-3 rounded-2xl bg-[color:var(--color-bg)] p-4 text-sm text-[color:var(--color-ink-3)]"><Search size={18} className="shrink-0 mt-0.5" aria-hidden="true" /><p>Start with a name or ticker. Then add the quantity you own and what you paid.</p></div>}
              <Button type="button" variant="ghost" className="-ml-3" onClick={() => { setManual(true); setFieldErrors({}); }}>Enter details myself</Button>
            </div>
          ) : null}
          {manual ? <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Symbol"><TextInput {...inputA11y("symbol")} placeholder="AAPL · BTC · VOO" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />{feedback("symbol")}</Field>
              <Field label="Investment type"><Select value={kind} onChange={e => setKind(e.target.value as HoldingKind)}>{HOLDING_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
            </div>
            <Field label="Name (optional)"><TextInput placeholder="Apple Inc., Bitcoin…" value={name} onChange={e => setName(e.target.value)} /></Field>
          </div> : null}
          {manual || selectedAsset ? <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Quantity" hint="Shares, units or coins you own."><TextInput {...inputA11y("quantity")} inputMode="decimal" placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} />{feedback("quantity")}</Field>
              <Field label="Total paid" hint="For all units, including fees."><TextInput {...inputA11y("costBasis")} inputMode="decimal" placeholder="What you paid in total" value={costBasis} onChange={e => setCostBasis(e.target.value)} />{feedback("costBasis")}</Field>
            </div>
            <Field label="Currency paid"><Select {...inputA11y("currency")} value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}>{HOLDING_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</Select>{feedback("currency")}</Field>
            <div className="rounded-2xl bg-[color:var(--color-bg)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)]">Your record</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{preview.valid ? formatMoneyDecimal(preview.costBasis, currency) : "Ready when you are"}</p>
              <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">{preview.valid ? `${preview.quantity} ${symbol.trim().toUpperCase()} · total purchase cost` : "Enter your quantity and total paid to review the record."}</p>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-3)]">{selectedAsset?.provider === "manual" ? "Automatic prices are not available for this investment. Its current value may remain unavailable." : "Current value uses market prices when available. Your purchase cost is kept separately."}</p>
          </> : null}
        </fieldset>
      </form>
    </Dialog>
  );
}
