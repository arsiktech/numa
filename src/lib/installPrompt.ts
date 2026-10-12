/**
 * Contextual PWA install moment.
 *
 * Chromium fires `beforeinstallprompt` early in the page lifecycle and offers
 * its own mini-infobar unless we intercept it. We capture the event here (from
 * main.tsx, before React mounts), suppress the browser UI, and replay the
 * prompt later from <InstallBanner /> once the user has shown up for a third
 * session — an install ask that lands after habit, not before it. iOS never
 * fires the event, so the banner falls back to a "Add to Home Screen" hint.
 *
 * Persistence (all under the `numa:` localStorage namespace, all best-effort):
 *   numa:install:sessions   distinct app loads, bumped once per module load
 *   numa:install:dismissed  user closed the banner / declined the prompt
 *   numa:install:done       browser reported `appinstalled` or prompt accepted
 */

// `BeforeInstallPromptEvent` is Chromium-only and absent from lib.dom — type
// the slice we use locally.
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export interface InstallState {
  /** A deferred Chromium prompt is stashed and ready to replay. */
  canPrompt: boolean;
  /** iPhone / iPad / iPod — show the manual Add to Home Screen hint. */
  isIos: boolean;
  /** sessions ≥ 3, not dismissed, not installed, not already standalone. */
  eligible: boolean;
}

const SESSIONS_KEY = "numa:install:sessions";
const DISMISSED_KEY = "numa:install:dismissed";
const DONE_KEY = "numa:install:done";
const SESSIONS_BEFORE_NUDGE = 3;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureStarted = false;
let sessionBumped = false;
let snapshot: InstallState | null = null;
const subscribers = new Set<() => void>();

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    /* localStorage blocked (private mode, etc.) */
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* swallow — the nudge just won't persist its state */
  }
}

/** Already running as an installed app (Chromium standalone or iOS web app). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* matchMedia unavailable — fall through to the iOS flag */
  }
  // iOS Safari's non-standard flag for home-screen web apps.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports itself as macOS, but it's the only "Mac" with touch.
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

function sessionCount(): number {
  const parsed = Number.parseInt(readStorage(SESSIONS_KEY) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function computeState(): InstallState {
  const dismissed = readStorage(DISMISSED_KEY) !== null;
  const done = readStorage(DONE_KEY) !== null;
  return {
    canPrompt: deferredPrompt !== null,
    isIos: isIosDevice(),
    eligible:
      sessionCount() >= SESSIONS_BEFORE_NUDGE && !dismissed && !done && !isStandalone()
  };
}

function notify(): void {
  snapshot = computeState();
  for (const cb of subscribers) cb();
}

/** Stable snapshot for useSyncExternalStore — only re-created on notify(). */
export function getInstallState(): InstallState {
  snapshot ??= computeState();
  return snapshot;
}

export function subscribeInstallPrompt(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Start listening for the install lifecycle. Call once, as early as possible
 * (before React mounts) — Chromium can fire `beforeinstallprompt` before the
 * first render, and a missed event means no in-app install button this visit.
 */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined" || captureStarted) return;
  captureStarted = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's own mini-infobar; we choose the moment instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    writeStorage(DONE_KEY, "1");
    deferredPrompt = null;
    notify();
  });
}

/** Count this page load as a session — guarded to once per module load. */
export function bumpInstallSession(): void {
  if (sessionBumped || typeof window === "undefined") return;
  sessionBumped = true;
  writeStorage(SESSIONS_KEY, String(sessionCount() + 1));
  notify();
}

/** Replay the stashed Chromium prompt and persist the user's verdict. */
export async function promptInstall(): Promise<void> {
  const event = deferredPrompt;
  if (!event) return;
  // A BeforeInstallPromptEvent is single-use; drop it before prompting.
  deferredPrompt = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      writeStorage(DONE_KEY, "1");
    } else {
      writeStorage(DISMISSED_KEY, "1");
    }
  } catch {
    /* prompt() throws if already consumed or not user-gesture bound — no-op */
  }
  notify();
}

/** User closed the banner — never show it again. */
export function dismissInstall(): void {
  writeStorage(DISMISSED_KEY, "1");
  notify();
}
