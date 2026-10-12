/**
 * Single source of truth for the Vercel AI Gateway model slug used by every
 * Numa AI feature (chat, receipt/voice parsing).
 *
 * Was "anthropic/claude-sonnet-4.5", which the gateway returned
 * GatewayInternalServerError for on every request — chat masked it (the
 * streamed 200 status is sent before the mid-stream error, so the client got
 * 200 with an empty body) and receipt scan surfaced it as a 502. Moved to the
 * current Sonnet (4.6); keeping both routes on one constant prevents drift.
 */
export const AI_GATEWAY_MODEL = "anthropic/claude-sonnet-4.6";
