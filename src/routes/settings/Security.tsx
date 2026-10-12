import { useEffect, useState } from "react";

import { useAction, useQuery } from "convex/react";
import {
  Apple,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { Pill } from "@/components/ui/Pill";
import { Dialog, Field, TextInput } from "@/components/ui/Dialog";

import { useLocale } from "@/lib/i18n";
import { validatePasswordPolicy } from "../../../convex/lib/passwordPolicy";
import { localizePasswordPolicyIssues } from "@/lib/passwordPolicyText";
import { api } from "../../../convex/_generated/api";

import { errorMessage } from "./shared";
export function SecurityCard({
  accountEmail,
  accountDisplayName,
  onLinkProvider
}: {
  accountEmail?: string | null;
  accountDisplayName?: string | null;
  onLinkProvider: (provider: "google" | "apple") => Promise<void>;
}) {
  const { locale, t } = useLocale();
  const methods = useQuery(api.authManagement.methods);
  const changePassword = useAction(api.authManagement.changePassword);
  const sessions = useQuery(api.authManagement.listSessions);
  const signOutOtherSessions = useAction(api.authManagement.signOutOtherSessions);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<null | "password" | "apple" | "google" | "sessions">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canChangePassword = methods?.hasPassword === true;
  const googleReady = methods?.googleAvailable === true;
  const googleConnected = methods?.hasGoogle === true;
  const appleReady = methods?.appleAvailable === true;
  const appleConnected = methods?.hasApple === true;

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!canChangePassword) {
      setError(t("settings.passwordUnavailable"));
      return;
    }
    const policy = validatePasswordPolicy(newPassword, {
      email: accountEmail,
      displayName: accountDisplayName
    });
    if (!policy.ok) {
      setError(localizePasswordPolicyIssues(policy.issues, t).join(" "));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("settings.passwordMismatch"));
      return;
    }
    setBusy("password");
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(t("settings.passwordChanged"));
    } catch (err) {
      setError(errorMessage(err, t("settings.passwordChangeError")));
    } finally {
      setBusy(null);
    }
  }

  const newPasswordPolicy = validatePasswordPolicy(newPassword, {
    email: accountEmail,
    displayName: accountDisplayName
  });
  const newPasswordIssues = localizePasswordPolicyIssues(newPasswordPolicy.issues, t);

  async function connectProvider(provider: "apple" | "google") {
    setError(null);
    setMessage(null);
    const ready = provider === "apple" ? appleReady : googleReady;
    const connected = provider === "apple" ? appleConnected : googleConnected;
    if (!ready || connected) return;
    setBusy(provider);
    try {
      await onLinkProvider(provider);
    } catch (err) {
      setError(errorMessage(err, t(provider === "apple" ? "settings.appleConnectError" : "settings.googleConnectError")));
      setBusy(null);
    }
  }

  async function signOutOthers() {
    setError(null);
    setMessage(null);
    setBusy("sessions");
    try {
      await signOutOtherSessions({});
      setMessage(t("settings.signOutOtherDevicesDone"));
    } catch (err) {
      setError(errorMessage(err, t("settings.signOutOtherDevicesError")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="settings-security-controls">
      <CardHeader
        title={t("settings.securityTitle")}
        subtitle={t("settings.securitySubtitle")}
      />
      <CardBody className="space-y-5">
        <form onSubmit={submitPassword} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
                {t("settings.passwordTitle")}
              </p>
              <p className="text-[12px] text-[color:var(--color-ink-3)]">
                {/* While the methods query is still loading, show the neutral
                    subtitle — not the "unavailable" copy — so password users
                    don't see a misleading flash (QA 2026-06-24). */}
                {canChangePassword || methods === undefined
                  ? t("settings.passwordSubtitle")
                  : t("settings.passwordUnavailable")}
              </p>
            </div>
            <ShieldCheck size={18} className="shrink-0 text-[color:var(--color-ink-3)]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder={t("settings.currentPassword")}
              autoComplete="current-password"
              disabled={!canChangePassword || busy === "password"}
            />
            <TextInput
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t("settings.newPassword")}
              autoComplete="new-password"
              disabled={!canChangePassword || busy === "password"}
            />
            <TextInput
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t("settings.confirmPassword")}
              autoComplete="new-password"
              disabled={!canChangePassword || busy === "password"}
            />
          </div>
          {newPassword ? (
            <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-3 py-2 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
              {newPasswordPolicy.ok ? (
                <p className="font-semibold text-[color:var(--color-brand)]">
                  {t("passwordPolicy.ok")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {newPasswordIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            disabled={
              !canChangePassword ||
              busy === "password" ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              !newPasswordPolicy.ok
            }
            className="w-full sm:w-auto"
          >
            {busy === "password" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {t("settings.changePassword")}
          </Button>
        </form>

        {[
          {
            provider: "apple" as const,
            title: t("settings.appleTitle"),
            subtitle: appleConnected
              ? t("settings.appleConnected")
              : appleReady
                ? t("settings.appleSubtitle")
                : t("settings.appleUnavailable"),
            connected: appleConnected,
            ready: appleReady,
            cta: t("settings.connectApple"),
            icon: Apple
          },
          {
            provider: "google" as const,
            title: t("settings.googleTitle"),
            subtitle: googleConnected
              ? t("settings.googleConnected")
              : googleReady
                ? t("settings.googleSubtitle")
                : t("settings.googleUnavailable"),
            connected: googleConnected,
            ready: googleReady,
            cta: t("settings.connectGoogle"),
            icon: ShieldCheck
          }
        ].map((provider) => {
          const Icon = provider.icon;
          return (
            <div
              key={provider.provider}
              className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
                    {provider.title}
                  </p>
                  <p className="text-[12px] text-[color:var(--color-ink-3)]">
                    {provider.subtitle}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={provider.connected ? "secondary" : "primary"}
                  disabled={!provider.ready || provider.connected || busy === provider.provider}
                  onClick={() => connectProvider(provider.provider)}
                  className="w-full sm:w-auto"
                >
                  {busy === provider.provider ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Icon size={14} />
                  )}
                  {provider.connected ? t("settings.connected") : provider.cta}
                </Button>
              </div>
            </div>
          );
        })}

        <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
                {t("settings.sessionsTitle")}
              </p>
              <p className="text-[12px] text-[color:var(--color-ink-3)]">
                {t("settings.sessionsSubtitle")}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!sessions || sessions.length <= 1 || busy === "sessions"}
              onClick={signOutOthers}
              className="w-full sm:w-auto"
            >
              {busy === "sessions" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              {t("settings.signOutOtherDevices")}
            </Button>
          </div>
          {sessions && sessions.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-medium text-[color:var(--color-ink-4)]">
                {t("settings.sessionsCount").replace("{count}", String(sessions.length))}
              </p>
              <ul className="space-y-1.5">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--color-ink-3)]"
                  >
                    <span className="min-w-0 truncate">
                      {t("settings.sessionSignedIn").replace(
                        "{date}",
                        new Date(session.createdAt).toLocaleDateString(locale)
                      )}
                      {" · "}
                      {t("settings.sessionExpires").replace(
                        "{date}",
                        new Date(session.expiresAt).toLocaleDateString(locale)
                      )}
                    </span>
                    {session.isCurrent ? (
                      <Pill tone="brand" className="shrink-0">
                        {t("settings.sessionCurrent")}
                      </Pill>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {message ? (
          <p className="text-[12px] font-medium text-[color:var(--color-positive)]">{message}</p>
        ) : null}
        {error ? (
          <p className="text-[12px] font-medium text-[color:var(--color-negative)]">{error}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function FailedAuditedWritesNotice({
  count,
  onRetry
}: {
  count: number;
  onRetry: () => Promise<number>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const retried = await onRetry();
      setMessage(
        retried > 0
          ? `Retrying ${retried} reviewed change${retried === 1 ? "" : "s"}.`
          : "No reviewed changes needed retrying."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't retry those changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] p-3">
      <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
        {count} reviewed change{count === 1 ? " needs" : "s need"} a fresh retry
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
        The earlier audited attempt stopped safely. Retry creates a new linked draft and never
        reuses the failed audit record.
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        disabled={busy}
        onClick={() => void retry()}
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
        {busy ? "Retrying…" : "Retry reviewed changes"}
      </Button>
      {message ? (
        <p className="mt-2 text-[11.5px] text-[color:var(--color-ink-3)]">{message}</p>
      ) : null}
    </div>
  );
}

export function WriteRecoveryNotice({
  quarantine,
  kind
}: {
  quarantine: { count: number; raw: string | null };
  kind: "account" | "device";
}) {
  if (!quarantine.raw) return null;

  function download() {
    const blob = new Blob([quarantine.raw ?? ""], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `numa-${kind}-write-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] p-3">
      <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
        {quarantine.count} {kind === "account" ? "account" : "device-level"} recovery
        {quarantine.count === 1 ? " record" : " records"}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
        {kind === "account"
          ? "Numa Pro quarantined damaged offline data for this account instead of replaying it."
          : "Numa Pro preserved older unowned offline data, but will never adopt or replay it into the signed-in account."}{" "}
        Download the recovery file before clearing browser data.
      </p>
      <Button type="button" variant="secondary" className="mt-3" onClick={download}>
        <Download size={14} />
        Download recovery file
      </Button>
    </div>
  );
}

export function DeleteAccountDialog({
  open,
  accountLabel,
  isCloud,
  onClose,
  onConfirm,
  pendingWriteCount,
  recoveryWriteCount
}: {
  open: boolean;
  accountLabel: string;
  isCloud: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  pendingWriteCount: number;
  recoveryWriteCount: number;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLocale();

  // Reset the form each time the dialog opens, so closing + re-opening
  // doesn't leave a half-typed "DELETE" string behind.
  useEffect(() => {
    if (open) {
      setConfirmText("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const canConfirm = confirmText.trim().toUpperCase() === "DELETE" && !busy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.deleteError"));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={t("settings.deleteTitle")}
      description={
        isCloud
          ? t("settings.deleteCloudDescription").replace("{account}", accountLabel)
          : t("settings.deleteLocalDescription").replace("{account}", accountLabel)
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {pendingWriteCount > 0 || recoveryWriteCount > 0 ? (
          <div className="space-y-1 rounded-xl bg-[color:var(--color-warning-soft)] px-3 py-2 text-[12px] text-[color:var(--color-ink-2)]">
            {pendingWriteCount > 0 ? (
              <p>
                {pendingWriteCount} unsynced change{pendingWriteCount === 1 ? "" : "s"} will be discarded.
              </p>
            ) : null}
            {recoveryWriteCount > 0 ? (
              <p>
                {recoveryWriteCount} quarantined recovery record
                {recoveryWriteCount === 1 ? "" : "s"} will be discarded.
              </p>
            ) : null}
          </div>
        ) : null}
        <Field label={t("settings.typeDelete")} hint={t("settings.typeDeleteHint")}>
          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            autoComplete="off"
            disabled={busy}
          />
        </Field>
        {error ? (
          <p className="text-[12px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={!canConfirm}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {busy ? t("settings.deleting") : t("settings.deleteAccount")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

