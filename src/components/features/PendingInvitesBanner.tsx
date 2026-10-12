import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Mail, X } from "lucide-react";
import { toastMotion } from "@/lib/motion";
import { useMutation } from "convex/react";
import { cloudAvailable, useCloudState } from "@/services/cloudStore";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Shows a sticky banner with any pending portfolio invites the current user
 * has received. Accepting redeems them all in one mutation; rejecting hides
 * the banner locally (the invite stays in `pending` server-side so the
 * inviter can revoke or the user can come back later).
 */
export function PendingInvitesBanner() {
  if (!cloudAvailable) return null;
  return <CloudPendingInvitesBanner />;
}

function CloudPendingInvitesBanner() {
  const { pendingInvites } = useCloudState();
  const redeem = useMutation(api.memberships.redeemInvitesForMe);
  const revoke = useMutation(api.invites.revokeInvite);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  const visible = pendingInvites.filter((i) => !dismissedIds.has(i.inviteId));
  if (visible.length === 0) return null;

  async function acceptAll() {
    setAccepting(true);
    try {
      await redeem();
    } catch (err) {
      console.error("[invites] redeem failed:", err);
    } finally {
      setAccepting(false);
    }
  }

  async function dismiss(inviteId: string) {
    setDismissedIds((s) => new Set([...s, inviteId]));
    try {
      await revoke({ id: inviteId as unknown as Id<"invites"> });
    } catch {
      // The user only invited themselves to dismiss; if revoke fails (they're
      // not the inviter), the row simply stays pending. No-op.
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="invite-banner"
        {...toastMotion}
        className="px-4 sm:px-6 lg:px-8 pt-4"
      >
        <div className="w-full">
          <div className="nm-glass-strong rounded-2xl border border-[color:var(--color-brand-soft)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] shrink-0">
              <Mail size={17} strokeWidth={1.75} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                {visible.length === 1
                  ? `You've been invited to "${visible[0]!.portfolioName}"`
                  : `${visible.length} portfolio invites waiting for you`}
              </p>
              <p className="text-[12px] text-[color:var(--color-ink-3)] truncate">
                {visible.length === 1
                  ? `${(visible[0]!.ownershipBps / 100).toFixed(0)}% ownership · ${visible[0]!.role} role`
                  : visible.map((i) => i.portfolioName).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {visible.length === 1 ? (
                <button
                  type="button"
                  onClick={() => dismiss(visible[0]!.inviteId)}
                  aria-label="Decline"
                  className="grid place-items-center w-9 h-9 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-negative)] hover:border-[color:var(--color-negative-soft)] transition-colors"
                >
                  <X size={14} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={acceptAll}
                disabled={accepting}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[13px] font-semibold hover:bg-[color:var(--color-brand-strong)] transition-colors disabled:opacity-60"
              >
                <Check size={14} />
                {accepting
                  ? "Accepting…"
                  : visible.length === 1
                    ? "Accept"
                    : `Accept all (${visible.length})`}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
