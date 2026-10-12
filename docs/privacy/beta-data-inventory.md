# Numa Pro beta privacy: implementation and open gates

ARS-97 candidate, based on `09a2375f8b9b5d0ed752b639709660a8ff22c85c`.
This technical inventory is not legal advice, a compliance certification, or
proof of deployment. The delivery record must identify the final source and
actual deployed candidate.

## Data flows and retention

| Category | Implementation | Retention and erasure |
| --- | --- | --- |
| Identity, profile, preferences | Convex Auth, users and profiles; native device-only Keychain | Real accounts have a seven-day cancellation window, then a bounded database cascade. Profileless accounts receive the same durable marker. Reserved QA accounts use immediate deletion. |
| Passwords and sessions | Convex Auth 0.0.94 and Scrypt | Owned sessions, refresh tokens, verifier challenges, accounts and verification codes are drained. External provider authorization is separate. |
| Financial records and AI reviews | Portfolios, transactions/transfers, ledger, assets, liabilities, holdings, recurring schedules, goals and review drafts | Owned scopes are cascaded. Other owners' shared financial history remains. Pod member names and login links are removed while participant/group IDs preserve balances. Shared notes or context may still identify people. No legal-retention exception is asserted. |
| Profile photos | New browser path creates a metadata-stripped 256px PNG, at most 300 KiB, in owner-indexed `profileAvatars` | Replacement, clear and account deletion remove owned thumbnail bytes. Legacy upload/assignment endpoints are disabled. Ambiguous legacy storage and previously issued upload URLs still require ownership investigation. |
| AI submissions | Chat, receipt and transcript requests pass through Vercel API, Vercel AI Gateway and Anthropic | Versioned opt-in precedes provider calls. Withdrawal blocks new requests, not processing already underway. Actual provider log/backup retention is unverified. Merchant-art generation is disabled; legacy image caches are not swept. |
| Email | Resend when configured | Verification/reset requests disclose recipient and code to the provider. Provider retention is unverified. |
| OAuth | Conditional Google/Apple providers; native ASWebAuthenticationSession | Apple is currently disabled in both observed targets. Historical Apple accounts are not yet inventoried. The SDK does not retain external access/refresh tokens; Apple-token revocation is not implemented. Do not enable or release Apple sign-in before resolving this gate. |
| Market and optional wallet/location requests | Existing price/FX sources, Moralis and browser Nominatim | Requests may include tickers, currencies, public wallet addresses or optional coordinates, never private wallet keys. Existing cache/provider policies remain; no new connection is introduced by ARS-97. |
| Browser diagnostics | Categorical error/source, allowlisted route, bounded release and counts | New reports omit raw messages, stacks, user agents and user IDs. A 500-distinct-record cap evicts oldest records. Historical reports may contain personal data. |
| App abuse counters | Hashed identities in `rateLimitBuckets` | New records expire after the enforcement window plus 24 hours. A growing enforcement window extends its stamped expiry. Hourly bounded cleanup drains expired stamped records. Legacy unstamped records remain; expiry is not proof of completed backup erasure. |
| SDK abuse counters | Account-ID password buckets; email/phone OTP buckets | The exact owned password-account bucket is removed. OTP/email/phone records are not uniquely account-owned and are not blanket-deleted. The pinned SDK refills counters logically but has no automatic age expiry. |
| Push notifications | Opt-in subscription endpoints and encryption keys | Account deletion removes stored subscriptions. Sender, local helper and worker use generic text and the root URL; worker ignores old queued payload content. Already delivered notifications are not recalled. No native APNs sender was found in this source audit. |
| Local caches and exports | Web preferences/chat/recovery queues; native memory/Keychain; user-selected JSON files | Existing account-scoped cleanup remains. Avatar bytes are excluded from durable web auth cache. Export preparation clears state on cancellation or account/space change. Externally saved files are outside account deletion. |

## Read-only configuration observations

On 2026-09-12, public `authConfig:flags` returned:

- DEV `https://rosy-mink-170.eu-west-1.convex.cloud`: Apple off, Google on,
  email verification off, password reset off.
- PROD `https://fine-quail-653.convex.cloud`: Apple off, Google on,
  email verification on, password reset on.

These reads did not invoke providers or mutate configuration. They do not prove
historical Apple accounts absent, provider retention, processing residency, or
ARS-97 delivery. The existing support address is `support@example.com`; the
privacy route is `/privacy`. No support message was sent.

## Financial export contract

The selected-space JSON manifest contains 18 sections. It preserves liabilities,
original currencies, date units, source IDs, classification, reversals, transfer
tombstones and the current user's AI review payload. Non-JSON Convex values use
lossless `$bytes`, `$integer` and `$float` tags. Financial representations must
not be added together: ledger rows, operational records and snapshots overlap.

Every page and the final file handoff require current account/space access.
Other members' private AI drafts are excluded. Shared financial participant IDs
remain for reconciliation. This live paginated copy is not a frozen accounting
close or an all-account portability package. Other spaces, `/pod`, account
settings, raw attachments, provider logs and credentials are explicitly outside
its scope. Existing web CSV behavior is unchanged.

### Compatibility provenance

ARS-89 already stores `cashTransfers` separately from transactions and ledger.
ARS-97 copies that existing table definition for typed export/deletion support,
adds a creation-order export index and includes all rows, including tombstones.
It does not change capture behavior or complete/retest capped ARS-89 work.
The integration stage must also preserve existing ARS-93 Wealth fields and APIs.
The 18-section backend manifest must be paired with the updated native collector;
a previous strict 17-section collector rejects it rather than saving a partial file.

## Remaining gates

1. Verify paired DEV consent, avatar ownership, export pagination/file handoff
   and deletion/scheduler behavior with disposable QA identities. Complete the
   required full gate, scoped commit/push and applicable beta delivery.
2. Inventory legacy storage, historical Apple accounts, old diagnostics,
   legacy/SDK counters and actual provider log/backup policies. Do not execute
   broad cleanup or change credentials/providers without exact authorization.
3. Resolve shared-history retention, legal entity and public-country policy
   with the owner under ARS-108; do not invent lawful exceptions.
4. Reconcile the privacy manifest and in-app/web disclosures against the exact
   release candidate and deployed backend before inviting testers.

## Primary references checked on 2026-09-12

- [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app):
  in-app initiation, transparent timing and Apple-token revocation when applicable.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  privacy and third-party data sharing.
- [Convex pagination](https://docs.convex.dev/database/pagination): cursor
  continuation and read limits; split-required pages must not be claimed complete.
