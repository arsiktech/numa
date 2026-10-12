export const AUTH_EMAIL_RATE_LIMIT = 3;
export const AUTH_EMAIL_GLOBAL_RATE_LIMIT = 100;
export const AUTH_EMAIL_RATE_WINDOW_MS = 15 * 60 * 1000;

export type AuthEmailKind = "verification" | "password-reset";

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashAuthEmail(email: string) {
  const bytes = new TextEncoder().encode(normalizeAuthEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function authEmailLimitExceeded(count: number, limit: number) {
  return count >= limit;
}
