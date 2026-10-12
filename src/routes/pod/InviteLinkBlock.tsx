/**
 * People/pot-settings sheet: owner-only shareable invite link, extracted from
 * `PeopleSheet.tsx` so the sheet stays under the max-lines budget. Behavior is
 * unchanged; the raw invite code still exists only in this component's state.
 */
import { useState } from "react";
import { Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/lib/i18n";
import { template } from "@/lib/podPageHelpers";
import { useCloudState } from "@/services/cloudStore";
import { usePodActions } from "@/services/podActions";
import type { MoneyPod } from "@/lib/types";

/**
 * Owner-only shareable invite link. The raw code exists only in this
 * component's state (the server stores a hash); minting a new link silently
 * revokes the previous one, so there is always at most ONE live link to reason
 * about. Remounted (via key) on sheet open so a stale link never lingers.
 */
export function InviteLinkBlock({ pod }: { pod: MoneyPod }) {
  const { t } = useLocale();
  const actions = usePodActions();
  const cloud = useCloudState();
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCloudPod = cloud.enabled && cloud.moneyPods.some((p) => p.id === pod.id);
  if (!isCloudPod) return null;

  async function createLink() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { code, expiresAt } = await actions.createPodInviteCode(pod.id);
      setLink({ url: `${window.location.origin}/pod?join=${code}`, expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.inviteLinkError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("pod.inviteLinkError"));
    }
  }

  async function shareLink() {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: pod.name, url: link.url });
        return;
      } catch {
        // Dismissed the share sheet — fall through to copy.
      }
    }
    await copyLink();
  }

  async function revokeLinks() {
    setBusy(true);
    setError(null);
    try {
      await actions.revokePodInviteCodes(pod.id);
      setLink(null);
      setNotice(t("pod.inviteLinkRevoked"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.inviteLinkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 space-y-2">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {t("pod.inviteLink")}
      </p>
      {link ? (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[color:var(--color-ink)]" style={{ fontFamily: "var(--font-mono)" }}>
              {link.url}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="primary" onClick={() => void copyLink()} className="w-full">
              {copied ? t("pod.inviteLinkCopied") : t("pod.inviteLinkCopy")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void shareLink()} className="w-full">
              {t("pod.inviteLinkShare")}
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-[color:var(--color-ink-3)]">
            {template(t("pod.inviteLinkExpires"), {
              date: new Date(link.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            })}
          </p>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void createLink()}
          className="w-full"
        >
          <LinkIcon size={14} /> {busy ? t("pod.inviteLinkCreating") : t("pod.inviteLinkCreate")}
        </Button>
      )}
      {error ? <p className="text-[12px] text-[color:var(--color-negative)]">{error}</p> : null}
      {notice ? <p className="text-[12px] text-[color:var(--color-ink-3)]">{notice}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-[color:var(--color-ink-3)]">
          {t("pod.inviteLinkHint")}
        </p>
        <button
          type="button"
          onClick={() => void revokeLinks()}
          disabled={busy}
          className="shrink-0 text-[11.5px] font-semibold text-[color:var(--color-negative)] underline-offset-2 hover:underline disabled:opacity-50"
        >
          {t("pod.inviteLinkRevoke")}
        </button>
      </div>
    </div>
  );
}
