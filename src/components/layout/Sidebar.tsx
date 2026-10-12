import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  MessageSquarePlus,
  Monitor,
  Moon,
  Settings,
  Sun
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog, Field, Select, TextArea } from "@/components/ui/Dialog";
import { LanguagePicker } from "@/components/ui/LanguagePicker";
import { Sparkle } from "@/components/ui/Sparkle";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { useAuth } from "@/services/auth";
import { useLocale } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { useAppMode } from "@/lib/appMode";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { usePushProfile } from "@/lib/profileSync";
import { APP_VERSION_LABEL } from "@/lib/version";
import {
  formatFeedbackBacklog,
  readFeedbackItems,
  saveFeedbackItem,
  type FeedbackKind
} from "@/lib/feedback";
import { SETTINGS_ITEM, visibleNavItems } from "./navItems";
import type { AppLocale } from "@/lib/types";

export function Sidebar() {
  const { currentAccount } = useAuth();
  const { t } = useLocale();
  const [theme, setTheme] = useTheme();
  const [mode] = useAppMode();
  const pushProfile = usePushProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const me = currentAccount ?? {
    displayName: t("sidebar.you"),
    email: "",
    avatarUrl: undefined as string | undefined
  };
  const navItems =
    mode === "light"
      ? [...visibleNavItems(mode), { ...SETTINGS_ITEM, end: false, advanced: false }]
      : visibleNavItems(mode);

  function onLocaleChange(next: AppLocale) {
    pushProfile({ locale: next });
  }

  return (
    <aside
      className={cn(
        "nm-sidebar fixed left-0 top-0 bottom-0 z-30 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col overflow-y-auto px-4 border-r border-[color:var(--color-line)] backdrop-blur-2xl lg:flex",
        mode === "light"
          ? "w-[236px] bg-[color:var(--color-paper)] py-6"
          : "w-[264px] bg-[color:var(--color-bg-ivory)]/55 py-5"
      )}
    >
      <div className="px-3 pb-6 pt-1">
        <BrandLockup />
        <p className="mt-3 pl-1 text-[10px] text-[color:var(--color-ink-3)] tracking-[0.16em] uppercase font-mono">
          {t("sidebar.brandTagline")}
        </p>
      </div>

      <nav
        aria-label="Primary"
        className="nm-proximity-dock flex flex-col gap-1"
        data-proximity-axis="y"
        data-proximity-max-scale="0.025"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              viewTransition
              className={({ isActive }) =>
                cn(
                  "nm-proximity-item group relative flex items-center gap-3 h-11 px-3 rounded-2xl text-[13.5px] font-medium tracking-[-0.005em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                  isActive
                    ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
                    : "text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-glass)] hover:text-[color:var(--color-ink)] hover:shadow-[var(--shadow-sm)]"
                )
              }
            >
              <Icon size={17} strokeWidth={1.75} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>

      {mode === "advanced" && AI_ENABLED ? (
        <button
          type="button"
          onClick={() => navigate("/numa")}
          className="nm-interactive mt-4 w-full rounded-[24px] border border-[color:var(--color-line)] bg-[color:var(--color-ink)] p-3 text-left text-[color:var(--color-bg)] shadow-[var(--shadow-md)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)]">
              <Sparkle size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">
                {t("numaAi")}
              </span>
            </span>
          </span>
        </button>
      ) : null}

      {mode === "light" ? (
        <div className="mt-auto rounded-[15px] bg-[color:var(--color-cta)] p-4 text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">tip</p>
          <p
            className="mt-2 text-[15px] font-bold leading-snug tracking-[-0.02em] text-[color:var(--color-bg)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Press <span className="text-[color:var(--color-cta-ink)]">N</span> anywhere to add.
          </p>
        </div>
      ) : (
      <>
      <div className="nm-sidebar-footer mt-auto space-y-3 pt-6 border-t border-[color:var(--color-line)]">
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="nm-sidebar-feedback nm-interactive w-full flex items-start gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-glass)] p-3 text-left shadow-[var(--shadow-sm)] hover:bg-[color:var(--color-glass-strong)]"
        >
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-brand-strong)] shrink-0">
            <MessageSquarePlus size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[color:var(--color-ink)]">
              {t("feedback.title")}
            </span>
            <span className="block mt-0.5 text-[11px] leading-snug text-[color:var(--color-ink-3)]">
              {t("feedback.subtitle")}
            </span>
          </span>
        </button>

        <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-glass)] p-2 shadow-[var(--shadow-sm)] space-y-2 backdrop-blur-xl">
          <LanguagePicker onChange={onLocaleChange} />
          <div className="grid grid-cols-3 gap-1">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-label={`${t("settings.appearanceTitle")}: ${t(option.labelKey)}`}
                  title={t(option.labelKey)}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "grid place-items-center h-11 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                    theme === option.value
                      ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)]"
                      : "text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-100)]"
                  )}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>

        <NavLink
          to="/settings"
          viewTransition
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-2xl transition-all",
            location.pathname === "/settings"
              ? "bg-[color:var(--color-paper)] shadow-[var(--shadow-sm)] border border-[color:var(--color-line)]"
              : "hover:bg-[color:var(--color-glass)]"
          )}
        >
          <Avatar name={me.displayName} src={me.avatarUrl} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[color:var(--color-ink)] leading-tight truncate">
              {me.displayName}
            </p>
            <p className="text-[11px] text-[color:var(--color-ink-3)] leading-tight truncate">
              {me.email || t("settings.eyebrow")}
            </p>
          </div>
          <Settings size={16} className="text-[color:var(--color-ink-4)]" />
        </NavLink>

        <p
          className="px-1 text-[10px] font-medium tracking-[0.08em] uppercase text-[color:var(--color-ink-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
          title="Numa Pro app version"
        >
          Numa Pro {APP_VERSION_LABEL}
        </p>
      </div>
      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        accountEmail={me.email}
      />
      </>
      )}
    </aside>
  );
}

const THEME_OPTIONS: Array<{ value: Theme; labelKey: "theme.light" | "theme.dark" | "theme.auto"; icon: typeof Sun }> = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "auto", labelKey: "theme.auto", icon: Monitor }
];

function FeedbackDialog({
  open,
  onClose,
  accountEmail
}: {
  open: boolean;
  onClose: () => void;
  accountEmail?: string | null;
}) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [text, setText] = useState("");
  const [impact, setImpact] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const savedItems = readFeedbackItems();
  const { t } = useLocale();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    saveFeedbackItem({
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      kind,
      text: trimmed,
      impact: impact.trim() || undefined,
      page: typeof window === "undefined" ? "" : window.location.pathname,
      accountEmail,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      createdAt: Date.now()
    });
    setText("");
    setImpact("");
    setKind("idea");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function copyBacklog() {
    const backlog = formatFeedbackBacklog(readFeedbackItems());
    await navigator.clipboard?.writeText(backlog);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("feedback.title")}
      description={t("feedback.description")}
      width={520}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("feedback.type")}>
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
            >
              <option value="idea">{t("feedback.idea")}</option>
              <option value="ux">{t("feedback.ux")}</option>
              <option value="bug">{t("feedback.bug")}</option>
              <option value="other">{t("feedback.other")}</option>
            </Select>
          </Field>
          <Field label={t("feedback.page")}>
            <div className="flex items-center h-10 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] text-[13px] text-[color:var(--color-ink-3)] truncate">
              {typeof window === "undefined" ? "/" : window.location.pathname}
            </div>
          </Field>
        </div>
        <Field label={t("feedback.what")}>
          <TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder={t("feedback.whatPlaceholder")}
          />
        </Field>
        <Field label={t("feedback.why")}>
          <TextArea
            value={impact}
            onChange={(event) => setImpact(event.target.value)}
            rows={3}
            placeholder={t("feedback.whyPlaceholder")}
          />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-[color:var(--color-ink-4)]">
            {savedItems.length} {t(savedItems.length === 1 ? "feedback.savedOne" : "feedback.savedMany")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyBacklog}>
              {copied ? <Check size={14} /> : <MessageSquarePlus size={14} />}
              {copied ? t("copied") : t("feedback.copy")}
            </Button>
            <Button type="submit" variant="primary" disabled={!text.trim()}>
              {t("feedback.save")}
            </Button>
          </div>
        </div>
        {saved ? (
          <p className="text-[12px] font-medium text-[color:var(--color-positive)]">
            {t("feedback.saved")}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
