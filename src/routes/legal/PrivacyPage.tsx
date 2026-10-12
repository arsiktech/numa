import { LegalShell } from "./LegalShell";

/**
 * Kept deliberately accurate to the real architecture: every processor named
 * here is one the app actually calls (Convex EU, Vercel, Google/Apple OAuth, the
 * Vercel AI Gateway → Anthropic for AI features, Resend for reset emails when
 * enabled, OpenStreetMap Nominatim for optional place lookups). If a data
 * flow changes in code, change this page in the same PR.
 */
const SECTIONS = [
  {
    title: "What Numa Pro stores",
    body:
      "Your account email and display name, plus everything you create in the app: portfolios, transactions, categories, budgets, assets, liabilities, holdings, goals, shared pots and their expenses, settlements, preferences, and AI action drafts you chose to keep. If you track a public crypto wallet, Numa Pro also stores that public address and its last successful token and DeFi snapshot."
  },
  {
    title: "Where it lives",
    body:
      "Product records are stored in Convex. The web app and API functions are hosted by Vercel. These services process the data needed to run Numa; provider logs, backups and processing locations depend on their configured services and policies. This overview does not assert independently verified regional residency for every data flow."
  },
  {
    title: "Sign-in",
    body:
      "Email + password sign-in is handled by Convex Auth — passwords are stored only as secure hashes, never in plain text. If you choose Google or Apple sign-in, that provider shares the account details you approve with Numa Pro. Password-reset and verification codes, when enabled, are delivered by the email provider Resend."
  },
  {
    title: "AI sharing is optional and controlled",
    body:
      "Before using AI, review and approve the sharing disclosure. Your submitted question, conversation, receipt image or transcript and selected-space financial context go through Vercel AI Gateway to Anthropic. You can withdraw permission in Settings to block new requests; withdrawal cannot recall data already sent or stop a request already in progress. Manual tracking remains available without AI. AI suggestions require your confirmation before financial changes are saved. Automatic merchant-art generation is disabled."
  },
  {
    title: "Other lookups",
    body:
      "Market prices and currency rates are fetched through Numa Pro's own API using only ticker symbols and currency codes — never your balances. After you choose to track a public crypto wallet, Numa Pro periodically sends that public address through its API to Moralis to refresh supported on-chain token and, when enabled, DeFi positions; seed phrases and private keys are never requested or sent. If you attach a location to a transaction, the coordinates are sent to OpenStreetMap's Nominatim service to find the place name. Web-push subscriptions are stored only if you turn notifications on."
  },
  {
    title: "Crash telemetry, no analytics",
    body:
      "New browser crash reports retain only categorical error type, an allowlisted route, release version, counts and timestamps in Numa's database. Raw messages, stacks, browser details and account IDs are discarded. Older reports may have retained more detail and require separate cleanup; we do not claim they never contained personal data. No advertising or third-party analytics SDK is configured in this app."
  },
  {
    title: "On your device",
    body:
      "The browser keeps UI preferences, onboarding markers, caches (prices, rates), your chat history, and a queue of unsynced writes in local storage. Signing out or deleting the account clears the account-scoped parts."
  },
  {
    title: "Your rights and controls",
    body:
      "On iOS, Settings exports the selected space's full stored financial history as JSON, including liabilities, ledger and your AI review provenance. The file lists its scope, excluded data and page read times: it is not a frozen accounting close or an all-account package. Existing browser CSV exports remain available. For a complete access or portability request, contact support@example.com. Delete account in Settings starts a seven-day deletion grace period for real accounts, including accounts without a profile. You can cancel before destructive deletion starts. Reserved disposable QA accounts may be erased immediately. Copies you save outside Numa are not deleted with your account."
  },
  {
    title: "Retention",
    body:
      "Account data is kept while your account exists and during the recovery window. Afterward, bounded jobs remove your owned spaces, account records, sessions, AI reviews and new profile-photo thumbnails. Shared financial history held by other space/pod owners can remain; pod account links and profile labels are removed without changing outstanding balances. This does not guarantee that shared notes or context are anonymous. Ambiguous legacy photo files and historical operational data require separate cleanup. No automatic external-provider token revocation or blanket provider erasure is claimed."
  },
  {
    title: "Abuse protection and provider retention",
    body: "New application rate-limit counters expire after their enforcement window plus one day and are removed by bounded cleanup jobs. Legacy counters and SDK email/phone throttles are not automatically swept; password counters tied to a deleted auth account are removed. Provider logs, backups and previously submitted AI data follow provider policies and configured retention. Exact provider retention periods and legacy cleanup are not yet independently verified; we do not promise zero retention. No legal-retention exception has been asserted or approved by this technical overview."
  },
  {
    title: "Photos and notification previews",
    body: "New browser profile photos are cropped locally to a small thumbnail and metadata is removed before saving. The original photo is not uploaded for this profile-photo feature. Receipt images are a separate, consent-controlled AI submission. Notification previews are generic: open Numa to see details. Amounts, names, descriptions and private deep links are not included in new push previews. Already-delivered notifications and copies outside Numa remain outside account deletion."
  }
];

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Privacy"
      title="Privacy overview"
      subtitle="What Numa Pro stores, exactly which services touch it, and the controls you have — written to match how the app is actually built."
      sections={SECTIONS}
      lastUpdated="October 4, 2026"
    />
  );
}
