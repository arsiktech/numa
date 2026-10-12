/** SDK errors can contain prompts, images, headers and full request bodies.
 * Keep only a bounded HTTP status and a known class, never message/stack/cause. */
export function safeProviderError(error: unknown) {
  const known = new Set(["AI_APICallError", "AI_RetryError", "AI_NoObjectGeneratedError", "AI_NoImageGeneratedError", "AbortError", "TimeoutError"]);
  try {
    const value = error as { name?: unknown; statusCode?: unknown } | null;
    const kind = typeof value?.name === "string" && known.has(value.name) ? value.name : "ProviderError";
    const status = typeof value?.statusCode === "number" && Number.isInteger(value.statusCode) && value.statusCode >= 400 && value.statusCode <= 599 ? value.statusCode : null;
    return { kind, status };
  } catch { return { kind: "ProviderError", status: null }; }
}
