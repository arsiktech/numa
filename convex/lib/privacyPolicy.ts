/** Bump when recipients or the disclosed processing scope changes. Consent is
 * optional and never inferred from authentication, old preferences or AI use. */
export const AI_SHARING_VERSION = "numa-ai-sharing-2026-09-12-v1";
export const AI_SHARING_DISCLOSURE = {
  title: "Choose whether to use AI",
  recipients: "Vercel AI Gateway and Anthropic",
  data: "Your questions, conversation, selected-space financial context and categories, and any receipt image or transcript you choose to submit.",
  purpose: "Answer financial questions and propose entries for your review. AI does not move money or save proposed entries without confirmation.",
  withdrawal: "You can withdraw permission in Settings. This blocks new AI processing requests; it cannot recall data already sent or stop a request already in progress.",
  retention: "Numa keeps confirmed records and AI review history in your account. Providers process submitted data under their own policies; Numa does not promise zero retention or immediate deletion from provider logs or backups.",
  alternative: "Manual tracking stays available without AI sharing.",
  links: [
    { label: "Vercel privacy", url: "https://vercel.com/legal/privacy-policy" },
    { label: "Anthropic privacy", url: "https://www.anthropic.com/legal/privacy" },
  ],
} as const;
