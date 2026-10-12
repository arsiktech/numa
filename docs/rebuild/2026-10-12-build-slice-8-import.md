# Numa rebuild, build slice 8: import from a sheet or CSV

Date: 2026-10-12. Status: built and verified locally; not deployed. Step 4 of the end-to-end build job.

## What exists now

- **Import screen** (Settings → "Import from a sheet or CSV", and from Home's empty state). Paste rows copied from a spreadsheet, or pick a CSV file on the web.
- **Three kinds of table, detected from the header:**
  - transactions (date, amount, description, category; a separate in/out column or a signed amount);
  - balances (name, value, and optionally a type such as cash, property or loan; debts go to what you owe);
  - holdings (symbol, quantity, price paid).
- **A preview before anything is saved.** Each row shows what Numa will do: add, update an existing record with the same name, skip a duplicate, or why it can't be imported. Nothing is written until you press "Import N".
- **Undo this import** reverses the whole batch: new records are deleted and updated ones go back to their old values.

## Rules

- Tabs, commas and semicolons all work, with quoted fields.
- Money accepts "1,200.50", "1.200,50" and "1.200" (read as 1,200). Quantities keep every decimal, so 0.00012345 BTC stays exact.
- Dates are read day first (12/10/2026 is 12 October) unless written as ISO.
- A holding without a price paid is refused rather than saved at zero. Unknown money never becomes zero.
- Every write carries its own receipt, so a retried import does not double up.

## Deferred

- **Wallets.** Syncing a public wallet address needs a server-side sync in Convex and a provider key the owner sets. That is a credential decision, so it waits.
- **Exchange exports** work through the generic transaction import. A dedicated format per exchange can come later if needed.

## Verified

One verification cycle out of ten; it passed 10 of 10 checks:
- a balance sheet preview reading three rows and flagging one;
- importing updates and new records, then Undo reversing the whole import;
- a bank CSV importing with sign, date and category;
- duplicates skipped;
- holdings keeping every decimal and refusing a missing price paid;
- an unknown table explained;
- Settings opening Import on wide screens;
- no console errors.

`npm run typecheck`, `npm run lint` and `npm test` (98 tests) pass.
