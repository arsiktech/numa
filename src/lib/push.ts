/**
 * Web Push helpers for the Numa client.
 *
 * Registers /push-sw.js (a dedicated push worker — NOT the PWA app-shell
 * worker that vite-plugin-pwa generates) and exposes a small typed API
 * for subscribing, unsubscribing, and showing local notifications.
 *
 * The VAPID public key comes from VITE_NUMA_PUSH_VAPID_PUBLIC at build time.
 */

const PUSH_SW_URL = "/push-sw.js";

/**
 * Read the VAPID public key compiled into the bundle by Vite.
 * Returns null when unset so callers can short-circuit cleanly.
 */
export function getVapidPublicKey(): string | null {
  const raw = (import.meta.env.VITE_NUMA_PUSH_VAPID_PUBLIC as string | undefined) ?? "";
  return raw.trim() ? raw.trim() : null;
}

/** Shape we serialise into Convex (mirrors PushSubscription.toJSON()). */
export interface SerializedPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/**
 * Best-effort serialize. Returns null if the subscription is missing the keys
 * web-push needs to encrypt the payload (which would mean we'd just fail
 * server-side anyway).
 */
export function serializeSubscription(
  sub: PushSubscription
): SerializedPushSubscription | null {
  const json = sub.toJSON();
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  return { endpoint, p256dh, auth, userAgent };
}

export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "default";
  }
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
    if (existing) {
      await navigator.serviceWorker.ready;
      return existing;
    }
    const registration = await navigator.serviceWorker.register(PUSH_SW_URL, {
      scope: "/"
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    console.warn("[push] failed to register push worker");
    return null;
  }
}

export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  if (!vapidPublicKey) return null;

  const registration = await registerPushWorker();
  if (!registration) return null;

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast to BufferSource for TS lib compatibility — Uint8Array is a valid BufferSource at runtime.
      applicationServerKey: applicationServerKey as unknown as BufferSource
    });
    return subscription;
  } catch {
    console.warn("[push] subscribe failed");
    return null;
  }
}

/** Read the current push subscription without subscribing if absent. */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(PUSH_SW_URL)) ?? null;
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    return await subscription.unsubscribe();
  } catch {
    console.warn("[push] unsubscribe failed");
    return false;
  }
}

export async function showLocalNotification(_title: string, _body: string): Promise<void> {
  // Preserve caller compatibility without exposing private preview content.
  void _title; void _body;
  if (!pushSupported()) return;
  if (getPushPermission() !== "granted") return;
  const registration = await registerPushWorker();
  if (!registration) return;
  try {
    await registration.showNotification("Numa Pro", {
      body: "Your update is ready. Open Numa Pro to view it.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/" }
    });
  } catch {
    console.warn("[push] showLocalNotification failed");
  }
}

/**
 * Decode a URL-safe base64 VAPID public key into a Uint8Array, which is
 * the shape `pushManager.subscribe` expects for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");

  const atob = typeof globalThis !== "undefined" && typeof (globalThis as { atob?: (s: string) => string }).atob === "function"
    ? (globalThis as { atob: (s: string) => string }).atob
    : null;
  const raw = atob ? atob(normalized) : "";

  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
