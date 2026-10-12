import { useState } from "react";

import {
  Bell,
  BellOff,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { Pill } from "@/components/ui/Pill";

import { useLocale } from "@/lib/i18n";

import {
  cloudPushAvailable,
  useLocalPushSync,
  usePushSync,
  type PushSyncControls
} from "@/services/pushSync";
import { LightSettingsRow } from "./Surfaces";
export function NotificationsSettingsRow({ onClick }: { onClick: () => void }) {
  return cloudPushAvailable ? (
    <CloudNotificationsRow onClick={onClick} />
  ) : (
    <LocalNotificationsRow onClick={onClick} />
  );
}

export function CloudNotificationsRow({ onClick }: { onClick: () => void }) {
  const sync = usePushSync();
  return <NotificationsRowInner sync={sync} onClick={onClick} />;
}

export function LocalNotificationsRow({ onClick }: { onClick: () => void }) {
  const sync = useLocalPushSync();
  return <NotificationsRowInner sync={sync} onClick={onClick} />;
}

export function NotificationsRowInner({
  sync,
  onClick
}: {
  sync: PushSyncControls;
  onClick: () => void;
}) {
  const value =
    sync.permission === "denied" ? "Blocked" : sync.enabled ? "On" : "Off";
  return (
    <LightSettingsRow
      icon={<Bell size={16} />}
      label="Notifications"
      value={value}
      onClick={onClick}
    />
  );
}

export function CloudNotificationsCard() {
  const sync = usePushSync();
  return <NotificationsCard sync={sync} />;
}

export function LocalNotificationsCard() {
  const sync = useLocalPushSync();
  return <NotificationsCard sync={sync} />;
}

export function NotificationsCard({ sync }: { sync: PushSyncControls }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const { t } = useLocale();

  async function handleEnable() {
    setFeedback(null);
    const result = await sync.enable();
    if (!result.ok) {
      const reason = result.reason;
      const message =
        reason === "denied"
          ? t("settings.pushDenied")
          : reason === "not_configured"
          ? t("settings.pushNotConfigured")
          : reason === "unsupported"
          ? t("settings.pushUnsupportedShort")
          : reason === "subscribe_failed"
          ? t("settings.pushSubscribeFailed")
          : reason === "invalid_subscription"
          ? t("settings.pushInvalidSubscription")
          : t("settings.somethingWrong");
      setFeedback(message);
    }
  }

  async function handleDisable() {
    setFeedback(null);
    await sync.disable();
  }

  const permissionLabel: Record<NotificationPermission, string> = {
    granted: t("settings.permissionAllowed"),
    denied: t("settings.permissionBlocked"),
    default: t("settings.permissionNotAsked")
  };
  const permissionTone: Record<
    NotificationPermission,
    "positive" | "warning" | "neutral"
  > = {
    granted: "positive",
    denied: "warning",
    default: "neutral"
  };

  return (
    <Card id="settings-notification-controls">
      <CardHeader
        title={t("settings.notificationsTitle")}
        subtitle={t("settings.notificationsSubtitle")}
      />
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-[color:var(--color-ink-3)]">
            <span>{t("settings.browserPermission")}</span>
            <Pill tone={permissionTone[sync.permission]}>
              {permissionLabel[sync.permission]}
            </Pill>
            {sync.enabled ? <Pill tone="positive">{t("settings.thisDevice")}</Pill> : null}
          </div>
        </div>
        {!sync.supported ? (
          <p className="text-[13px] text-[color:var(--color-ink-4)]">
            {t("settings.pushUnsupported")}
          </p>
        ) : !sync.configured ? (
          <p className="text-[13px] text-[color:var(--color-ink-4)]">
            {t("settings.pushNotConfigured")}
            <code className="mx-1 rounded bg-[color:var(--color-cream-100)] px-1 py-0.5 text-[12px]">
              VITE_NUMA_PUSH_VAPID_PUBLIC
            </code>
            {t("settings.pushNotConfiguredAfter")}
          </p>
        ) : sync.permission === "denied" ? (
          <p className="text-[13px] text-[color:var(--color-ink-4)]">
            {t("settings.pushBlocked")}
          </p>
        ) : sync.enabled ? (
          <Button variant="secondary" onClick={handleDisable} disabled={sync.busy}>
            <BellOff size={14} />
            {sync.busy ? t("settings.disabling") : t("settings.disablePush")}
          </Button>
        ) : (
          <Button variant="primary" onClick={handleEnable} disabled={sync.busy}>
            <Bell size={14} />
            {sync.busy ? t("settings.enabling") : t("settings.enablePush")}
          </Button>
        )}
        {feedback ? (
          <p className="text-[12px] text-[color:var(--color-ink-4)]">{feedback}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Webhooks                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Renders only when the user is signed into a cloud account AND has at least
 * one cloud portfolio they can edit. Lists existing tokens, lets them mint a
 * new one (raw secret shown once, copy-to-clipboard), and revokes individual
 * tokens. The raw secret is never re-derivable — that's the security model.
 */
