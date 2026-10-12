export function emailSignInErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /InvalidSecret|InvalidAccountId|Invalid credentials|TooManyFailedAttempts/i.test(
      message
    ) ||
    /\bA\(auth:signIn\)\b/i.test(message) ||
    /auth:signIn/i.test(message)
  ) {
    return fallback;
  }
  return message || fallback;
}
