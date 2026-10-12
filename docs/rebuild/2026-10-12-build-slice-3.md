# Numa rebuild, build slice 3: Ask and the plus

Date: 2026-10-12. Status: built and verified locally against a throwaway local backend; not deployed.

## What exists now

- **Ask or add**: the plus on phone and Ask on wide screens open a composer. Type what happened or ask about your money.
- **Drafts first.** Every sentence that changes money becomes a draft card marked DRAFT, with Save, Edit and Discard. Nothing is written until Save, and Save has Undo.
  - Spending and income: "Coffee 4.50", "Spent 1,200 on rent yesterday", "Got paid 5,000 from Client A". Categories are matched from the person's own list (Dining, Rent, Freelance and so on).
  - Balances: "Bank balance 12,500" updates a known account or adds a cash account; "Flat worth 250k" adds property, cars and watches land in their own kinds.
  - Debts: "Owe 420 on card due 20 Oct", "Car loan 20,000".
  - Holdings: "Bought 10 VOO at $500", "Bought 0.1 BTC for 6,000", "I own 3 AAPL". Buying adds to an existing holding; the cost is kept in the holding's own currency.
  - Edit changes the words, amount, currency, quantity, price, and spent versus received.
- **Answers from the person's own numbers**: net worth, cash, liquid, what is owed, spent, came in and kept this month. Answers never guess; without an exchange rate they say so.
- **Writes** go through the existing typed Convex functions (`mobile:createTransaction`, `upsertAsset`, `upsertLiability`, `upsertHolding`) with a fresh `clientMutationId` per write, so a retried request never saves twice. Undo calls the matching delete, or writes back the old values for an update.
- **Demo mode**: drafts work, and Save says nothing was saved.
- Home and Ask share one data provider, so the portfolio is loaded once.

## Decisions made while building

- **No AI provider in this slice.** The parser runs on the device with plain rules, so no words leave the app except the confirmed write. An AI parser (receipts, screenshots, free text) needs a paid provider and the owner's go-ahead; when it comes, it goes through the existing `aiActionDrafts` audit trail.
- **No invented costs.** A holding cannot be saved without the price paid; Save stays disabled and the card says what is missing. Buying in another currency than the holding converts with the day's rate, or refuses without one.
- **Records saved a moment ago count.** The month summary accepts records up to an hour after the screen's clock, which refreshes once a minute; before this, a coffee saved in that minute was left out as "in the future". Found in verification.

## Verified

Three verification cycles out of ten. A cycle is one run of a scripted browser journey against the web build, a throwaway local Convex backend and a disposable account.

- The final cycle passed 19 of 19 checks:
  - a balance update, spending, income, a debt with a due date and a holding buy, each drafted correctly and saved;
  - a holding without a price cannot be saved until the price is added, and Undo reverses that save;
  - Discard saves nothing, and a sentence without an amount gets a plain reply;
  - the net-worth and spending answers match the records;
  - Home then shows own €16,961, owe €420 and kept €4,995;
  - the server holds exactly the saved records (2 transactions, 1 debt, VOO at a $5,000 cost, Cash at €12,500) and nothing that was undone or discarded;
  - Ask works on wide screens in light, demo Save writes nothing, and there are no console errors.
- The first two cycles failed on a test selector, then found the clock bug above, which is fixed with a unit test.
- `npm run typecheck`, `npm run lint` and `npm test` (58 tests) pass; iOS and Android bundles compile.

## Not verified or not done

- Not run on a phone or simulator.
- Not run against the shared development or production Convex deployments. Nothing deployed.
- Receipts, screenshots and free-form AI parsing are not built.
- Drafts live only while Ask is open; leaving Ask with an unsaved draft drops it.

## Next slices

1. Flow: the monochrome Sankey, following a stream, products and MRR.
2. Plan, Holdings, sources and the Google Sheet import, then widgets.
3. Release: a web deploy and TestFlight and Play builds, each with the owner's go-ahead.
