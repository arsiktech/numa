export const FEEDBACK_MAX = 2000;
export type FeedbackKind = 'idea' | 'problem' | 'other';
export const FEEDBACK_KINDS: [FeedbackKind, string][] = [['idea', 'Idea'], ['problem', 'Problem'], ['other', 'Other']];

/** True when the text is worth sending: something besides spaces, and within the limit the server enforces. */
export function canSendFeedback(message: string): boolean {
  const n = message.trim().length;
  return n > 0 && n <= FEEDBACK_MAX;
}

/** One id per open form, so a retry after a dropped connection never saves the message twice. */
export function newFeedbackId(): string {
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
