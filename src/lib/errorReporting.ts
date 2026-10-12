import { api } from "../../convex/_generated/api";
import { convex } from "@/services/auth";
import { APP_VERSION } from "./version";
import { privateDiagnostic } from "../../convex/lib/diagnosticPrivacy";

/**
 * Minimal production error telemetry. Reports crashes to the `clientErrors`
 * Convex table (viewed in the Convex dashboard) so client-side breakage is
 * visible without waiting for a user to file a report.
 *
 * Design constraints, in order: never make things worse (reporting must not
 * throw, loop, or spam), zero new vendors (rides the existing Convex
 * deployment, same EU region as the data), and dumb-simple to replace with
 * Sentry later — call sites only know `reportError` / `installErrorReporting`.
 */

export type ErrorSource = "boundary" | "window" | "promise" | "route" | "manual";

/** Noise that is not actionable and would only churn the table. */
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i
];

const MAX_REPORTS_PER_SESSION = 25;
/** Identical errors are re-reported at most this often (dedupe still counts them server-side). */
const PER_FINGERPRINT_COOLDOWN_MS = 30_000;

export interface ReporterState {
  sentTotal: number;
  lastSentByFingerprint: Map<string, number>;
}

export function createReporterState(): ReporterState {
  return { sentTotal: 0, lastSentByFingerprint: new Map() };
}

/** djb2 over message+source — stable, tiny, good enough for grouping. */
export function errorFingerprint(message: string, source: string): string {
  const input = `${source}:${normalizeMessage(message)}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `e${(hash >>> 0).toString(36)}`;
}

/**
 * Collapse the variable parts of common messages (ids, urls, numbers) so the
 * same logical error groups under one fingerprint.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8,}/gi, "<hex>")
    .replace(/\d{3,}/g, "<n>")
    .slice(0, 300);
}

export function describeUnknownError(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: `${value.name}: ${value.message}`, stack: value.stack ?? undefined };
  }
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value).slice(0, 300) };
  } catch {
    return { message: String(value) };
  }
}

export function shouldReport(
  state: ReporterState,
  fingerprint: string,
  message: string,
  now: number
): boolean {
  if (IGNORED_PATTERNS.some((pattern) => pattern.test(message))) return false;
  if (state.sentTotal >= MAX_REPORTS_PER_SESSION) return false;
  const last = state.lastSentByFingerprint.get(fingerprint);
  if (last !== undefined && now - last < PER_FINGERPRINT_COOLDOWN_MS) return false;
  return true;
}

/** Current page without query/hash — those can carry tokens or PII. */
function safeUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return `${window.location.origin}${window.location.pathname}`;
  } catch {
    return undefined;
  }
}

const state = createReporterState();

export function reportError(value: unknown, source: ErrorSource): void {
  try {
    if (!convex) return; // cloud not configured (tests, local-only) — no-op
    const { message } = describeUnknownError(value);
    const diagnostic = privateDiagnostic({ source, message, url: safeUrl(), release: APP_VERSION });
    const fingerprint = diagnostic.fingerprint;
    const now = Date.now();
    if (!shouldReport(state, fingerprint, message, now)) return;
    state.sentTotal += 1;
    state.lastSentByFingerprint.set(fingerprint, now);
    void convex
      .mutation(api.clientErrors.report, {
        ...diagnostic,
        source,
      })
      .catch(() => {
        /* telemetry must never cascade */
      });
  } catch {
    /* never throw from the reporter */
  }
}

let installed = false;

/** Global handlers for errors nothing else caught. Safe to call once at boot. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, "window");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "promise");
  });
}
