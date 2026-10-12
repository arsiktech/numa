# Numa rebuild, build slice 10: hardening

Date: 2026-10-12. Status: built and verified locally and in CI; not deployed. Step 6 of the end-to-end build job.

## What exists now

- **Browser journeys in CI** (merged in #9). Nine scripted journeys live in `apps/numa/e2e/`: sign-in and Home, Ask, Holdings, Flow, Plan, alerts, import, Settings and offline. A CI job runs them on every PR against a local Convex backend that exists only inside the job, using disposable `@example.com` identities. See `apps/numa/e2e/README.md`.
- **Offline notice.** When the live connection to the server drops for more than 3 seconds, a quiet pill above the phone nav says figures may be out of date. It goes away on reconnect, and the screen keeps showing what it had.
- **Lost sessions and load failures** (from slice 9): the app signs out cleanly, or offers Try again.
- **App icons.** Expo's placeholder icons are replaced with a white Manrope "n" plus the iridescent PRO film on black: the app icon, the Android adaptive layers and monochrome, the favicon, and the "numa" wordmark splash. `scripts/make-icons.cjs` redraws them all from one template.
- **Enlarged text.** Buttons, pills, tabs and inputs that hold text now use a minimum height instead of a fixed one, so larger system text grows them instead of clipping.
- **Fixes found by the journeys:**
  - At phone width in demo mode, the header pushed the Settings icon off screen. The pill now reads "Demo" on phones.
  - Ask rounded €4.50 of spending to "€4". Amounts under €1,000 now keep their cents.
  - The first journey assumed seeded prices, but the backend's market job refreshes BTC mid-run. It now reads prices back from the server.

## Verified

Full journey run locally, 3 of 10 cycles: 9 of 9 journeys and 114 checks pass, including:
- the demo header fitting a 390 px screen;
- demo mode sending account screens back to Settings;
- the offline notice appearing and clearing.

In CI, the e2e job from #9 ran every journey on GitHub's runners in about 1 minute 40 seconds. `npm run typecheck`, `npm run lint` and `npm test` (105 tests) pass.

## Not verified

- Enlarged text on a real device. The fix is the `minHeight` change; web has no system text scaling to test with.
- Icons on a device home screen or launcher. The rendered PNGs were checked, at sizes from 16 to 1024 px.
- Screen readers on devices.
