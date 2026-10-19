import { ConvexError } from "convex/values";

/**
 * What a loan is tied to. A loan is a borrowing read from a tracked wallet
 * ("defi:<walletId>:<positionId>") or a debt the person recorded ("liability:<id>"). Its targets
 * name places that are already counted in net worth: a lending or pool position in a wallet, a
 * token in a wallet, a holding or an asset. Linking moves no value, so net worth never changes;
 * it only says where the borrowed money went and, for a recorded debt, what backs it.
 */
export type LoanRole = "deployed" | "collateral";
/**
 * Only part of a place: this many of one coin in it, like 0.377 BTC of a Compound position that
 * also holds the person's own coins. Without a part the whole place belongs to the loan.
 */
export type LoanPart = { symbol: string; quantity: number };
export type LoanTarget = { key: string; role: LoanRole; part?: LoanPart };
export type ParsedKey =
  | { kind: "defi" | "token"; walletId: string; inner: string }
  | { kind: "holding" | "asset" | "liability"; id: string };

export const MAX_LOAN_TARGETS = 24;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const INNER = /^[A-Za-z0-9:._-]{1,160}$/;
const SYMBOL = /^[A-Za-z0-9.]{1,24}$/;

export function parseKey(key: string): ParsedKey | null {
  const [kind, ...rest] = key.split(":");
  if (kind === "defi" || kind === "token") {
    const [walletId, ...inner] = rest;
    const tail = inner.join(":");
    return walletId && ID.test(walletId) && INNER.test(tail) ? { kind, walletId, inner: tail } : null;
  }
  if ((kind === "holding" || kind === "asset" || kind === "liability") && rest.length === 1 && ID.test(rest[0])) return { kind, id: rest[0] };
  return null;
}

const bad = (message: string) => new ConvexError({ code: "INVALID_LOAN_LINK", message });

/** Which loans already use each place, and whether whole. */
export type Taken = Map<string, { loanKey: string; whole: boolean }[]>;

export function takenBy(rows: { loanKey: string; targets: LoanTarget[] }[]): Taken {
  const out: Taken = new Map();
  for (const r of rows) for (const t of r.targets) out.set(t.key, [...(out.get(t.key) ?? []), { loanKey: r.loanKey, whole: !t.part }]);
  return out;
}

/**
 * Checks the shape of one loan's links. Ownership of the records named is checked by the caller,
 * which can read the database. `others` are the places other loans already use: a place linked
 * whole belongs to that loan alone, while parts of one place can go to several loans, so totals
 * across loans never count the same money twice.
 */
export function checkLoanLinks(loanKey: string, targets: LoanTarget[], others: Taken): ParsedKey[] {
  const loan = parseKey(loanKey);
  if (!loan || (loan.kind !== "defi" && loan.kind !== "liability")) throw bad("A loan is a wallet borrowing or a recorded debt");
  if (targets.length > MAX_LOAN_TARGETS) throw bad(`Link at most ${MAX_LOAN_TARGETS} places to one loan`);
  const seen = new Set<string>();
  const parsed: ParsedKey[] = [];
  for (const t of targets) {
    const p = parseKey(t.key);
    if (!p || p.kind === "liability") throw bad("A loan links to a wallet position, a wallet token, a holding or an asset");
    if (t.key === loanKey) throw bad("A loan can't be linked to itself");
    if (seen.has(t.key)) throw bad("That place is listed twice");
    // A wallet borrowing's collateral is read from the protocol; only a recorded debt takes it by hand.
    if (t.role === "collateral" && loan.kind !== "liability") throw bad("Collateral of a wallet borrowing comes from the protocol");
    if (t.part && (!SYMBOL.test(t.part.symbol) || !Number.isFinite(t.part.quantity) || !(t.part.quantity > 0) || t.part.quantity > 1e15)) throw bad("A part is a coin and a positive amount");
    const elsewhere = (others.get(t.key) ?? []).filter((o) => o.loanKey !== loanKey);
    if (elsewhere.length && (!t.part || elsewhere.some((o) => o.whole))) throw bad("That place is already linked to another loan");
    seen.add(t.key);
    parsed.push(p);
  }
  return parsed;
}
