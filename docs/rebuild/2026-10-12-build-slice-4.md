# Numa rebuild, build slice 4: Holdings and editing

Date: 2026-10-12. Status: built and verified locally against a throwaway local backend; not deployed.

## What exists now

- **Blocks open.** Tapping a block on Home (Crypto, Stocks, Cash and so on) opens its holdings; tapping the debt bar or "What you owe ›" opens debts, and "What you own ›" opens everything. On wide screens the sidebar has Holdings.
- **Every row says where its value came from**: "CoinGecko · 4 min ago", "Your value · 12 Oct", "Your value · 7 months old", "No price yet · counted at cost", "Due 20 Dec". A coloured dot marks live, due, and stale or missing values. Values that need an exchange rate show "—" and are left out of the group total, which says so.
- **Item detail**: value, freshness, and the facts behind it: units, price, what was paid and the gain for holdings; kind and update date for accounts; kind and due date for debts.
- **Edit** any account, holding or debt: name, value or units and cost, kind, currency and due date ("20 Dec", or empty for none). Save is disabled until the fields make sense.
- **Delete** asks once, then shows "Deleted · Undo" for six seconds. Undo after an edit writes the old values back to the same record; undo after a delete re-creates it.
- **Demo data** is read-only and says so.
- Writes go through the existing typed functions with a `clientMutationId` each, shared with Ask through one writer.

## Decisions made while building

- **The web build is now a single-page app** (`web.output: "single"`). The static build had no page for addresses with a variable part, so reloading `/holdings/things` or an item link gave a 404. Every address now loads the one page and the app routes from there. Hosting must fall back to `index.html` for unknown paths; Cloudflare Pages does this by default when there is no `404.html`.
- **Undoing a delete re-creates the record** with the same fields and a new id. Nothing else points at assets, holdings or debts by id except transactions on cash accounts, and the backend refuses to delete an account that has them, which the screen explains.

## Verified

Five verification cycles out of ten. A cycle is one run of a scripted browser journey against the web build, a throwaway local Convex backend and a disposable account.

- The final cycle passed 13 of 13 checks:
  - the Crypto block opens its holdings with live freshness;
  - Bitcoin's detail shows units, price, cost and gain;
  - an edit saves to the server and its Undo restores the same record;
  - debts list due states, and a due-date edit saves;
  - delete removes a debt and Undo brings it back, while a delete left alone stays deleted;
  - the wide sidebar's Holdings lists every group;
  - demo items cannot be edited;
  - there are no console errors.
- Earlier cycles:
  - cycle 1 never reached the app (the local server was still starting);
  - cycle 2 used the wrong role name in the test;
  - cycle 3 found the 404 on links to Holdings groups and items, plus a test that assumed a price the local backend had already refreshed;
  - cycle 4 passed but its screenshot showed values wrapping under their rows on the web, fixed before cycle 5.
- `npm run typecheck`, `npm run lint` and `npm test` (65 tests) pass; iOS and Android bundles compile.

## Not verified or not done

- Not run on a phone or simulator, or against shared or production Convex. Nothing deployed.
- Transactions are not editable yet; that comes with Flow.
- Swipe actions, sorting and search on Holdings are not built.
