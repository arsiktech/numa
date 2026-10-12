import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isCloudEnabled, useAuth } from "./auth";
import {
  getCurrentPushSubscription,
  getPushPermission,
  getVapidPublicKey,
  pushSupported,
  requestPushPermission,
  serializeSubscription,
  subscribeToPush,
  unsubscribeFromPush
} from "@/lib/push";

/**
 * React-side glue for the push lifecycle:
 *
 *   enable()  – ask permission, subscribe via the SW, mirror to Convex.
 *   disable() – unregister from Convex, then unsubscribe locally.
 *
 * Convex mutations are only callable from React, so this hook owns the
 * `useMutation` handles and exposes a pure async API to UI code.
 *
 * IMPORTANT: callers MUST only mount this hook when `isCloudEnabled` is true
 * — outside a `<ConvexProvider>`, `useMutation` throws. In local-only mode,
 * call `useLocalPushSync` instead (same API, no Convex round trips).
 */
export interface PushSyncState {
  /** Whether the browser supports the Web Push pipeline at all. */
  supported: boolean;
  /** Browser permission for Notifications. */
  permission: NotificationPermission;
  /** Whether a PushSubscription currently exists for this device. */
  enabled: boolean;
  /** Whether the VAPID public key is configured at build time. */
  configured: boolean;
  /** True while an enable/disable round trip is in flight. */
  busy: boolean;
}

export interface PushSyncControls extends PushSyncState {
  enable: () => Promise<{ ok: boolean; reason?: string }>;
  disable: () => Promise<{ ok: boolean }>;
}

function useBaseState() {
  const { currentAccount } = useAuth();
  const [state, setState] = useState<Omit<PushSyncState, "busy">>(() => ({
    supported: pushSupported(),
    permission: getPushPermission(),
    enabled: false,
    configured: Boolean(getVapidPublicKey())
  }));

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const sub = await getCurrentPushSubscription();
      if (cancelled) return;
      setState({
        supported: pushSupported(),
        permission: getPushPermission(),
        enabled: Boolean(sub),
        configured: Boolean(getVapidPublicKey())
      });
    }
    refresh();
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id]);

  return [state, setState] as const;
}

/**
 * Cloud-aware variant — registers/unregisters the device against Convex
 * on top of the local browser pipeline. Only mount this under a Convex
 * provider (i.e. when `isCloudEnabled`).
 */
export function usePushSync(): PushSyncControls {
  const { currentAccount } = useAuth();
  const registerMutation = useMutation(api.pushSubscriptions.register);
  const unregisterMutation = useMutation(api.pushSubscriptions.unregister);

  const [state, setState] = useBaseState();
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    if (!pushSupported()) return { ok: false, reason: "unsupported" };
    const vapid = getVapidPublicKey();
    if (!vapid) return { ok: false, reason: "not_configured" };
    setBusy(true);
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        setState((prev) => ({ ...prev, permission }));
        return { ok: false, reason: "denied" };
      }
      const sub = await subscribeToPush(vapid);
      if (!sub) return { ok: false, reason: "subscribe_failed" };
      const payload = serializeSubscription(sub);
      if (!payload) return { ok: false, reason: "invalid_subscription" };
      if (currentAccount) {
        try {
          await registerMutation(payload);
        } catch (err) {
          console.warn("[push] convex register failed", err);
        }
      }
      setState((prev) => ({ ...prev, permission: "granted", enabled: true }));
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [currentAccount, registerMutation, setState]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await getCurrentPushSubscription();
      const endpoint = sub?.endpoint;
      if (endpoint && currentAccount) {
        try {
          await unregisterMutation({ endpoint });
        } catch (err) {
          console.warn("[push] convex unregister failed", err);
        }
      }
      await unsubscribeFromPush();
      setState((prev) => ({ ...prev, enabled: false, permission: getPushPermission() }));
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [currentAccount, unregisterMutation, setState]);

  return { ...state, busy, enable, disable };
}

/**
 * Local-only variant — no Convex round trips. Used when cloud is disabled
 * so the toggle still works for showing local notifications without
 * trying to call mutations through a missing ConvexProvider.
 */
export function useLocalPushSync(): PushSyncControls {
  const [state, setState] = useBaseState();
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    if (!pushSupported()) return { ok: false, reason: "unsupported" };
    const vapid = getVapidPublicKey();
    if (!vapid) return { ok: false, reason: "not_configured" };
    setBusy(true);
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        setState((prev) => ({ ...prev, permission }));
        return { ok: false, reason: "denied" };
      }
      const sub = await subscribeToPush(vapid);
      if (!sub) return { ok: false, reason: "subscribe_failed" };
      setState((prev) => ({ ...prev, permission: "granted", enabled: true }));
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [setState]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setState((prev) => ({ ...prev, enabled: false, permission: getPushPermission() }));
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [setState]);

  return { ...state, busy, enable, disable };
}

/** Cheap check to pick the right hook from a calling component. */
export const cloudPushAvailable = isCloudEnabled;
