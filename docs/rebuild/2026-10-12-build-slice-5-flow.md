# Numa rebuild, build slice 5: Flow

Date: 2026-10-12. Status: built and verified locally against a throwaway local backend; not deployed.

Part of the end-to-end build job the owner approved on 2026-10-12. The job runs in one session, step by step, and merges each step when CI is green. The audience is the owner only (v1 as decided). Preview web deploys to Cloudflare Pages and internal TestFlight and Play builds are pre-approved once the owner connects those accounts; production still needs the owner's go-ahead.

## What exists now

- **Flow tab.** The headline is what was kept this month ("You kept €3,777"), or "€500 more out than in", with in, out and the share kept underneath. Earlier months are one tap away, from the first transaction to now.
- **The money split** (monochrome Sankey). Sources are on the left and spending on the right, with what was kept as a green stream. When more went out than came in, the gap is drawn as "From savings" in red rather than a negative "kept", so both sides always add up and widths stay true to the amounts.
- **Follow a stream.** Tap a stream, or its chip under the split (every stream has one, however thin), and the rest dims. The list below then shows only that stream's transactions.
- **Transactions.** Each month's transactions open to their own screen, where they can be edited (what for, amount, spent or received, category, date, currency) or deleted. Both edit and delete have Undo; undoing a delete re-creates the transaction with its account, so cash-account balances come back too.
- **Products and MRR.** Only recurring income explicitly marked as a subscription or retainer counts towards MRR and ARR. Salary and other unmarked income never inflate it, and with no marked revenue the card is hidden instead of showing a misleading zero.
- **Every month.** Active recurring rules are listed as monthly amounts, with when each runs next.
- Home's month teaser and Flow use the same monthly grouping.

## Verified

Five verification cycles out of ten.

- The final cycle passed 13 of 13 checks:
  - the kept headline, the split's streams, transactions with cents, and MRR at €2,100 a month (€25,200 a year);
  - following Dining lists only its transactions;
  - the previous, overspent month shows the gap from savings;
  - a transaction edit and its undo, and a delete and its undo, all confirmed on the server (the undone delete keeps its category);
  - wide light Flow, demo Flow, and no console errors.
- Problems found along the way:
  - small streams had no label, so they couldn't be followed; stream chips fixed that;
  - the transaction list rounded €4.50 to €4; it now shows cents;
  - two cycles failed on test selectors.
- `npm run typecheck`, `npm run lint` and `npm test` (74 tests) pass; iOS and Android bundles compile.

## Not verified or not done

- Not run on devices or against shared or production Convex. Nothing deployed.
- Recurring rules are read-only here; adding them from Ask comes later.
- The split does not animate its ribbons between months yet; it fades in.
