import { useState, type FormEvent, type ReactNode } from "react";

import { useNavigate } from "react-router-dom";

import {
  LifeBuoy,
  ChevronRight,
  Download,
  KeyRound,
  LockKeyhole,
  LogOut,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/Button";

import { Avatar } from "@/components/ui/Avatar";

import { cn } from "@/lib/cn";

import { useTheme, type Theme } from "@/lib/theme";
import { useAppMode, type AppMode } from "@/lib/appMode";
import { useThemeKey, THEME_KEY_OPTIONS, type AppThemeKey } from "@/lib/themeKey";
import { useWeekStartsOn, type WeekStartsOn } from "@/lib/weekStart";
import { usePushProfile } from "@/lib/profileSync";

import { useLocale } from "@/lib/i18n";

import { CurrentModeCard, ModeSwitchSheet } from "./ModeCards";
import { NotificationsSettingsRow } from "./Notifications";
import { AccountForSettings, MODE_META } from "./shared";
export function ReferenceSettingsSurface({
  currentAccount,
  appMode,
  onSignOut,
  onImportExport
}: {
  currentAccount: AccountForSettings;
  appMode: AppMode;
  onSignOut: () => void;
  onImportExport: () => void;
}) {
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const meta = MODE_META[appMode];
  const showConnectedAccounts = appMode === "advanced";

  function scrollToControls(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="mx-auto grid w-full max-w-[1160px] gap-4 lg:grid-cols-[minmax(0,520px)_minmax(320px,1fr)] lg:items-start">
      <div className="space-y-4">
        <header className="flex items-center gap-3 px-1 pt-1">
          <Avatar
            name={currentAccount.displayName}
            src={currentAccount.avatarUrl}
            size={52}
            className="bg-[color:var(--color-cta-ink)]"
          />
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-[22px] font-bold leading-tight tracking-[-0.03em] text-[color:var(--color-ink)] sm:text-[28px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {currentAccount.displayName}
            </h1>
            <p className="truncate text-[12.5px] font-medium text-[color:var(--color-ink-3)]">
              {currentAccount.email}
            </p>
          </div>
        </header>

        <CurrentModeCard meta={meta} onSwitch={() => setModeSheetOpen(true)} />

        <LightLookCard />
      </div>

      <div className="min-h-0">
        <h2 className="nm-plain-heading">Account</h2>
        <div>
          <LightSettingsRow
            icon={<UserRound size={16} />}
            label="Profile"
            onClick={() => scrollToControls("settings-profile-controls")}
          />
          <NotificationsSettingsRow
            onClick={() => scrollToControls("settings-notification-controls")}
          />
          {showConnectedAccounts ? (
            <LightSettingsRow
              icon={<KeyRound size={16} />}
              label="Connected accounts"
              value="Manage"
              onClick={() => scrollToControls("settings-security-controls")}
            />
          ) : null}
          <LightSettingsRow
            icon={<LockKeyhole size={16} />}
            label="Privacy & data"
            onClick={() => scrollToControls("settings-data-controls")}
          />
          <LightSettingsRow
            icon={<LifeBuoy size={16} />}
            label="Support"
            value="Email"
            onClick={() => {
              window.location.href = "mailto:support@example.com?subject=Numa%20Pro%20support";
            }}
          />
          <LightSettingsRow icon={<Download size={16} />} label="Export" onClick={onImportExport} />
          <LightSettingsRow
            icon={<LogOut size={16} />}
            label="Sign out"
            danger
            last
            onClick={onSignOut}
          />
        </div>
      </div>

      <ModeSwitchSheet open={modeSheetOpen} onClose={() => setModeSheetOpen(false)} />
    </section>
  );
}

export function LightSettingsSurface({
  currentAccount,
  onSignOut,
  onImportExport,
  onDeleteAccount,
  onSaveName
}: {
  currentAccount: AccountForSettings;
  onSignOut: () => void;
  onImportExport: () => void;
  onDeleteAccount: () => void;
  onSaveName: (displayName: string) => Promise<string | null>;
}) {
  const [mode] = useAppMode();
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const { t } = useLocale();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentAccount.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const meta = MODE_META[mode];

  async function submitName(event: FormEvent) {
    event.preventDefault();
    const next = nameDraft.trim();
    if (!next) {
      setNameError(t("settings.nameRequired"));
      return;
    }
    if (next === currentAccount.displayName) {
      setEditingName(false);
      setNameError(null);
      return;
    }
    setSavingName(true);
    const error = await onSaveName(next);
    setSavingName(false);
    setNameError(error);
    if (!error) setEditingName(false);
  }
  return (
    <section className="mx-auto w-full max-w-[520px] space-y-4 pb-28 lg:pb-8">
      <header className="flex items-center gap-3 px-1 pt-1">
        <Avatar
          name={currentAccount.displayName}
          src={currentAccount.avatarUrl}
          size={52}
          className="bg-[color:var(--color-cta-ink)]"
        />
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-[22px] font-bold leading-tight tracking-[-0.03em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {currentAccount.displayName}
          </h1>
          <p className="truncate text-[12.5px] font-medium text-[color:var(--color-ink-3)]">
            {currentAccount.email}
          </p>
        </div>
      </header>

      <CurrentModeCard meta={meta} onSwitch={() => setModeSheetOpen(true)} />

      <LightLookCard />

      <div>
        <h2 className="nm-plain-heading">Account</h2>
        <div>
          <LightSettingsRow
            icon={<UserRound size={16} />}
            label={t("settings.editName")}
            value={currentAccount.displayName}
            onClick={() => {
              setNameDraft(currentAccount.displayName);
              setNameError(null);
              setEditingName((open) => !open);
            }}
          />
          {editingName ? (
            <form
              onSubmit={submitName}
              className="space-y-2 border-b border-[color:var(--color-line)] py-3"
            >
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                autoFocus
                maxLength={60}
                aria-label={t("settings.editName")}
                className="h-10 w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[16px] sm:text-[14px] font-medium text-[color:var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
              />
              {nameError ? (
                <p className="text-[12px] text-[color:var(--color-negative)]">{nameError}</p>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={savingName}>
                  {savingName ? t("settings.saving") : t("save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingName(false);
                    setNameError(null);
                  }}
                >
                  {t("cancel")}
                </Button>
              </div>
            </form>
          ) : null}
          <LightSettingsRow
            icon={<LockKeyhole size={16} />}
            label={t("welcome.privacy")}
            onClick={() => navigate("/privacy")}
          />
          <LightSettingsRow
            icon={<LifeBuoy size={16} />}
            label="Support"
            value="Email"
            onClick={() => {
              window.location.href = "mailto:support@example.com?subject=Numa%20Pro%20support";
            }}
          />
          <LightSettingsRow
            icon={<Download size={16} />}
            label={t("settings.importExport")}
            onClick={onImportExport}
          />
          <LightSettingsRow
            icon={<LogOut size={16} />}
            label={t("settings.signOut")}
            onClick={onSignOut}
          />
          <LightSettingsRow
            icon={<Trash2 size={16} />}
            label={t("settings.deleteAccount")}
            danger
            last
            onClick={onDeleteAccount}
          />
        </div>
      </div>

      <ModeSwitchSheet open={modeSheetOpen} onClose={() => setModeSheetOpen(false)} />
    </section>
  );
}

export function LightLookCard() {
  const [theme, setTheme] = useTheme();
  const [themeKey, setThemeKey] = useThemeKey();
  const pushProfile = usePushProfile();
  function pickPalette(next: AppThemeKey) {
    setThemeKey(next);
    pushProfile({ themeKey: next });
  }
  function pickTheme(next: Theme) {
    setTheme(next);
    pushProfile({ theme: next });
  }
  const palettes = THEME_KEY_OPTIONS.filter((option) => option.value !== "numa");
  const themeOptions: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "auto", label: "Auto" }
  ];
  const [weekStartsOn, setWeekStart] = useWeekStartsOn();
  const weekOptions: { value: WeekStartsOn; label: string }[] = [
    { value: 1, label: "Mon" },
    { value: 0, label: "Sun" }
  ];
  return (
    <section>
      <h2 className="nm-plain-heading">Look</h2>
      <div className="pt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {palettes.map((option) => {
            const active = themeKey === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => pickPalette(option.value)}
                className={cn(
                  "h-11 rounded-full border text-center text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]",
                  active
                    ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-bg)]"
                    : "border-[color:var(--color-line-strong)] text-[color:var(--color-ink-2)]"
                )}
              >
                {option.name}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--color-line)] pt-3">
          <p className="flex-1 text-[16px] text-[color:var(--color-ink)]">
            Appearance
          </p>
          <div className="nm-plain-segment">
            {themeOptions.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pickTheme(option.value)}
                  aria-pressed={active}
                  className={cn("nm-plain-segment-option", active && "nm-plain-segment-active")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--color-line)] pt-3">
          <p className="flex-1 text-[16px] text-[color:var(--color-ink)]">
            Week starts
          </p>
          <div className="nm-plain-segment">
            {weekOptions.map((option) => {
              const active = weekStartsOn === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWeekStart(option.value)}
                  aria-pressed={active}
                  className={cn("nm-plain-segment-option", active && "nm-plain-segment-active")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LightSettingsRow({
  icon,
  label,
  value,
  danger,
  last,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 py-3 text-left",
        onClick ? "nm-balance-row-button" : "",
        !last ? "border-b border-[color:var(--color-line)]" : ""
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center",
          danger ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-ink)]"
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-[16px]",
          danger ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-ink)]"
        )}
      >
        {label}
      </span>
      {value ? (
        <span className="truncate text-[14px] text-[color:var(--color-ink-3)]">
          {value}
        </span>
      ) : null}
      <ChevronRight size={16} className="shrink-0 text-[color:var(--color-ink-4)]" />
    </Tag>
  );
}

