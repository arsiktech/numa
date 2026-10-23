/** Bump when recipients or the disclosed processing scope changes. Permission is
 * optional and never inferred from authentication, old preferences or AI use. */
export const AI_SHARING_VERSION = "numa-ai-sharing-2026-10-21-v2";
export const AI_SHARING_DISCLOSURE = {
  title: "Choose whether to use AI",
  recipients: "Anthropic (Claude). The older web app also uses Vercel AI Gateway.",
  data: "In Numa Pro, your question, recent conversation and a summary of your selected space, including financial names, balances, debts, holdings, spending categories and net-worth history. The older web app can also send receipt images or transcripts you choose to submit.",
  purpose: "Answer questions and propose entries for your review. AI does not move money or save proposed entries without confirmation.",
  withdrawal: "You can turn AI sharing off in Settings. This blocks new authorizations; a request already authorized or in progress may finish, and data already sent cannot be recalled.",
  retention: "Providers process submitted data under their own policies. Numa does not promise zero retention or immediate deletion from provider logs or backups.",
  alternative: "Manual tracking and local answers stay available without AI sharing.",
  links: [
    { label: "Anthropic data retention", url: "https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data" },
    { label: "Vercel privacy for older clients", url: "https://vercel.com/legal/privacy-policy" },
  ],
} as const;
