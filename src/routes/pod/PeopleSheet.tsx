/**
 * People/pot-settings sheet: rename, invite by email, card labels, group
 * CRUD, invite link, delete/leave pot. Extracted from the former
 * `page.tsx`; behavior unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Plus, Trash2, UsersRound, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { displayNameFromEmail, isEmailLike, template } from "@/lib/podPageHelpers";
import { useAuth } from "@/services/auth";
import { useCurrentUser, usePodGroups, usePodMembers } from "@/services/store";
import { usePodActions } from "@/services/podActions";
import { rememberActiveMoneyPodId } from "@/lib/activeMoneyPod";
import type { MoneyPod, PodGroup, PodMember } from "@/lib/types";
import { Sheet } from "./shared";
import { InviteLinkBlock } from "./InviteLinkBlock";

/* ---- People Sheet (email invites + per-member card editing) ---- */

export function PeopleSheet({
  open,
  onClose,
  pod,
  focusedMemberId
}: {
  open: boolean;
  onClose: () => void;
  pod: MoneyPod;
  focusedMemberId: string | null;
}) {
  const { t } = useLocale();
  const me = useCurrentUser();
  const { currentAccount } = useAuth();
  const members = usePodMembers(pod.id);
  // Roster shows only active members; tombstoned leavers drop off the people
  // list. `members` is still used for the owner / duplicate-email checks.
  const activeMembers = useMemo(() => members.filter((m) => m.active !== false), [members]);
  const groups = usePodGroups(pod.id);
  const actions = usePodActions();
  const [email, setEmail] = useState("");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cardDrafts, setCardDrafts] = useState<Record<string, string>>({});
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [removeGroupId, setRemoveGroupId] = useState<string | null>(null);
  const [podNameDraft, setPodNameDraft] = useState(pod.name);
  const [podError, setPodError] = useState<string | null>(null);
  const [savingPod, setSavingPod] = useState(false);
  const memberCardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // Owner check: either the pod's ownerUserId points at me, or my linked
  // membership row carries role=owner. Belt-and-suspenders to match the
  // existing /shared dialog's logic.
  const isOwner =
    pod.ownerUserId === me.id ||
    members.some((m) => m.role === "owner" && m.linkedUserId === me.id);

  const [confirmDeletePod, setConfirmDeletePod] = useState(false);
  const [deletingPod, setDeletingPod] = useState(false);
  // The stored active-pod pointer must never keep referencing a pot the user
  // just left/deleted — repoint it (or clear when this was the only pot).
  function repointActivePod() {
    rememberActiveMoneyPodId(null);
  }
  async function handleDeletePod() {
    setDeletingPod(true);
    try {
      // Soft-unlinks members/expenses/history server-side; never cascades.
      // The pod page re-resolves the active pod to another (or the create
      // state) once this one disappears from the list.
      const result = await actions.deleteMoneyPod(pod.id);
      if ((result as { queued?: boolean }).queued) {
        // Offline: the delete is parked in the queue — don't pretend the pot
        // is gone while it's still visibly present until reconnect.
        setPodError(t("pod.queuedOffline"));
        setDeletingPod(false);
        setConfirmDeletePod(false);
        return;
      }
      repointActivePod();
      onClose();
    } catch {
      setPodError(t("pod.errorDeletePot"));
      setDeletingPod(false);
      setConfirmDeletePod(false);
    }
  }

  const [confirmLeavePod, setConfirmLeavePod] = useState(false);
  const [leavingPod, setLeavingPod] = useState(false);
  async function handleLeavePod() {
    setLeavingPod(true);
    try {
      // Removes only the caller's own membership (server-side, owner-rejected).
      // The pod drops out of this user's list; the page re-resolves.
      const result = await actions.leaveMoneyPod(pod.id);
      if ((result as { queued?: boolean }).queued) {
        setPodError(t("pod.queuedOffline"));
        setLeavingPod(false);
        setConfirmLeavePod(false);
        return;
      }
      repointActivePod();
      onClose();
    } catch {
      setPodError(t("pod.errorLeavePot"));
      setLeavingPod(false);
      setConfirmLeavePod(false);
    }
  }

  useEffect(() => {
    if (groupId && groups.some((g) => g.id === groupId)) return;
    setGroupId(groups[0]?.id ?? "");
  }, [groupId, groups]);

  useEffect(() => {
    if (!open) return;
    setPodNameDraft(pod.name);
    setPodError(null);
  }, [open, pod.name]);

  useEffect(() => {
    if (!open || !focusedMemberId) return;
    window.setTimeout(() => {
      memberCardRefs.current[focusedMemberId]?.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
    }, 180);
  }, [open, focusedMemberId, members.length]);

  async function renamePod(event: React.FormEvent) {
    event.preventDefault();
    setPodError(null);
    const next = podNameDraft.trim();
    if (!next) {
      setPodError(t("pod.errorPotName"));
      return;
    }
    if (next === pod.name) return;
    setSavingPod(true);
    try {
      await actions.updateMoneyPod(pod.id, { name: next });
    } catch (err) {
      setPodError(err instanceof Error ? err.message : t("pod.errorPotRename"));
    } finally {
      setSavingPod(false);
    }
  }

  async function invitePerson(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!isEmailLike(normalized)) {
      setError(t("pod.errorInviteEmail"));
      return;
    }
    if (members.some((m) => m.email?.toLowerCase() === normalized)) {
      setError(t("pod.errorInviteDuplicate"));
      return;
    }
    setSaving(true);
    try {
      await actions.addPodMember({
        podId: pod.id,
        displayName: displayNameFromEmail(normalized),
        email: normalized,
        groupId: groupId || undefined,
        role: "editor"
      });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorInvitePerson"));
    } finally {
      setSaving(false);
    }
  }

  async function addCardToMember(event: React.FormEvent, member: PodMember) {
    event.preventDefault();
    setError(null);
    const next = (cardDrafts[member.id] ?? "").trim();
    if (!next) {
      setError(t("pod.errorCardLabel"));
      return;
    }
    if ((member.cards ?? []).some((card) => card.toLowerCase() === next.toLowerCase())) {
      setError(t("pod.errorCardDuplicate"));
      return;
    }
    setSavingCardId(member.id);
    try {
      const nextCards = [...(member.cards ?? []), next];
      await actions.updatePodMember(member.id, member.podId, { cards: nextCards });
      setCardDrafts((prev) => ({ ...prev, [member.id]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorCardAdd"));
    } finally {
      setSavingCardId(null);
    }
  }

  async function removeCardFromMember(member: PodMember, card: string) {
    const nextCards = (member.cards ?? []).filter((c) => c !== card);
    await actions.updatePodMember(member.id, member.podId, { cards: nextCards });
  }

  async function reassignMember(member: PodMember, nextGroupId: string) {
    await actions.updatePodMember(member.id, member.podId, {
      groupId: nextGroupId || undefined
    });
  }

  async function removeMember(member: PodMember) {
    setSaving(true);
    try {
      await actions.deletePodMember(member);
      setRemoveMemberId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorRemovePerson"));
    } finally {
      setSaving(false);
    }
  }

  async function addGroup(event: React.FormEvent) {
    event.preventDefault();
    setGroupError(null);
    const trimmed = groupName.trim();
    if (!trimmed) {
      setGroupError(t("pod.errorGroupName"));
      return;
    }
    const colors = ["mint", "lavender", "peach", "sky"];
    try {
      await actions.addPodGroup({
        podId: pod.id,
        name: trimmed,
        color: colors[groups.length % colors.length]
      });
      setGroupName("");
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : t("pod.errorGroupAdd"));
    }
  }

  function startRenameGroup(group: PodGroup) {
    setRenamingGroupId(group.id);
    setRenameGroupName(group.name);
    setRemoveGroupId(null);
    setGroupError(null);
  }

  async function renameGroup(group: PodGroup) {
    setGroupError(null);
    const next = renameGroupName.trim();
    if (!next) {
      setGroupError(t("pod.errorGroupName"));
      return;
    }
    if (next === group.name) {
      setRenamingGroupId(null);
      return;
    }
    try {
      await actions.updatePodGroup(group, { name: next });
      setRenamingGroupId(null);
      setRenameGroupName("");
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : t("pod.errorGroupRename"));
    }
  }

  async function removeGroup(group: PodGroup) {
    setGroupError(null);
    try {
      await actions.deletePodGroup(group);
      setRemoveGroupId(null);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : t("pod.errorGroupDelete"));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("pod.potSettings")} width={620}>
      <div className="space-y-5">
        <form
          onSubmit={renamePod}
          className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t("pod.potName")}
              </p>
              <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-3)]">
                {t("pod.potNameHint")}
              </p>
            </div>
            {isOwner ? (
              <Button
                type="submit"
                variant="primary"
                disabled={savingPod || podNameDraft.trim() === pod.name}
                className="h-10 px-3 shrink-0 whitespace-nowrap"
              >
                {savingPod ? t("pod.saving") : t("save")}
              </Button>
            ) : null}
          </div>
          <input
            aria-label={t("pod.potName")}
            value={podNameDraft}
            onChange={(event) => setPodNameDraft(event.target.value)}
            disabled={!isOwner}
            className="w-full h-11 px-3 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] font-semibold text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] disabled:opacity-70"
          />
          {podError ? (
            <p className="text-[12px] text-[color:var(--color-negative)]">{podError}</p>
          ) : null}
        </form>

        <section className="space-y-3">
          <div className="px-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {t("pod.peopleCards")}
            </p>
          </div>
        <ul className="space-y-3">
          {activeMembers.map((m) => {
            const isMe = m.linkedUserId === me.id;
            const canEditCards = isMe || isOwner;
            const isMemberOwner = m.role === "owner";
            const isFocusedMember = focusedMemberId === m.id;
            return (
              <li
                key={m.id}
                ref={(node) => {
                  memberCardRefs.current[m.id] = node;
                }}
                className={cn(
                  "rounded-2xl border bg-[color:var(--color-bg)] p-3 transition",
                  isFocusedMember
                    ? "border-[color:var(--color-brand)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_18%,transparent)]"
                    : "border-[color:var(--color-line)]"
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={m.displayName} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[color:var(--color-ink)] truncate flex items-center gap-2">
                      <span className="truncate">{m.displayName}</span>
                      {isMe ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-brand-strong)] shrink-0">
                          {t("pod.you")}
                        </span>
                      ) : null}
                      {isMemberOwner ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)] shrink-0">
                          {t("pod.owner")}
                        </span>
                      ) : null}
                    </p>
                    <p
                      className="text-[11.5px] text-[color:var(--color-ink-3)] truncate"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {m.email ??
                        (isMe ? me.email ?? currentAccount?.email : undefined) ??
                        "—"}
                    </p>
                  </div>
                </div>

                {/* Cards row — buttons when editable, plain chips when read-only */}
                {(m.cards ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(m.cards ?? []).map((c) =>
                      canEditCards ? (
                        <button
                          key={c}
                          type="button"
                          onClick={() => removeCardFromMember(m, c)}
                          className="h-7 px-2.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[11.5px] font-medium text-[color:var(--color-ink-2)] flex items-center gap-1 hover:bg-[color:var(--color-cream-50)]"
                          title={t("pod.tapRemove")}
                        >
                          {c}
                          <X size={10} className="opacity-60" />
                        </button>
                      ) : (
                        <span
                          key={c}
                          className="h-7 px-2.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[11.5px] font-medium text-[color:var(--color-ink-3)] flex items-center"
                        >
                          {c}
                        </span>
                      )
                    )}
                  </div>
                ) : null}

                {canEditCards ? (
                  <form
                    onSubmit={(event) => addCardToMember(event, m)}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      value={cardDrafts[m.id] ?? ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [m.id]: event.target.value
                        }))
                      }
                      placeholder={t("pod.cardLabelPlaceholder")}
                      className="min-w-0 flex-1 h-9 px-3 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[13px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)]"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      disabled={savingCardId === m.id}
                      className="h-9 px-3 shrink-0"
                    >
                      <Plus size={13} />
                      {t("add")}
                    </Button>
                  </form>
                ) : null}

                {/* Owner controls: group dropdown (incl. assigning themselves)
                    plus remove for everyone except the owner. */}
                {isOwner && (groups.length > 0 || !isMemberOwner) ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                    {groups.length > 0 ? (
                      <select
                        value={m.groupId ?? ""}
                        onChange={(e) => reassignMember(m, e.target.value)}
                        className="flex-1 h-8 px-2 rounded-lg bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[12px] text-[color:var(--color-ink-2)] focus:outline-none focus:border-[color:var(--color-brand)]"
                      >
                        <option value="">{t("pod.noGroup")}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {!isMemberOwner ? (
                      <button
                        type="button"
                        onClick={() => setRemoveMemberId(m.id)}
                        className="h-8 px-2.5 rounded-lg bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[11.5px] font-medium text-[color:var(--color-negative)] hover:bg-[color:var(--color-cream-50)]"
                      >
                        {t("pod.remove")}
                      </button>
                    ) : null}
                    </div>
                    {removeMemberId === m.id ? (
                      <div className="rounded-xl border border-[color:var(--color-negative)]/25 bg-[color:var(--color-negative)]/8 p-2 text-[12px] text-[color:var(--color-ink-2)]">
                        <p>{template(t("pod.removePersonConfirm"), { name: m.displayName })}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setRemoveMemberId(null)}
                            className="h-8 flex-1 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] font-semibold"
                          >
                            {t("cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMember(m)}
                            disabled={saving}
                            className="h-8 flex-1 rounded-lg bg-[color:var(--color-negative)] text-[color:var(--color-on-negative)] font-semibold disabled:opacity-50"
                          >
                            {t("pod.remove")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        </section>

        {isOwner ? (
          <>
            <form
              onSubmit={addGroup}
              className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 space-y-2"
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t("pod.groups")}
              </p>
              {groups.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="min-h-8 pl-3 pr-1.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[12px] font-medium text-[color:var(--color-ink-2)] flex items-center gap-1"
                    >
                      {renamingGroupId === group.id ? (
                        <div className="flex items-center gap-1 py-1">
                          <input
                            value={renameGroupName}
                            onChange={(event) => setRenameGroupName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void renameGroup(group);
                              }
                            }}
                            className="h-7 w-[136px] rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-2 text-[16px] sm:text-[12px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void renameGroup(group)}
                            className="h-7 px-2 rounded-lg bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold"
                          >
                            {t("save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingGroupId(null)}
                            className="h-7 w-7 grid place-items-center rounded-lg hover:bg-[color:var(--color-cream-50)]"
                            aria-label={t("pod.cancelRename")}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRenameGroup(group)}
                          className="max-w-[160px] truncate"
                          title={t("pod.tapRename")}
                        >
                          {group.name}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setRemoveGroupId((current) =>
                            current === group.id ? null : group.id
                          )
                        }
                        aria-label={template(t("pod.deleteGroup"), { name: group.name })}
                        className="h-6 w-6 grid place-items-center rounded-full hover:bg-[color:var(--color-cream-50)]"
                      >
                        <X size={12} />
                      </button>
                      {removeGroupId === group.id ? (
                        <div className="ml-1 flex items-center gap-1">
                          <span className="text-[11px] text-[color:var(--color-negative)]">
                            {t("pod.unlinkQuestion")}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeGroup(group)}
                            className="h-6 px-2 rounded-full bg-[color:var(--color-negative)] text-[color:var(--color-on-negative)] text-[11px] font-semibold"
                          >
                            {t("pod.yes")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t("pod.newGroup")}
                  className="min-w-0 flex-1 h-10 px-3 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                />
                <Button type="submit" variant="ghost" className="h-10 px-3">
                  <Plus size={14} />
                  {t("add")}
                </Button>
              </div>
              {groupError ? (
                <p className="text-[12px] text-[color:var(--color-negative)]">{groupError}</p>
              ) : null}
            </form>

            <form
              onSubmit={invitePerson}
              className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 space-y-2"
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t("pod.invitePerson")}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                autoComplete="off"
                className="w-full h-10 px-3 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
              />
              {groups.length > 0 ? (
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                >
                  <option value="">{t("pod.noGroup")}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {error ? (
                <p className="text-[12px] text-[color:var(--color-negative)]">{error}</p>
              ) : null}
              <Button type="submit" variant="primary" disabled={saving} className="w-full">
                <UsersRound size={14} /> {saving ? t("pod.sending") : t("pod.sendInvite")}
              </Button>
              <p className="text-[11px] text-[color:var(--color-ink-3)] leading-snug">
                {t("pod.inviteHelp")}
              </p>
            </form>
            <InviteLinkBlock key={`${pod.id}:${open ? "open" : "closed"}`} pod={pod} />
          </>
        ) : (
          <p className="text-[12px] text-[color:var(--color-ink-3)] px-1">
            {template(t("pod.ownerInviteOnly"), {
              name: members.find((m) => m.role === "owner")?.displayName ?? t("pod.owner")
            })}
          </p>
        )}

        {isOwner ? (
          <div className="rounded-2xl border border-[color:var(--color-negative-soft)] bg-[color:var(--color-negative-mist)] p-3">
            {confirmDeletePod ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-[12.5px] font-medium leading-snug text-[color:var(--color-ink-2)]">
                  {template(t("pod.deletePotConfirm"), { name: pod.name })}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmDeletePod(false)}
                  disabled={deletingPod}
                  className="h-9 px-3 rounded-xl text-[13px] font-semibold text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper)] disabled:opacity-60"
                >
                  {t("pod.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDeletePod}
                  disabled={deletingPod}
                  aria-label={t("pod.deletePotConfirmAria")}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[color:var(--color-negative)] text-[color:var(--color-on-negative)] text-[13px] font-semibold disabled:opacity-60"
                >
                  <Trash2 size={14} /> {deletingPod ? t("pod.deletingPot") : t("pod.deletePot")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeletePod(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[color:var(--color-negative-soft)] text-[color:var(--color-negative)] text-[13px] font-semibold hover:bg-[color:var(--color-paper)]"
              >
                <Trash2 size={14} /> {t("pod.deletePot")}
              </button>
            )}
          </div>
        ) : null}

        {!isOwner ? (
          <div className="rounded-2xl border border-[color:var(--color-negative-soft)] bg-[color:var(--color-negative-mist)] p-3">
            {confirmLeavePod ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-[12.5px] font-medium leading-snug text-[color:var(--color-ink-2)]">
                  {template(t("pod.leavePotConfirm"), { name: pod.name })}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmLeavePod(false)}
                  disabled={leavingPod}
                  className="h-9 px-3 rounded-xl text-[13px] font-semibold text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper)] disabled:opacity-60"
                >
                  {t("pod.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleLeavePod}
                  disabled={leavingPod}
                  aria-label={t("pod.leavePotConfirmAria")}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[color:var(--color-negative)] text-[color:var(--color-on-negative)] text-[13px] font-semibold disabled:opacity-60"
                >
                  <LogOut size={14} /> {leavingPod ? t("pod.leavingPot") : t("pod.leaveShort")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeavePod(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[color:var(--color-negative-soft)] text-[color:var(--color-negative)] text-[13px] font-semibold hover:bg-[color:var(--color-paper)]"
              >
                <LogOut size={14} /> {t("pod.leavePot")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
