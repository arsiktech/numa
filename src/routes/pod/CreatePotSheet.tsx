/**
 * Import-via-sheet variant of pod creation (opened from the desktop rail's
 * new-pot button). Extracted from the former `page.tsx`.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";  // eslint-disable-line @typescript-eslint/no-unused-vars
import { useLocale } from "@/lib/i18n";
import {
  buildSuggestedInvitePeople,
  displayNameFromEmail,
  isEmailLike,
  parseEmailList,
  podTemplateOptions,
  template
} from "@/lib/podPageHelpers";
import type { CurrencyCode } from "@/lib/types";
import { useCloudState } from "@/services/cloudStore";
import { useNuma, useCurrentUser } from "@/services/store";
import { usePodActions } from "@/services/podActions";
import { POD_CURRENCIES } from "./FirstRun";
import { SetupField, Sheet, podInputClass } from "./shared";

export function CreatePotSheet({
  open,
  onClose,
  defaultCurrency,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  defaultCurrency: CurrencyCode;
  onCreated: (id: string) => void;
}) {
  const { t } = useLocale();
  const me = useCurrentUser();
  const { state } = useNuma();
  const cloud = useCloudState();
  const actions = usePodActions();
  const [name, setName] = useState(() => t("pod.defaultHomeName"));
  const [currency, setCurrency] = useState<CurrencyCode>(
    defaultCurrency === "USD" ? "USD" : "EUR"
  );
  const [groupsRaw, setGroupsRaw] = useState(() => t("pod.defaultGroups"));
  const [emailsRaw, setEmailsRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useMemo(() => podTemplateOptions(t), [t]);
  const typedEmails = useMemo(() => parseEmailList(emailsRaw), [emailsRaw]);
  const suggestedPeople = useMemo(
    () => buildSuggestedInvitePeople({
      currentUserId: me.id,
      currentUserEmail: me.email,
      typedEmails,
      localUsers: state.users,
      localPodMembers: state.podMembers,
      cloudPodData: Object.values(cloud.byPod)
    }),
    [cloud.byPod, me.email, me.id, state.podMembers, state.users, typedEmails]
  );

  useEffect(() => {
    if (!open) return;
    setName(t("pod.defaultHomeName"));
    setCurrency(defaultCurrency === "USD" ? "USD" : "EUR");
    setGroupsRaw(t("pod.defaultGroups"));
    setEmailsRaw("");
    setError(null);
  }, [open, defaultCurrency, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const groupNames = groupsRaw
      .split(",")
      .map((group) => group.trim())
      .filter(Boolean);
    const emails = parseEmailList(emailsRaw);
    const invalid = emails.find((email) => !isEmailLike(email));
    if (invalid) {
      setError(template(t("pod.errorInvalidEmail"), { email: invalid }));
      return;
    }
    const ownEmailLower = me.email?.trim().toLowerCase();
    const inviteEmails = ownEmailLower ? emails.filter((email) => email !== ownEmailLower) : emails;
    const colors = ["mint", "lavender", "peach", "sky"];
    const groups = groupNames.map((group, index) => ({
      name: group,
      color: colors[index % colors.length]
    }));
    const perGroup = groups.length > 0 ? Math.max(1, Math.ceil(inviteEmails.length / groups.length)) : 0;
    const members = inviteEmails.map((email, index) => {
      const groupIndex = groups.length > 0 ? Math.min(Math.floor(index / perGroup), groups.length - 1) : -1;
      return {
        displayName: displayNameFromEmail(email),
        email,
        groupIndex: groupIndex >= 0 ? groupIndex : undefined,
        role: "editor" as const
      };
    });

    setSaving(true);
    try {
      const createdId = await actions.createMoneyPod({
        name: name.trim() || t("pod.defaultHomeName"),
        currency,
        groups,
        members
      });
      onCreated(createdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorCreatePot"));
    } finally {
      setSaving(false);
    }
  }

  function addSuggestedEmail(email: string) {
    const next = Array.from(new Set([...typedEmails, email.trim().toLowerCase()]));
    setEmailsRaw(next.join(", "));
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("pod.newSharedPot")} width={560}>
      <form onSubmit={submit} className="space-y-4">
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
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={podInputClass}
            placeholder={t("pod.defaultHomeName")}
            aria-label={t("pod.potName")}
          />
        </SetupField>
        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
          <SetupField label={t("pod.currency")}>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
              className={podInputClass}
              aria-label={t("pod.currency")}
            >
              {POD_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </SetupField>
          <SetupField label={t("pod.groups")}>
            <input
              value={groupsRaw}
              onChange={(event) => setGroupsRaw(event.target.value)}
              className={podInputClass}
              placeholder={t("pod.defaultGroups")}
              aria-label={t("pod.groups")}
            />
          </SetupField>
        </div>
        <SetupField
          label={t("pod.inviteByEmail")}
          hint={t("pod.inviteByEmailHint")}
        >
          <input
            value={emailsRaw}
            onChange={(event) => setEmailsRaw(event.target.value)}
            className={podInputClass}
            placeholder="friend@example.com, partner@example.com"
            aria-label={t("pod.inviteByEmail")}
          />
        </SetupField>
        {suggestedPeople.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t("pod.peopleYouKnow")}
              </p>
              <span className="text-[11px] text-[color:var(--color-ink-3)]">
                {suggestedPeople.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestedPeople.map((person) => (
                <button
                  key={person.email}
                  type="button"
                  onClick={() => addSuggestedEmail(person.email)}
                  className="nm-interactive min-w-0 w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-3 py-2.5 text-left hover:bg-[color:var(--color-glass)]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar
                      name={person.displayName}
                      src={person.avatarUrl}
                      size={32}
                      className="shrink-0 ring-1 ring-[color:var(--color-line)]"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[color:var(--color-ink)]">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-[color:var(--color-ink-3)]">
                        {person.email}
                      </span>
                    </div>
                    <Plus size={14} className="shrink-0 text-[color:var(--color-ink-3)]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <Button type="submit" variant="primary" disabled={saving} className="w-full">
          <Plus size={14} />
          {saving ? t("pod.creating") : t("pod.createPot")}
        </Button>
      </form>
    </Sheet>
  );
}
