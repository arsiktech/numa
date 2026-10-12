import { getRequestAIIdentity } from "./auth.js";

export async function requireAISharing(
  request: { headers?: Record<string, string | string[] | undefined> },
  response: { status(code: number): { json(body: unknown): void } },
): Promise<string | null> {
  const identity = await getRequestAIIdentity(request);
  if (identity.state === "allowed") return identity.userId;
  const code = identity.state === "signed-out" ? 401 : identity.state === "consent-required" ? 403 : 503;
  const error = identity.state === "signed-out" ? "Sign in to use AI."
    : identity.state === "consent-required" ? "AI sharing is off. Review AI sharing in Settings before using AI. Manual tracking remains available."
      : "AI sharing permission could not be verified. No data was sent to the AI provider. Try again later.";
  response.status(code).json({ code: identity.state === "consent-required" ? "AI_SHARING_REQUIRED" : "AI_ACCESS_UNAVAILABLE", error });
  return null;
}
