import { useMemo, useState, type ReactNode } from "react";

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { HandCoins, Home, ReceiptText, Settings2, UsersRound } from "lucide-react";
import { NumaCoinLogo } from "@/components/brand/NumaCoinLogo";
import { readOnboardingPotName } from "@/lib/productPositioning";

import { useLocale } from "@/lib/i18n";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { pageEnter } from "@/lib/motion";
import { podTemplateOptions, template, displayNameFromEmail, isEmailLike } from "@/lib/podPageHelpers";
import { usePodActions } from "@/services/podActions";
import { useCurrentUser } from "@/services/store";
import type { CurrencyCode } from "@/lib/types";

export const POD_CURRENCIES = SUPPORTED_CURRENCIES.filter(
  (code): code is "USD" | "EUR" => code === "USD" || code === "EUR"
);

export function FirstRunSetup({
  defaultCurrency,
  onCreated
}: {
  defaultCurrency: CurrencyCode;
  onCreated: (id: string) => void;
}) {
  const { t } = useLocale();
  const me = useCurrentUser();
  const actions = usePodActions();
  // Shared-mode onboarding may have already asked for the pot's name — honor
  // it as the prefill so setup continues where step 3 left off.
  const [name, setName] = useState(() => readOnboardingPotName() || t("pod.defaultHomeName"));
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [groupsRaw, setGroupsRaw] = useState(() => t("pod.defaultGroups"));
  const [emailsRaw, setEmailsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const templates = useMemo(() => podTemplateOptions(t), [t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const groupNames = groupsRaw
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const emails = Array.from(
      new Set(
        emailsRaw
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const invalid = emails.find((email) => !isEmailLike(email));
    if (invalid) {
      setError(template(t("pod.errorInvalidEmail"), { email: invalid }));
      return;
    }
    const ownEmailLower = me.email?.trim().toLowerCase();
    const inviteEmails = ownEmailLower
      ? emails.filter((e) => e !== ownEmailLower)
      : emails;

    const colors = ["mint", "lavender", "peach", "sky"];
    const groups = groupNames.length
      ? groupNames.map((g, i) => ({
          name: g,
          color: colors[i % colors.length]
        }))
      : [];

    // Distribute invitees across groups by index — first half → group 0,
    // second half → group 1, etc. Owner can re-assign anyone afterwards from
    // the People sheet.
    const perGroup =
      groups.length > 0 ? Math.max(1, Math.ceil(inviteEmails.length / groups.length)) : 0;
    const invitedMembers = inviteEmails.map((email, idx) => {
      const groupIdx =
        groups.length > 0 ? Math.min(Math.floor(idx / perGroup), groups.length - 1) : -1;
      return {
        displayName: displayNameFromEmail(email),
        email,
        groupIndex: groupIdx >= 0 ? groupIdx : undefined,
        role: "editor" as const
      };
    });

    setSaving(true);
    try {
      const createdId = await actions.createMoneyPod({
        name: name.trim() || t("pod.defaultHomeName"),
        currency,
        groups,
        members: invitedMembers
      });
      onCreated(createdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorCreatePot"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      {...pageEnter}
      className="mx-auto w-full max-w-[980px] rounded-[32px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)] sm:p-6 lg:p-8"
    >
      {/* Keep this nav visible on mobile too: the global BottomNav is
          intentionally absent on shared surfaces, so without it a first-run
          shared user has no way to reach Settings (mode switch, sign out). */}
      <nav aria-label="Primary" className="mb-6 flex items-center gap-2">
        <Link
          to="/"
          className="nm-interactive inline-flex h-10 items-center gap-2 rounded-full bg-[color:var(--color-cta)] px-4 text-[13px] font-bold text-[color:var(--color-cta-ink)]"
        >
          <Home size={15} strokeWidth={2} />
          Pot
        </Link>
        <Link
          to="/settings"
          className="nm-interactive inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-4 text-[13px] font-semibold text-[color:var(--color-ink-2)]"
        >
          <Settings2 size={15} strokeWidth={1.9} />
          Settings
        </Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <header className="space-y-4">
          <div className="flex items-center gap-2">
            <NumaCoinLogo size={40} />
            <p className="nm-eyebrow">{t("pod.sharedPot")}</p>
          </div>
          <div>
            <h1
              className="text-[30px] sm:text-[38px] font-bold tracking-[-0.045em] leading-[1.02] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Build a pod for real shared money.
            </h1>
            <p className="mt-3 max-w-[460px] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
              Invite friends or family, label cards, add expenses, and keep settlement clear from the first entry.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Invite", icon: UsersRound },
              { label: "Add", icon: ReceiptText },
              { label: "Settle", icon: HandCoins }
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-positive-mist)] text-[color:var(--color-positive)]">
                    <Icon size={17} />
                  </span>
                  <p className="mt-2 text-[12px] font-semibold text-[color:var(--color-ink)]">
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </header>

        <div className="space-y-5">

      <SetupField label={t("pod.potName")}>
        <div className="mb-2 flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => {
                setName(template.name);
                setGroupsRaw(template.groups);
              }}
              className="h-8 px-3 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-bg)] text-[12px] font-semibold text-[color:var(--color-ink-2)] hover:border-[color:var(--color-brand)]"
            >
              {template.label}
            </button>
          ))}
        </div>
        <input
          aria-label={t("pod.potName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="setup-input"
          placeholder={t("pod.defaultHomeName")}
        />
      </SetupField>

      <div className="grid grid-cols-1">
        <SetupField label={t("pod.currency")}>
          <select
            aria-label={t("pod.currency")}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="setup-input"
          >
            {POD_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </SetupField>
      </div>

      <SetupField
        label={t("pod.inviteByEmail")}
        hint={t("pod.firstRunInviteHint")}
      >
        <input
          aria-label={t("pod.inviteByEmail")}
          value={emailsRaw}
          onChange={(e) => setEmailsRaw(e.target.value)}
          className="setup-input"
          placeholder="maya@example.com, noah@example.com"
          autoComplete="off"
        />
      </SetupField>

      <SetupField
        label={t("pod.groupsOptional")}
        hint={t("pod.firstRunGroupsHint")}
      >
        <input
          aria-label={t("pod.groupsOptional")}
          value={groupsRaw}
          onChange={(e) => setGroupsRaw(e.target.value)}
          className="setup-input"
          placeholder={t("pod.defaultGroups")}
        />
      </SetupField>

      {error ? (
        <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="w-full h-[54px] rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[15px] transition-colors hover:brightness-105"
      >
        {saving ? t("pod.creating") : t("pod.createThePot")}
      </button>
        </div>
      </div>

      <style>{`
        .setup-input {
          height: 46px;
          width: 100%;
          padding: 0 14px;
          border-radius: 14px;
          background: var(--color-bg);
          border: 1px solid var(--color-line);
          color: var(--color-ink);
          font-size: 14.5px;
        }
        .setup-input:focus {
          outline: none;
          border-color: var(--color-brand);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-brand) 16%, transparent);
        }
      `}</style>
    </motion.form>
  );
}

function SetupField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[11.5px] text-[color:var(--color-ink-3)] leading-snug">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main surface                                                                */
/* -------------------------------------------------------------------------- */

