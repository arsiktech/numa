# Domain and UI conventions

Use the [README](../../README.md) for task autonomy and verification. These are
implementation facts to consult when working in the relevant area.

## Data flow

- Reads use hooks in `src/services/store.tsx`, backed by `cloudStore.tsx`.
- Product writes use `domainActions.ts`, `podActions.ts`, or
  `writeQueue.tsx`; raw reducer dispatch is for local UI/cache state.
- Replayable writes use `clientMutationId` with
  `convex/lib/mutationReceipts.ts`. A child write that needs a generated parent
  id belongs in one atomic server mutation.
- For a mutable cloud field, follow it through client types, Convex schema and
  validators/access, cloud mapper, typed action, UI, and relevant coverage.
  Clear optional fields with the explicit `null` wire sentinel; `undefined`
  means unchanged.
- Authorization uses `convex/lib/access.ts`. Owners manage structure, editors
  manage finance/activity, and viewers read.

## Financial contracts

- [Management-finance v1](../FINANCE-CONTRACT.md) defines monetary precision,
  UTC reporting, classified ledger postings and the legacy/ledger source boundary.

- Splits and ownership use basis points: `10000` is 100 percent. Validate
  participant uniqueness/membership and custom totals at the server.
- Convex finance currency is `USD | EUR`; narrow the wider client currency
  type at that boundary. Shared pods are single-currency without server FX.
- Preserve decimal amounts and comma-decimal input; use the money formatters.
- `convex/lib/settlementMath.ts` is shared by client/server. Pod balances use
  all history and support partial settlement.
- Grouped pods display groups as counterparties, net opposite transfers, and
  never imply internal family debt. Group deletion unlinks references rather
  than deleting people or expenses.
- AI-created changes need explicit confirmation and an audit row. Auth,
  validation, CORS, and rate limits precede provider work.

## Interface patterns

Use existing primitives, `src/styles/tokens.css`, `themes.css`, and motion
values in `src/lib/motion.ts`. Primary CTA backgrounds use `--color-cta`.
The landing page is an intentional light-only surface.

Keep the next user action clear. Working screens can use desktop width; quick
dialogs keep the primary action reachable, with scrolling for long content or
enlarged text. Compact button/tab labels should not wrap accidentally.
Motion and proximity effects must preserve scrolling, focus, and reduced motion.

The existing pod surface has specific behavior worth preserving:

- Member cards reflect groups and open the selected member's editor.
- History remains reachable rather than silently truncated.
- Category inference is weighted and multilingual, with manual override.
- Smart batch add keeps separate rows and their payer/split/card context.
- Invite suggestions exclude the current user and already-selected people.

## Source organization

Routes live in `src/routes/`, UI primitives in `src/components/ui/`, feature
flows in `src/components/features/`, and pure logic in `src/lib/`. Match
nearby code and the `@` alias for `src`. Vitest tests are colocated;
Playwright journeys live in `tests/`. Deployment, native, and public-release
evidence remain separate from local implementation.
