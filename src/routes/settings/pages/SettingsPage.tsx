import { useEffect, useState, type FormEvent } from "react";

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import {
  Check,
  Database,
  Loader2,
  LogOut,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AvatarControls } from "@/components/features/AvatarControls";
import { AISharingControl } from "@/components/features/AISharingControl";
import { Button } from "@/components/ui/Button";
import { Sparkle } from "@/components/ui/Sparkle";
import { Avatar } from "@/components/ui/Avatar";

import { TextInput } from "@/components/ui/Dialog";

import { emitCommand } from "@/lib/commands";
import { pageEnter } from "@/lib/motion";
import { isCloudEnabled, useAuth } from "@/services/auth";

import { resetOnboarding } from "@/lib/onboarding";

import { useAppMode } from "@/lib/appMode";

import { useLocale } from "@/lib/i18n";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

import {
  cloudPushAvailable,
} from "@/services/pushSync";
import {
  readDeviceWriteQueueRecovery,
  readScopedWriteQueueRecovery,
  writeQueueScopeForAccount,
  WRITE_QUEUE_DEPLOYMENT,
  useWriteQueue
} from "@/services/writeQueue";

import { CloudNotificationsCard, LocalNotificationsCard } from "../Notifications";
import { LanguageCard, PortfoliosCard } from "../Profile";
import { DeleteAccountDialog, FailedAuditedWritesNotice, SecurityCard, WriteRecoveryNotice } from "../Security";
import { LightSettingsSurface, ReferenceSettingsSurface } from "../Surfaces";
import { WebhooksCard } from "../Webhooks";
import { CategoriesSettings } from "../Categories";
export function SettingsPage() {
  const navigate = useNavigate();
  const { currentAccount, signOut, deleteAccount, linkProvider } = useAuth();
  const { locale, t } = useLocale();
  const updateProfile = useMutation(api.profiles.updateProfile);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [appMode] = useAppMode();
  const {
    items: queuedWrites,
    retryAuditedFailed
  } = useWriteQueue();
  const unsyncedWriteCount = queuedWrites.filter((item) => item.status !== "applied").length;
  const failedAuditedWriteCount = queuedWrites.filter(
    (item) => item.status === "failed" && item.auditDraftId
  ).length;
  const writeRecovery = readScopedWriteQueueRecovery(
    writeQueueScopeForAccount(WRITE_QUEUE_DEPLOYMENT, currentAccount)
  );
  const deviceWriteRecovery = readDeviceWriteQueueRecovery();
  const accountId = currentAccount?.id;
  const accountDisplayName = currentAccount?.displayName;

  useEffect(() => {
    if (!accountDisplayName) return;
    setNameDraft(accountDisplayName);
    setEditingName(false);
    setNameError(null);
  }, [accountId, accountDisplayName]);

  async function handleSignOut() {
    const warnings: string[] = [];
    if (unsyncedWriteCount > 0) {
      warnings.push(
        `${unsyncedWriteCount} unsynced change${unsyncedWriteCount === 1 ? "" : "s"} will stay scoped to this account on this device and resume after you sign in again.`
      );
    }
    if (writeRecovery.count > 0) {
      warnings.push(
        `${writeRecovery.count} account-scoped recovery record${writeRecovery.count === 1 ? " is" : "s are"} quarantined and will remain on this device.`
      );
    }
    if (warnings.length > 0 && !window.confirm(`${warnings.join("\n\n")}\n\nSign out anyway?`)) {
      return;
    }
    try {
      await signOut();
    } catch {
      /* local sign-out only clears state */
    }
    navigate("/welcome", { replace: true });
  }

  function handleDelete() {
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!currentAccount) return;
    await deleteAccount(currentAccount.id);
    setDeleteDialogOpen(false);
    navigate("/welcome", { replace: true });
  }

  function handleShowOnboarding() {
    if (!currentAccount) return;
    resetOnboarding(currentAccount.id);
    window.sessionStorage.setItem("numa:onboarding:force", "1");
    window.location.reload();
  }

  async function handleSaveName(event?: FormEvent) {
    event?.preventDefault();
    if (!currentAccount) return;
    const displayName = nameDraft.trim();
    if (!displayName) {
      setNameError(t("settings.nameRequired"));
      return;
    }
    if (displayName === currentAccount.displayName) {
      setEditingName(false);
      setNameError(null);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await updateProfile({ displayName });
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : t("settings.nameSaveError"));
    } finally {
      setSavingName(false);
    }
  }

  function handleCancelNameEdit() {
    if (!currentAccount) return;
    setNameDraft(currentAccount.displayName);
    setEditingName(false);
    setNameError(null);
  }

  if (!currentAccount) return null;

  if (appMode === "light") {
    return (
      <motion.div {...pageEnter} className="nm-plain mx-auto w-full max-w-[880px] space-y-10 pb-28 lg:pb-8">
        <AISharingControl key={currentAccount.id} />
        <LightSettingsSurface
          currentAccount={currentAccount}
          onSignOut={handleSignOut}
          onImportExport={() => emitCommand("import-export")}
          onDeleteAccount={handleDelete}
          onSaveName={async (displayName: string) => {
            try {
              await updateProfile({ displayName });
              return null;
            } catch (err) {
              return err instanceof Error ? err.message : t("settings.nameSaveError");
            }
          }}
        />
        <CategoriesSettings />
        {failedAuditedWriteCount > 0 ? (
          <div className="mt-5">
            <FailedAuditedWritesNotice
              count={failedAuditedWriteCount}
              onRetry={retryAuditedFailed}
            />
          </div>
        ) : null}
        {writeRecovery.raw ? (
          <div className="mt-5">
            <WriteRecoveryNotice quarantine={writeRecovery} kind="account" />
          </div>
        ) : null}
        {deviceWriteRecovery.raw ? (
          <div className="mt-5">
            <WriteRecoveryNotice quarantine={deviceWriteRecovery} kind="device" />
          </div>
        ) : null}
        <DeleteAccountDialog
          open={deleteDialogOpen}
          accountLabel={currentAccount.email ?? currentAccount.displayName}
          isCloud={Boolean(currentAccount.isCloud)}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleConfirmDelete}
          pendingWriteCount={unsyncedWriteCount}
          recoveryWriteCount={writeRecovery.count}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      {...pageEnter}
      className="nm-plain mx-auto w-full max-w-[1040px] space-y-10 pb-28 lg:pb-8"
    >
      <AISharingControl key={currentAccount.id} />
      <ReferenceSettingsSurface
        currentAccount={currentAccount}
        appMode={appMode}
        onSignOut={handleSignOut}
        onImportExport={() => emitCommand("import-export")}
      />

      <CategoriesSettings />

      <section className="space-y-8" aria-label="Account controls">

      {/* Profile spans the full row — it's the primary identity surface and
          looks balanced wide. Everything else folds into a responsive grid
          so Settings uses the whole available width on web instead of a
          narrow 768px column. */}
      <Card id="settings-profile-controls">
        <CardHeader title={t("settings.profileTitle")} subtitle={t("settings.profileSubtitle")} />
        <CardBody>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex shrink-0 flex-col items-center gap-2 sm:w-auto">
              <Avatar
                name={currentAccount.displayName}
                src={currentAccount.avatarUrl}
                size={56}
              />
              {isCloudEnabled && currentAccount.isCloud && currentAccount.hasCloudProfile ? (
                <AvatarControls key={currentAccount.id} userId={currentAccount.id as Id<"users">} hasAvatar={Boolean(currentAccount.avatarUrl)} />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <form
                  onSubmit={handleSaveName}
                  className="flex w-full flex-col gap-2 sm:max-w-[520px]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <TextInput
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      aria-label={t("settings.displayName")}
                      placeholder={t("settings.displayName")}
                      autoComplete="name"
                      disabled={savingName}
                      className="min-w-0 flex-1"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={savingName}
                        className="w-full sm:w-auto"
                      >
                        {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {savingName ? t("settings.saving") : t("save")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCancelNameEdit}
                        disabled={savingName}
                        className="w-full sm:w-auto"
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                  {nameError ? (
                    <p className="text-[12px] text-[color:var(--color-negative)]">
                      {nameError}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate text-[16px] font-semibold text-[color:var(--color-ink)]">
                    {currentAccount.displayName}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(currentAccount.displayName);
                      setEditingName(true);
                      setNameError(null);
                    }}
                    className="nm-interactive inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-glass)] px-2.5 text-[12px] font-semibold text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-glass-strong)]"
                  >
                    <Pencil size={13} />
                    <span>{t("settings.editName")}</span>
                  </button>
                </div>
              )}
              <p className="text-[13px] text-[color:var(--color-ink-3)] truncate">
                {currentAccount.email}
              </p>
            </div>
            <Button variant="secondary" onClick={handleSignOut} className="w-full sm:w-auto">
              <LogOut size={14} /> {t("settings.signOut")}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* 2-column on lg+ — appearance/palette/mode/language sit on the left,
          preferences/notifications/webhooks/data on the right. Each card
          retains its own internal padding so the grid stays comfortable.
          On mobile every card stacks single-column with the new tighter
          card padding (h-3/sm:h-5). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 items-start">
        <div className="space-y-8">
          <LanguageCard />
          <PortfoliosCard />
        </div>

        <div className="space-y-8">
          <SecurityCard
            accountEmail={currentAccount?.email}
            accountDisplayName={currentAccount?.displayName}
            onLinkProvider={linkProvider}
          />

          <Card>
            <CardHeader
              title={t("settings.accountTitle")}
              subtitle={t("settings.accountSubtitle")}
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-y-3 text-[14px]">
                <dt className="text-[color:var(--color-ink-3)]">{t("settings.defaultCurrency")}</dt>
                <dd className="font-medium">{currentAccount.defaultCurrency}</dd>
                <dt className="text-[color:var(--color-ink-3)]">{t("settings.autoSnapshot")}</dt>
                <dd className="font-medium">
                  {t("settings.autoSnapshotValue")}
                </dd>
                <dt className="text-[color:var(--color-ink-3)]">{t("settings.memberSince")}</dt>
                <dd className="font-medium">
                  {new Date(currentAccount.createdAt).toLocaleDateString(locale, {
                    month: "long",
                    year: "numeric"
                  })}
                </dd>
              </dl>
            </CardBody>
          </Card>

          {cloudPushAvailable ? <CloudNotificationsCard /> : <LocalNotificationsCard />}

          {isCloudEnabled && currentAccount.isCloud ? <WebhooksCard /> : null}
        </div>
      </div>

      <Card id="settings-data-controls">
        <CardHeader title={t("settings.dataTitle")} subtitle={t("settings.dataSubtitle")} />
        <CardBody className="space-y-3">
          {failedAuditedWriteCount > 0 ? (
            <FailedAuditedWritesNotice
              count={failedAuditedWriteCount}
              onRetry={retryAuditedFailed}
            />
          ) : null}
          {writeRecovery.raw ? (
            <WriteRecoveryNotice quarantine={writeRecovery} kind="account" />
          ) : null}
          {deviceWriteRecovery.raw ? (
            <WriteRecoveryNotice quarantine={deviceWriteRecovery} kind="device" />
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <Button variant="primary" onClick={() => emitCommand("import-export")}>
              <Database size={14} />
              {t("settings.importExport")}
            </Button>
            <Button variant="secondary" onClick={handleShowOnboarding}>
              <Sparkle size={14} />
              {t("settings.showOnboarding")}
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={14} />
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </CardBody>
      </Card>
      </section>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        accountLabel={currentAccount.email ?? currentAccount.displayName}
        isCloud={Boolean(currentAccount.isCloud)}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        pendingWriteCount={unsyncedWriteCount}
        recoveryWriteCount={writeRecovery.count}
      />
    </motion.div>
  );
}

