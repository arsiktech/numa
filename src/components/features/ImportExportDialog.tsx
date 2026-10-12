import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, FileDown, Database } from "lucide-react";
import { Dialog, Field, Select } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  assetsToCsv,
  categoriesToCsv,
  cryptoWalletsToCsv,
  downloadCsv,
  holdingsToCsv,
  liabilitiesToCsv,
  parseAssetsCsv,
  parseCategoriesCsv,
  parseLiabilitiesCsv,
  parseTransactionsCsv,
  podExpensesToCsv,
  podSettlementsToCsv,
  transactionsToCsv
} from "@/lib/csv";
import {
  analyzeTransactionsCsv,
  buildGenericPreset,
  defaultGenericMapping,
  loadCsvPresetMemory,
  mappingFitsHeader,
  normalizeWithPreset,
  saveCsvPresetMemory,
  type CsvPreset,
  type GenericMapping
} from "@/lib/csvPresets";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useCryptoWallets,
  useHoldings,
  useLiabilities,
  useMemberships,
  useMoneyPods,
  usePodExpenses,
  usePodMembers,
  usePodSettlements,
  usePortfolio,
  useTransactions
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useCloudPodData, useCloudPortfolioData, useCloudState } from "@/services/cloudStore";
import { listenForActiveMoneyPodChange, readActiveMoneyPodId } from "@/lib/activeMoneyPod";

interface Props {
  open: boolean;
  onClose: () => void;
}

type DataKind =
  | "transactions"
  | "assets"
  | "liabilities"
  | "categories"
  | "holdings"
  | "cryptoWallets"
  | "podExpenses"
  | "podSettlements";

const KINDS: { value: DataKind; label: string }[] = [
  { value: "transactions", label: "Transactions" },
  { value: "categories", label: "Categories" },
  { value: "assets", label: "Assets" },
  { value: "liabilities", label: "Liabilities" },
  { value: "holdings", label: "Holdings" },
  { value: "cryptoWallets", label: "Crypto wallets" },
  { value: "podExpenses", label: "Pod expenses" },
  { value: "podSettlements", label: "Pod settlements" }
];

export function ImportExportDialog({ open, onClose }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const cloud = useCloudState();
  const isCloudPortfolio = cloud.enabled && cloud.portfolios.some((p) => p.id === portfolio.id);
  const fetchedPortfolioData = useCloudPortfolioData(portfolio, open && isCloudPortfolio);
  const portfolioData = fetchedPortfolioData ?? cloud.byPortfolio[portfolio.id];
  const fallbackMembers = useMemberships(portfolio.id);
  const fallbackTransactions = useTransactions(portfolio.id);
  const fallbackCategories = useCategories(portfolio.id);
  const fallbackAssets = useAssets(portfolio.id);
  const fallbackLiabilities = useLiabilities(portfolio.id);
  const fallbackHoldings = useHoldings(portfolio.id);
  const fallbackCryptoWallets = useCryptoWallets(portfolio.id);
  const members = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.memberships ?? []) : fallbackMembers),
    [fallbackMembers, isCloudPortfolio, portfolioData?.memberships]
  );
  const transactions = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.transactions ?? []) : fallbackTransactions),
    [fallbackTransactions, isCloudPortfolio, portfolioData?.transactions]
  );
  const categories = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.categories ?? []) : fallbackCategories),
    [fallbackCategories, isCloudPortfolio, portfolioData?.categories]
  );
  const assets = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.assets ?? []) : fallbackAssets),
    [fallbackAssets, isCloudPortfolio, portfolioData?.assets]
  );
  const liabilities = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.liabilities ?? []) : fallbackLiabilities),
    [fallbackLiabilities, isCloudPortfolio, portfolioData?.liabilities]
  );
  const holdings = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.holdings ?? []) : fallbackHoldings),
    [fallbackHoldings, isCloudPortfolio, portfolioData?.holdings]
  );
  const cryptoWallets = useMemo(
    () => (isCloudPortfolio ? (portfolioData?.cryptoWallets ?? []) : fallbackCryptoWallets),
    [fallbackCryptoWallets, isCloudPortfolio, portfolioData?.cryptoWallets]
  );
  const pods = useMoneyPods();
  const [activePodId, setActivePodId] = useState<string | null>(() => readActiveMoneyPodId());
  useEffect(() => listenForActiveMoneyPodChange(setActivePodId), []);
  const pod = useMemo(
    () => pods.find((candidate) => candidate.id === activePodId) ?? pods[0],
    [activePodId, pods]
  );
  const isCloudPod = !!pod && cloud.enabled && cloud.moneyPods.some((p) => p.id === pod.id);
  const fetchedPodData = useCloudPodData(pod, open && isCloudPod);
  const podData = pod ? (fetchedPodData ?? cloud.byPod[pod.id]) : undefined;
  const fallbackPodMembers = usePodMembers(pod?.id ?? "");
  const fallbackPodExpenses = usePodExpenses(pod?.id ?? "");
  const fallbackPodSettlements = usePodSettlements(pod?.id ?? "");
  const podMembers = useMemo(
    () => (isCloudPod ? (podData?.members ?? []) : fallbackPodMembers),
    [fallbackPodMembers, isCloudPod, podData?.members]
  );
  const podExpenses = useMemo(
    () => (isCloudPod ? (podData?.expenses ?? []) : fallbackPodExpenses),
    [fallbackPodExpenses, isCloudPod, podData?.expenses]
  );
  const podSettlements = useMemo(
    () => (isCloudPod ? (podData?.settlements ?? []) : fallbackPodSettlements),
    [fallbackPodSettlements, isCloudPod, podData?.settlements]
  );
  const actions = useDomainActions();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<DataKind>("transactions");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importFailed, setImportFailed] = useState(false);
  const [importErrors, setImportErrors] = useState<{ line: number; message: string }[]>([]);
  // Bank-CSV preset import (transactions only): parsed file awaiting confirmation.
  const [pendingImport, setPendingImport] = useState<{ matrix: string[][]; preset: CsvPreset | null } | null>(null);
  const [mapping, setMapping] = useState<GenericMapping | null>(null);
  const [intoAccountId, setIntoAccountId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [presetErrors, setPresetErrors] = useState<string[]>([]);
  const portfolioKind = kind !== "podExpenses" && kind !== "podSettlements";
  const cloudDataLoading =
    (cloud.enabled && cloud.loading) ||
    (portfolioKind && isCloudPortfolio && !portfolioData) ||
    (!portfolioKind && isCloudPod && !podData);

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const accountNameById = useMemo(
    () => Object.fromEntries(assets.map((a) => [a.id, a.name])),
    [assets]
  );
  const podMemberNameById = useMemo(
    () => Object.fromEntries(podMembers.map((member) => [member.id, member.displayName])),
    [podMembers]
  );
  const exportOnly =
    kind === "holdings" ||
    kind === "cryptoWallets" ||
    kind === "podExpenses" ||
    kind === "podSettlements";

  const activePreset = useMemo(() => {
    if (!pendingImport) return null;
    if (pendingImport.preset) return pendingImport.preset;
    return mapping ? buildGenericPreset(mapping) : null;
  }, [pendingImport, mapping]);
  const presetPreview = useMemo(
    () => (pendingImport && activePreset ? normalizeWithPreset(pendingImport.matrix, activePreset) : null),
    [pendingImport, activePreset]
  );
  const headerColumns = pendingImport?.matrix[0] ?? [];

  function resetPresetState() {
    setPendingImport(null);
    setMapping(null);
    setConfirming(false);
  }

  function updateMapping(patch: Partial<GenericMapping>) {
    setMapping((current) => (current ? { ...current, ...patch } : current));
  }

  function startPresetImport(matrix: string[][], preset: CsvPreset | null) {
    const memory = loadCsvPresetMemory(portfolioId);
    const memoryMatches = memory?.presetId === (preset?.id ?? "generic");
    const rememberedAccount =
      memoryMatches && memory?.accountId && assets.some((a) => a.id === memory.accountId)
        ? memory.accountId
        : "";
    setIntoAccountId(rememberedAccount);
    if (preset) {
      setMapping(null);
    } else {
      const remembered = memory?.customMapping;
      setMapping(
        remembered && mappingFitsHeader(remembered, matrix[0])
          ? remembered
          : defaultGenericMapping(matrix[0])
      );
    }
    setPendingImport({ matrix, preset });
  }

  async function confirmPresetImport() {
    if (!pendingImport || !activePreset || !presetPreview || confirming) return;
    setConfirming(true);
    const total = presetPreview.rows.length;
    let imported = 0;
    try {
      const ownerUserId = members[0]?.userId ?? "me";
      for (const row of presetPreview.rows) {
        await actions.createTransaction({
          portfolioId,
          occurredAt: row.occurredAt,
          description: row.description,
          accountId: intoAccountId || undefined,
          kind: row.kind,
          amount: row.amount,
          currency: row.currency,
          createdByUserId: ownerUserId
        });
        imported++;
      }
      saveCsvPresetMemory(portfolioId, {
        presetId: activePreset.id,
        accountId: intoAccountId || undefined,
        customMapping: activePreset.id === "generic" && mapping ? mapping : undefined
      });
      setPresetErrors(presetPreview.errors);
      const skippedNote = presetPreview.skipped > 0 ? `, ${presetPreview.skipped} skipped` : "";
      setImportFailed(false);
      setImportMessage(`Imported ${imported} row${imported === 1 ? "" : "s"}${skippedNote}.`);
    } catch (err) {
      console.warn("[numa] CSV import failed midway:", err);
      setImportFailed(true);
      setImportMessage(
        imported === 0
          ? "The import failed before any rows were saved. Check your connection and try again."
          : `Imported ${imported} of ${total} rows, then the connection failed — re-importing may duplicate those ${imported}.`
      );
    } finally {
      resetPresetState();
    }
  }

  function handleExport() {
    if (cloudDataLoading) {
      setImportMessage("Cloud data is still loading. Try again in a moment.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const fname = `numa-${portfolio.name.toLowerCase().replace(/\s+/g, "-")}-${kind}-${today}.csv`;
    let csv = "";
    switch (kind) {
      case "transactions":
        csv = transactionsToCsv(transactions, categoryNameById, accountNameById);
        break;
      case "assets":
        csv = assetsToCsv(assets);
        break;
      case "liabilities":
        csv = liabilitiesToCsv(liabilities);
        break;
      case "categories":
        csv = categoriesToCsv(categories);
        break;
      case "holdings":
        csv = holdingsToCsv(holdings);
        break;
      case "cryptoWallets":
        csv = cryptoWalletsToCsv(cryptoWallets);
        break;
      case "podExpenses":
        csv = podExpensesToCsv(podExpenses, podMemberNameById);
        break;
      case "podSettlements":
        csv = podSettlementsToCsv(podSettlements, podMemberNameById);
        break;
    }
    downloadCsv(fname, csv);
  }

  async function handleImportFile(file: File) {
    setImportMessage(null);
    setImportFailed(false);
    setImportErrors([]);
    setPresetErrors([]);
    resetPresetState();
    if (cloudDataLoading) {
      setImportMessage("Cloud data is still loading. Try again in a moment.");
      return;
    }

    let imported = 0;
    let total = 0;
    try {
      const text = await file.text();
      const ownerUserId = members[0]?.userId ?? "me";
      switch (kind) {
      case "transactions": {
        const analysis = analyzeTransactionsCsv(text);
        if (analysis.kind === "empty") {
          setImportMessage("That file looks empty.");
          return;
        }
        if (analysis.kind !== "native") {
          // Bank export (or unknown layout): stage a preview instead of importing directly.
          startPresetImport(analysis.matrix, analysis.preset ?? null);
          return;
        }
        const result = parseTransactionsCsv(text);
        total = result.rows.length;
        const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
        const accountByName = new Map(assets.map((a) => [a.name.toLowerCase(), a.id]));
        for (const row of result.rows) {
          await actions.createTransaction({
            portfolioId,
            occurredAt: row.occurredAt,
            description: row.description,
            categoryId: row.categoryName
              ? categoryByName.get(row.categoryName.toLowerCase())
              : undefined,
            accountId: row.accountName
              ? accountByName.get(row.accountName.toLowerCase())
              : undefined,
            kind: row.kind,
            amount: row.amount,
            currency: row.currency,
            createdByUserId: ownerUserId,
            notes: row.notes
          });
          imported++;
        }
        setImportErrors(result.errors);
        break;
      }
      case "categories": {
        const result = parseCategoriesCsv(text);
        total = result.rows.length;
        const baseOrder = categories.length;
        for (const [idx, row] of result.rows.entries()) {
          await actions.createCategory({
            portfolioId,
            name: row.name,
            kind: row.kind,
            icon: row.icon,
            color: row.color,
            sortOrder: baseOrder + idx,
            emoji: row.emoji,
            monthlyLimit: row.monthlyLimit
          });
          imported++;
        }
        setImportErrors(result.errors);
        break;
      }
      case "assets": {
        const result = parseAssetsCsv(text);
        total = result.rows.length;
        for (const row of result.rows) {
          await actions.createAsset({
            portfolioId,
            name: row.name,
            kind: row.kind,
            balance: row.balance,
            currency: row.currency,
            notes: row.notes,
            updatedAt: Date.now()
          });
          imported++;
        }
        setImportErrors(result.errors);
        break;
      }
      case "liabilities": {
        const result = parseLiabilitiesCsv(text);
        total = result.rows.length;
        for (const row of result.rows) {
          await actions.createLiability({
            portfolioId,
            name: row.name,
            kind: row.kind,
            balance: row.balance,
            currency: row.currency,
            interestRate: row.interestRate,
            dueDate: row.dueDate,
            notes: row.notes,
            updatedAt: Date.now()
          });
          imported++;
        }
        setImportErrors(result.errors);
        break;
      }
      case "holdings":
      case "podExpenses":
      case "podSettlements":
        setImportMessage("This dataset is export-only for now.");
        return;
      }
      setImportMessage(`Imported ${imported} row${imported === 1 ? "" : "s"}.`);
    } catch (err) {
      // A failed row mid-loop must not vanish silently: say how far we got.
      console.warn("[numa] CSV import failed midway:", err);
      setImportFailed(true);
      setImportMessage(
        imported === 0
          ? "The import failed before any rows were saved. Check the file and your connection, then try again."
          : `Imported ${imported} of ${total} rows, then the connection failed — re-importing may duplicate those ${imported}.`
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import / export data"
      description="Bring your spreadsheets in, take your data out. CSV only — no surprises."
    >
      <div className="flex flex-col gap-5">
        {/* flex-wrap + nowrap labels: 7 tabs flow onto a second row instead of
            clipping or wrapping "Pod expenses" onto two lines. */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[color:var(--color-cream-100)]">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                setImportMessage(null);
                setImportFailed(false);
                setImportErrors([]);
                setPresetErrors([]);
                resetPresetState();
              }}
              className={
                kind === k.value
                  ? "flex-auto whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[color:var(--color-paper)] text-[color:var(--color-ink)] shadow-sm"
                  : "flex-auto whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)] transition-colors"
              }
            >
              {k.label}
            </button>
          ))}
        </div>

        <section className="space-y-3">
          <header className="flex items-center gap-2">
            <FileDown size={14} className="text-[color:var(--color-ink-3)]" />
            <h3 className="text-[13px] font-semibold text-[color:var(--color-ink)]">Export</h3>
          </header>
          <p className="text-[12.5px] text-[color:var(--color-ink-3)]">
            Download all {kind} in this portfolio as CSV. Opens cleanly in Numbers, Excel, Google Sheets.
          </p>
          <Button type="button" variant="ghost" onClick={handleExport}>
            <Download size={14} />
            {cloudDataLoading ? "Loading cloud data…" : `Export ${kind}`}
          </Button>
        </section>

        <div className="h-px bg-[color:var(--color-line)]" />

        <section className="space-y-3">
          <header className="flex items-center gap-2">
            <FileUp size={14} className="text-[color:var(--color-ink-3)]" />
            <h3 className="text-[13px] font-semibold text-[color:var(--color-ink)]">Import</h3>
          </header>
          {pendingImport ? null : (
            <p className="text-[12.5px] text-[color:var(--color-ink-3)]">
              {exportOnly
                ? "This dataset is export-only in this release. Headers exported:"
                : "Drag a CSV file or pick one. We match category and account by name — unknown names import as \"uncategorised\". Headers expected:"}{" "}
              <code className="text-[11.5px] bg-[color:var(--color-cream-100)] px-1.5 py-0.5 rounded">
                {headerHintFor(kind)}
              </code>
              {kind === "transactions" ? (
                <>
                  {" "}
                  Revolut and N26 exports are detected automatically; anything else opens a column
                  mapper.
                </>
              ) : null}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
              event.target.value = "";
            }}
          />
          {pendingImport ? null : (
            <Button
              type="button"
              variant="primary"
              onClick={() => fileRef.current?.click()}
              disabled={exportOnly || cloudDataLoading}
            >
              <Database size={14} />
              Pick a CSV file
            </Button>
          )}
          {pendingImport && presetPreview ? (
            <div className="space-y-3 rounded-xl border border-[color:var(--color-line)] p-3">
              <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
                {pendingImport.preset
                  ? `Detected a ${pendingImport.preset.label} export`
                  : "Unrecognised layout — map the columns"}
              </p>
              {!pendingImport.preset && mapping ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Date column">
                    <Select
                      value={mapping.dateColumn}
                      onChange={(e) => updateMapping({ dateColumn: e.target.value })}
                    >
                      {headerColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Date format">
                    <Select
                      value={mapping.dateFormat}
                      onChange={(e) =>
                        updateMapping({ dateFormat: e.target.value as GenericMapping["dateFormat"] })
                      }
                    >
                      <option value="iso">2024-01-31</option>
                      <option value="iso-datetime">2024-01-31 12:00:00</option>
                      <option value="dd.mm.yyyy">31.01.2024</option>
                    </Select>
                  </Field>
                  <Field label="Amount column">
                    <Select
                      value={mapping.amountColumn}
                      onChange={(e) => updateMapping({ amountColumn: e.target.value })}
                    >
                      {headerColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Decimal separator">
                    <Select
                      value={mapping.decimalSeparator}
                      onChange={(e) =>
                        updateMapping({
                          decimalSeparator: e.target.value as GenericMapping["decimalSeparator"]
                        })
                      }
                    >
                      <option value=".">Dot (12.50)</option>
                      <option value=",">Comma (12,50)</option>
                    </Select>
                  </Field>
                  <Field label="Description column">
                    <Select
                      value={mapping.descriptionColumns[0] ?? ""}
                      onChange={(e) =>
                        updateMapping({
                          descriptionColumns: [e.target.value, mapping.descriptionColumns[1] ?? ""]
                        })
                      }
                    >
                      {headerColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Second description">
                    <Select
                      value={mapping.descriptionColumns[1] ?? ""}
                      onChange={(e) =>
                        updateMapping({
                          descriptionColumns: [mapping.descriptionColumns[0] ?? "", e.target.value]
                        })
                      }
                    >
                      <option value="">— none —</option>
                      {headerColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Amount signs">
                    <Select
                      value={mapping.signConvention}
                      onChange={(e) =>
                        updateMapping({
                          signConvention: e.target.value as GenericMapping["signConvention"]
                        })
                      }
                    >
                      <option value="signed">Signed (negative = expense)</option>
                      <option value="allExpense">All rows are expenses</option>
                    </Select>
                  </Field>
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] text-[color:var(--color-ink-2)]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[color:var(--color-ink-3)]">
                      <th className="py-1 pr-2 font-medium">Date</th>
                      <th className="py-1 pr-2 font-medium">Description</th>
                      <th className="py-1 pr-2 font-medium">Kind</th>
                      <th className="py-1 pr-2 font-medium text-right">Amount</th>
                      <th className="py-1 font-medium">Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presetPreview.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-[color:var(--color-line)]">
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {new Date(row.occurredAt).toISOString().slice(0, 10)}
                        </td>
                        <td className="py-1 pr-2 max-w-[200px] truncate">{row.description}</td>
                        <td className="py-1 pr-2">{row.kind}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{row.amount.toFixed(2)}</td>
                        <td className="py-1">{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {presetPreview.rows.length === 0 ? (
                  <p className="py-2 text-[12px] text-[color:var(--color-ink-3)]">
                    No rows could be mapped with these settings.
                  </p>
                ) : null}
              </div>
              <p className="text-[12px] text-[color:var(--color-ink-3)]">
                {presetPreview.rows.length} row{presetPreview.rows.length === 1 ? "" : "s"} ready,{" "}
                {presetPreview.skipped} skipped, {presetPreview.errors.length} error
                {presetPreview.errors.length === 1 ? "" : "s"}.
              </p>
              {presetPreview.rows.length > 500 ? (
                <p className="text-[12px] font-medium text-[color:var(--color-ink-2)]">
                  Large import — this may take a while.
                </p>
              ) : null}
              {presetPreview.warnings.map((warning, i) => (
                <p key={i} className="text-[12px] font-medium text-[color:var(--color-warning)]">
                  {warning}
                </p>
              ))}
              {presetPreview.errors.length ? (
                <details className="text-[12px] text-[color:var(--color-ink-3)]">
                  <summary className="cursor-pointer">Show error details</summary>
                  <ul className="mt-2 space-y-1 pl-4 list-disc">
                    {presetPreview.errors.slice(0, 8).map((message, i) => (
                      <li key={i}>{message}</li>
                    ))}
                    {presetPreview.errors.length > 8 ? (
                      <li className="text-[color:var(--color-ink-4)]">
                        …and {presetPreview.errors.length - 8} more
                      </li>
                    ) : null}
                  </ul>
                </details>
              ) : null}
              <Field label="Into account (optional)">
                <Select value={intoAccountId} onChange={(e) => setIntoAccountId(e.target.value)}>
                  <option value="">— none —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetPresetState} disabled={confirming}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void confirmPresetImport()}
                  disabled={confirming || presetPreview.rows.length === 0}
                >
                  {confirming
                    ? "Importing…"
                    : `Confirm import (${presetPreview.rows.length})`}
                </Button>
              </div>
            </div>
          ) : null}
          {importMessage ? (
            <p
              className={
                importFailed
                  ? "text-[13px] font-semibold text-[color:var(--color-negative)]"
                  : "text-[13px] font-semibold text-[color:var(--color-positive)]"
              }
            >
              {importMessage}
            </p>
          ) : null}
          {importErrors.length ? (
            <details className="text-[12px] text-[color:var(--color-ink-3)]">
              <summary className="cursor-pointer">
                {importErrors.length} row{importErrors.length === 1 ? "" : "s"} skipped — show details
              </summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {importErrors.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
                {importErrors.length > 12 ? (
                  <li className="text-[color:var(--color-ink-4)]">
                    …and {importErrors.length - 12} more
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}
          {presetErrors.length ? (
            <details className="text-[12px] text-[color:var(--color-ink-3)]">
              <summary className="cursor-pointer">
                {presetErrors.length} row{presetErrors.length === 1 ? "" : "s"} skipped — show details
              </summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {presetErrors.slice(0, 12).map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
                {presetErrors.length > 12 ? (
                  <li className="text-[color:var(--color-ink-4)]">
                    …and {presetErrors.length - 12} more
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </section>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function headerHintFor(kind: DataKind): string {
  switch (kind) {
    case "transactions":
      return "date,description,kind,amount,currency,category,account,notes";
    case "assets":
      return "name,kind,balance,currency,notes";
    case "liabilities":
      return "name,kind,balance,currency,interestRate,dueDate,notes";
    case "categories":
      return "name,kind,icon,color,emoji,monthlyLimit";
    case "holdings":
      return "symbol,name,kind,quantity,costBasis,currency,acquiredAt";
    case "cryptoWallets":
      return "label,publicAddress,addressType,includeInNetWorth,chains,…,snapshotJson";
    case "podExpenses":
      return "date,description,amount,currency,payer,participants,splitMode,card,notes";
    case "podSettlements":
      return "date,from,to,amount,currency,note";
  }
}
