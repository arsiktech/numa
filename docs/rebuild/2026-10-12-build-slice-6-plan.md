# Numa rebuild, build slice 6: Plan

Date: 2026-10-12. Status: built and verified locally against a throwaway local backend; not deployed. Step 2 of the end-to-end build job.

## What exists now

- **Runway:** "About 6 months on cash", worked out from cash and the average spending of the last three full months. With no spending logged in that window it says so instead of guessing from a few days. Under three months it turns red.
- **Goals:**
  - Kinds: a net-worth target or a monthly income goal, with an optional date and name.
  - Progress comes from the person's own numbers. Goals already in the backend for an income category, an asset or a holding show too, and progress that can't be measured stays "unknown", never zero.
  - Adding and deleting both have Undo.
- **Spending limits:**
  - Every spending category with this month's spend, with a monthly limit that can be set, changed or removed (Undo writes the old limit back).
  - Bars turn amber at 80% and red when passed.
  - Needs you on Home raises the category at 80% ("Dining is at 85% of its limit") and when the limit is passed.
- **Demo Plan** shows a runway and two example goals, read-only.
- Writes use the existing `mobile:upsertGoal`, `goals:remove` and `categories:update` with a `clientMutationId` each. No backend change.

## Verified

One verification cycle out of ten; it passed 12 of 12 checks:
- runway from the last three months;
- a limit saved to the category and its spent-of-limit row;
- a goal saved with its date, progress from net worth, and undo of the add;
- a goal deleted and its undo re-creating it;
- Needs you raising the limit at 85%;
- removing a limit;
- demo Plan on wide light;
- no console errors.

`npm run typecheck`, `npm run lint` and `npm test` (81 tests, including the limit alerts) pass.

## Not verified or not done

- Not run on devices or against shared or production Convex. Nothing deployed.
- Goals for one asset, holding or income category can be shown and deleted but not created from the app yet.
