import { AnimatedAmount } from "@/components/ui/AnimatedAmount";
import {
  balanceScale,
  type BalanceGroup,
  type BalanceGroupId,
  type BalanceItem,
  type BalanceSummary
} from "@/lib/balance";
import { formatMoney, formatMoneyDecimal, formatSignedMoneyDecimal } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PlainSearchButton } from "@/components/layout/CommandBar";

const GROUP_NAME: Record<BalanceGroupId, string> = {
  cash: "Cash",
  investments: "Investments",
  crypto: "Crypto",
  property: "Property and things",
  debt: "Debts"
};

/** What "Add" means inside each group. */
export type BalanceAddKind = "account" | "investment" | "wallet" | "property" | "debt";

const GROUP_ADD: Record<BalanceGroupId, Array<{ kind: BalanceAddKind; label: string }>> = {
  cash: [{ kind: "account", label: "Add account" }],
  investments: [{ kind: "investment", label: "Add investment" }],
  crypto: [
    { kind: "investment", label: "Add coin" },
    { kind: "wallet", label: "Track wallet" }
  ],
  property: [{ kind: "property", label: "Add property" }],
  debt: [{ kind: "debt", label: "Add debt" }]
};

export interface UncountedWallet {
  id: string;
  label: string;
  reason: string;
}

/** A segment narrower than this keeps its label in the breakdown only. */
const LABEL_MIN_SHARE = 0.16;

function scrollToGroup(id: BalanceGroupId) {
  const target = document.getElementById(`balance-${id}`);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

export function BalanceView({
  summary,
  onAdd,
  onAddItem,
  onEditItem,
  uncountedWallets = []
}: {
  summary: BalanceSummary;
  onAdd: () => void;
  onAddItem: (kind: BalanceAddKind) => void;
  onEditItem: (item: BalanceItem) => void;
  uncountedWallets?: UncountedWallet[];
}) {
  const ownGroups = summary.groups.filter((group) => group.side === "own");
  const debt = summary.groups.find((group) => group.side === "owe");
  const scale = balanceScale(summary);
  const currency = summary.currency;

  return (
    <div className="nm-balance mx-auto w-full max-w-[880px] pb-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[17px] font-semibold text-[color:var(--color-ink-2)]">Net worth</h1>
        <div className="flex items-center gap-3">
          <PlainSearchButton />
          {summary.empty ? null : (
            <button type="button" onClick={onAdd} className="nm-balance-add">
              Add transaction
            </button>
          )}
        </div>
      </header>

      <section aria-label="Net worth" className="mt-5">
        {summary.empty ? null : summary.available ? (
          <AnimatedAmount
            value={summary.net}
            currency={currency}
            formatter={formatMoneyDecimal}
            className="nm-balance-figure block"
            data-testid="net-worth"
          />
        ) : (
          <p className="nm-balance-figure text-[color:var(--color-ink-3)]" data-testid="net-worth">
            Unavailable
          </p>
        )}
        {summary.marketsToday !== null ? (
          <p className="mt-4 text-[17px] text-[color:var(--color-ink-2)]">
            <span
              className={cn(
                "font-semibold tabular-nums",
                summary.marketsToday >= 0 ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-negative)]"
              )}
            >
              {formatSignedMoneyDecimal(summary.marketsToday, currency)}
            </span>{" "}
            from markets today
          </p>
        ) : null}
        {!summary.available && !summary.empty ? (
          <p className="mt-4 max-w-[46ch] text-[15px] text-[color:var(--color-ink-3)]">
            Some amounts are in another currency and today's exchange rate is not available yet. Totals come back as
            soon as it is.
          </p>
        ) : null}
      </section>

      {summary.empty ? (
        <EmptyStart onAddItem={onAddItem} />
      ) : (
        <>
          {scale ? (
            <section aria-label="What you own and what you owe" className="mt-10">
              <BarLabel label="What you own" value={summary.own} currency={currency} />
              <div className="nm-balance-bar" data-testid="bar-own">
                {ownGroups.map((group) => (
                  <Segment key={group.id} group={group} share={group.value / scale.scale} currency={currency} />
                ))}
                {scale.ownGap > 0 ? <span className="nm-balance-gap" style={{ flexGrow: scale.ownGap }} /> : null}
              </div>
              <div className="nm-balance-bar mt-[2px]" data-testid="bar-owe">
                {debt ? <Segment group={debt} share={debt.value / scale.scale} currency={currency} /> : null}
                {scale.left > 0 ? (
                  <span className="nm-balance-left" style={{ flexGrow: scale.left }} data-testid="bar-left">
                    {scale.left / scale.scale >= LABEL_MIN_SHARE ? (
                      <span className="nm-balance-seg-text">
                        <span className="text-[13px] font-semibold">Your net worth</span>
                        <span className="text-[15px] font-semibold tabular-nums">{formatMoney(scale.left, currency)}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <BarLabel label="What you owe" value={summary.owe} currency={currency} swatch="debt" />
              {scale.shortfall > 0 ? (
                <p className="mt-3 text-[15px] text-[color:var(--color-ink-2)]">
                  You owe {formatMoneyDecimal(scale.shortfall, currency)} more than you own.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-10 space-y-8">
            {summary.groups.map((group) => (
              <GroupSection key={group.id} group={group} currency={currency} onAddItem={onAddItem} onEditItem={onEditItem} />
            ))}
          </div>

          <MissingGroups summary={summary} onAddItem={onAddItem} />

          {uncountedWallets.length ? (
            <section aria-labelledby="balance-uncounted" className="mt-8">
              <h2 id="balance-uncounted" className="border-b border-[color:var(--color-line)] pb-2 text-[15px] font-semibold text-[color:var(--color-ink-2)]">
                Not counted in net worth
              </h2>
              <ul>
                {uncountedWallets.map((wallet) => (
                  <li key={wallet.id}>
                    <button
                      type="button"
                      className="nm-balance-row nm-balance-row-button"
                      onClick={() => onEditItem({ id: wallet.id, source: "wallet", name: wallet.label, value: 0 })}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{wallet.label}</span>
                        <span className="block text-[13px] text-[color:var(--color-ink-3)]">{wallet.reason}</span>
                      </span>
                      <span aria-hidden className="nm-balance-chevron">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function BarLabel({
  label,
  value,
  currency,
  swatch
}: {
  label: string;
  value: number;
  currency: BalanceSummary["currency"];
  swatch?: BalanceGroupId;
}) {
  return (
    <p className="my-2 flex items-baseline justify-between gap-4 text-[15px] text-[color:var(--color-ink-2)]">
      <span className="inline-flex items-center gap-2">
        {swatch ? <span className={cn("nm-balance-swatch", `nm-balance-${swatch}`)} aria-hidden /> : null}
        {label}
      </span>
      <span className="text-[17px] font-semibold tabular-nums text-[color:var(--color-ink)]">
        {formatMoneyDecimal(value, currency)}
      </span>
    </p>
  );
}

function Segment({ group, share, currency }: { group: BalanceGroup; share: number; currency: BalanceSummary["currency"] }) {
  return (
    <button
      type="button"
      aria-label={`${GROUP_NAME[group.id]}, ${formatMoneyDecimal(group.value, currency)}. Show details`}
      onClick={() => scrollToGroup(group.id)}
      className={cn("nm-balance-seg", `nm-balance-${group.id}`)}
      style={{ flexGrow: Math.max(0, group.value) }}
      data-group={group.id}
    >
      {share >= LABEL_MIN_SHARE ? (
        <span className="nm-balance-seg-text" aria-hidden>
          <span className="text-[13px] font-semibold">{GROUP_NAME[group.id]}</span>
          <span className="text-[15px] font-semibold tabular-nums">{formatMoney(group.value, currency)}</span>
        </span>
      ) : null}
    </button>
  );
}

function itemNote(item: BalanceItem) {
  return [
    item.detail && item.unitPrice !== undefined
      ? `${item.detail} at $${item.unitPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
      : item.detail,
    item.note === "at-cost" ? "no price yet, shown at cost" : null,
    item.note === "stale-price" ? "price is out of date" : null,
    item.note === "stale-balance" ? "balance is out of date" : null
  ]
    .filter(Boolean)
    .join(", ");
}

function GroupSection({
  group,
  currency,
  onAddItem,
  onEditItem
}: {
  group: BalanceGroup;
  currency: BalanceSummary["currency"];
  onAddItem: (kind: BalanceAddKind) => void;
  onEditItem: (item: BalanceItem) => void;
}) {
  return (
    <section id={`balance-${group.id}`} tabIndex={-1} aria-labelledby={`balance-${group.id}-title`} className="nm-balance-section">
      <h2 id={`balance-${group.id}-title`} className="flex items-center gap-3 border-b border-[color:var(--color-ink)] pb-2 text-[17px] font-semibold">
        <span className={cn("nm-balance-swatch", `nm-balance-${group.id}`)} aria-hidden />
        <span className="min-w-0 flex-1">{GROUP_NAME[group.id]}</span>
        <span className="tabular-nums">{formatMoneyDecimal(group.value, currency)}</span>
      </h2>
      <ul>
        {group.items.map((item) => {
          const note = itemNote(item);
          return (
            <li key={`${item.source}-${item.id}`}>
              <button
                type="button"
                className="nm-balance-row nm-balance-row-button"
                aria-label={`${item.name}, ${formatMoneyDecimal(item.value, currency)}. Edit`}
                onClick={() => onEditItem(item)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{item.name}</span>
                  {note ? <span className="block text-[13px] text-[color:var(--color-ink-3)]">{note}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{formatMoneyDecimal(item.value, currency)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-x-5">
        {GROUP_ADD[group.id].map((action) => (
          <button key={action.kind} type="button" className="nm-balance-text-action" onClick={() => onAddItem(action.kind)}>
            + {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Offer the groups the person has not started yet, as quiet text actions. */
function MissingGroups({ summary, onAddItem }: { summary: BalanceSummary; onAddItem: (kind: BalanceAddKind) => void }) {
  const present = new Set(summary.groups.map((group) => group.id));
  const missing: Array<{ kind: BalanceAddKind; label: string }> = [];
  if (!present.has("cash")) missing.push({ kind: "account", label: "Add an account" });
  if (!present.has("investments") && !present.has("crypto")) missing.push({ kind: "investment", label: "Add an investment" });
  if (!present.has("property")) missing.push({ kind: "property", label: "Add property or a car" });
  if (!present.has("debt")) missing.push({ kind: "debt", label: "Add a debt" });
  if (!missing.length) return null;
  return (
    <div className="mt-8 flex flex-wrap gap-x-5 gap-y-1 border-t border-[color:var(--color-line)] pt-3">
      {missing.map((action) => (
        <button key={action.kind} type="button" className="nm-balance-text-action" onClick={() => onAddItem(action.kind)}>
          + {action.label}
        </button>
      ))}
    </div>
  );
}

function EmptyStart({ onAddItem }: { onAddItem: (kind: BalanceAddKind) => void }) {
  const links: Array<[string, string, BalanceAddKind]> = [
    ["Add an account", "Bank, savings or cash", "account"],
    ["Add an investment", "Stocks, ETFs or crypto by ticker", "investment"],
    ["Add a debt", "Card, loan or mortgage", "debt"]
  ];
  return (
    <section aria-labelledby="balance-start" className="mt-8 max-w-[520px]">
      <h2 id="balance-start" className="text-[22px] font-semibold">
        Start with what you have today
      </h2>
      <p className="mt-2 text-[15px] text-[color:var(--color-ink-2)]">
        Enter today's balances once. Prices for your investments then update on their own.
      </p>
      <ul className="mt-5 border-t border-[color:var(--color-line)]">
        {links.map(([label, hint, kind]) => (
          <li key={kind}>
            <button type="button" onClick={() => onAddItem(kind)} className="nm-balance-row nm-balance-row-button">
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-[14px] text-[color:var(--color-ink-3)]">{hint}</span>
              </span>
              <span aria-hidden className="nm-balance-chevron">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
