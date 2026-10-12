# Numa rebuild, build slice 9: spaces, currency, export, password and account deletion

Date: 2026-10-12. Status: built and verified locally; not deployed. Step 5 of the end-to-end build job.

## What exists now

- **Spaces.** Settings lists every space you can see, and you choose which one Numa shows. The choice is remembered on the device. "New space" makes a separate business or personal space, in EUR or USD, that starts empty: nothing is moved or copied.
- **Currency.** The space owner can switch its totals between EUR and USD, with Undo. Records keep their own currency, and nothing is converted when they are stored.
- **Download a copy.** Saves every record in the current space to one JSON file, using the existing paged server export. If a page is too big, Numa asks again from the same cursor with a smaller limit. The file is either complete or not saved at all. On the web it downloads; on phones it opens the share sheet.
- **Change password.** It shows the server's own plain messages for a wrong current password or a weak new one. Other devices are signed out.
- **Delete account.** You have to type "delete" first, and the screen offers a copy of your data before you do. A normal account gets 7 days: Settings shows the date and a "Keep my account" button. Test accounts (example.com) are erased at once and signed out.
- **Losing a session is handled.** If the server stops accepting the session (erased account, signed out elsewhere), the app signs out instead of showing a blank screen. Other load failures show "Couldn't load your money" with Try again.
- **Accessibility fix across the app.** react-native-web 0.21 ignores `accessibilityState`, so checked, selected, disabled and busy states were missing on the web. Every control now uses `aria-*` props, which work on native and web.

Every backend function used here already existed (`spaces:*`, `portfolios:update`, `dataExport:*`, `authManagement:changePassword`, `users:deleteMyAccount`, `users:cancelMyDeletion`, `profiles:me`). There are no backend changes. New app dependencies: `expo-file-system` and `expo-sharing`, for saving the export on phones.

## Not in this slice

- Password reset by email and email verification need the email provider key on the deployment, which is the owner's decision.
- Renaming or deleting a single space.

## Verified

Settings journey against a throwaway local backend, with disposable identities. It took 4 of 10 cycles, and the final run passed 11 of 11:
- the space listed and checked;
- a currency change on the server, and Undo;
- a new USD business space selected, still chosen after a reload, and empty;
- switching back;
- the export file's name, manifest, all 18 sections and the saved asset;
- password errors, then the new password working and the old one refused;
- deleting a test account erasing it and signing out;
- an ordinary account getting a 7-day date and being kept;
- no unexpected console errors.

The deliberate failures are filtered by pattern: the wrong-password call and the erased account's last query.

Regression after the `aria-*` change: Flow (13 of 13), Plan (12 of 12) and Import (10 of 10) journeys pass. `npm run typecheck`, `npm run lint` and `npm test` (105 tests) pass.

Not verified:
- the phone share sheet, on an actual device;
- demo mode redirecting the account screens: the journey's demo step didn't run.
