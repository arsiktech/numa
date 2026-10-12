import { LegalShell } from "./LegalShell";

const SECTIONS = [
  {
    title: "What Numa Pro is",
    body:
      "Numa Pro helps you record, review, and understand personal and shared financial information. You are responsible for the accuracy of entries, exports, automations, and any decisions you make based on the app."
  },
  {
    title: "No regulated financial service",
    body:
      "Numa Pro does not move money, custody assets, provide banking services, or give investment, tax, or legal advice. Market data, AI suggestions, and recaps are informational and can be wrong or delayed — verify before acting."
  },
  {
    title: "Your account",
    body:
      "Keep your credentials to yourself and tell us if you suspect misuse. You can change your password, export the records currently supported by Numa Pro, and request permanent account deletion from Settings. Established accounts have a seven-day grace period during which deletion can be cancelled; after the deletion job starts, recovery is not guaranteed."
  },
  {
    title: "Shared spaces",
    body:
      "When you invite people to pods or shared portfolios, they can see the information added there. Only invite people you trust, and check shared balances before settling money outside Numa Pro — settlement summaries are a calculation aid, not a payment instruction."
  },
  {
    title: "AI assistance",
    body:
      "AI features produce drafts that you must confirm before anything is written to your data. They run within fair-use limits (per-user and shared daily caps) and may be unavailable when those limits are reached. Don't rely on AI output without checking it."
  },
  {
    title: "Availability",
    body:
      "Numa Pro is evolving and provided as-is. Features may change, fail, or be removed, and availability is not guaranteed. We keep data portable with exports — keep independent records for anything critical."
  },
  {
    title: "Acceptable use",
    body:
      "Do not use Numa Pro to store unlawful content, attack or overload the service or its providers, probe other people's data, resell access, or submit data you have no right to process. We may suspend accounts that put other users or the service at risk."
  },
  {
    title: "Privacy",
    body:
      "How data is stored, which providers process it, and your GDPR rights are described on the Privacy page. Using Numa Pro means you're okay with what's written there."
  },
  {
    title: "Changes and contact",
    body:
      "These terms may be updated as Numa Pro grows; the date below reflects the latest revision, and continued use after a change means acceptance. Questions, requests, or problems: support@example.com."
  }
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms"
      title="Terms of use"
      subtitle="Simple, honest rules for using Numa Pro as a personal capital system."
      sections={SECTIONS}
      lastUpdated="July 26, 2026"
    />
  );
}
