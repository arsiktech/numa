# Numa rebuild, build slice 7: Needs you that remembers, tips, and the turning PRO badge

Date: 2026-10-12. Status: built and verified locally; not deployed. Step 3 of the end-to-end build job.

## What exists now

- **Needs you remembers.** "Got it" hides an item until it changes: if its title changes, as when "Dining is at 85% of its limit" becomes "Dining is over its limit", it comes back. "Later" snoozes it until tomorrow. Both are stored on the device, survive reopening the app, and offer Undo while the card is on screen. The three slots are filled from what is still visible, so dismissing one lets the next one in.
- **Limit alerts** at 80% and when passed (built with Plan in slice 6).
- **First-visit tips** on Flow ("Tap a stream, or its chip, to follow it"), Plan ("Tap a category to set its monthly limit") and Holdings ("Tap any row…"). They join Home's drag-the-line tip, each shown once and then remembered.
- **The PRO badge turns.** An oversized film of the six oil colours rotates once every 9 seconds under a fixed highlight, as in the mockup. With reduced motion it holds still.

## Decisions

- **No quiet hours yet.** Alerts are in-app only, and quiet hours only matter once push notifications exist. They come with push.

## Verified

One verification cycle out of ten; it passed 10 of 10 checks:
- two items needing attention;
- "Got it" with its done state, and Undo;
- dismissed and snoozed items staying hidden after a reload;
- a dismissed item coming back when it changes;
- Flow's tip shown once and remembered;
- the badge's rotation changing over time, and staying at 0° with reduced motion;
- no console errors.

`npm run typecheck`, `npm run lint` and `npm test` (83 tests) pass.
