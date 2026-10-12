/**
 * Shared-pot one-screen UI. Routed at `/pod` and also rendered by HomeRouter
 * when `appMode === "shared"`, so a Shared-only user lands here directly on
 * "/". The page is intentionally narrow and mobile-first: pot total → my
 * balance → recent expenses → floating Add. Everything else (member CRUD,
 * card editing, settle-up) lives in inline sheets split into sibling files.
 *
 * Multi-pod is supported but secondary — Shared mode users typically have
 * exactly one pot ("Home"), so we pick the first pod and surface a switcher
 * only when there are >1.
 */
import { useEffect, useRef, useState } from "react";

import { Check, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LoadingSurface } from "@/components/layout/LoadingSurface";
import { cn } from "@/lib/cn";

import { useLocale } from "@/lib/i18n";
import { rememberActiveMoneyPodId, readActiveMoneyPodId } from "@/lib/activeMoneyPod";
import { useCloudState } from "@/services/cloudStore";
import { useCurrentUser, useMoneyPods } from "@/services/store";
import { usePodActions } from "@/services/podActions";
import { FirstRunSetup } from "./FirstRun";
import { PodSurface } from "./Surface";
import { PodLoadingSurface } from "./PodLoadingSurface";

export default function PodPage() {
  const pods = useMoneyPods();
  const me = useCurrentUser();
  const cloud = useCloudState();
  const { t } = useLocale();
  const podActions = usePodActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => readActiveMoneyPodId() ?? pods[0]?.id ?? null
  );

  // /pod?join=CODE — redeem a shareable invite link. One attempt per code;
  // the param is stripped either way so reloads don't re-fire the mutation.
  const joinCode = searchParams.get("join");
  const joinAttemptRef = useRef<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null
  );
  useEffect(() => {
    if (!joinCode || !cloud.enabled || joinAttemptRef.current === joinCode) return;
    joinAttemptRef.current = joinCode;
    void (async () => {
      try {
        const result = await podActions.joinPodByCode(joinCode);
        setSelectedId(result.podId);
        rememberActiveMoneyPodId(result.podId);
        setJoinNotice({
          tone: "ok",
          text: result.alreadyMember ? t("pod.joinAlready") : t("pod.joinSuccess")
        });
      } catch (err) {
        const data = (err as { data?: { message?: string } })?.data;
        setJoinNotice({ tone: "error", text: data?.message ?? t("pod.joinFailed") });
      } finally {
        setSearchParams(
          (params) => {
            const next = new URLSearchParams(params);
            next.delete("join");
            return next;
          },
          { replace: true }
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, cloud.enabled]);
  useEffect(() => {
    if (!joinNotice) return;
    const id = window.setTimeout(() => setJoinNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [joinNotice]);

  // Keep selected in sync when the cloud-side pod list lands later than the
  // initial render. Without this, fresh signups stay on the first-run setup
  // card forever even after the pod they just created appears.
  useEffect(() => {
    if (selectedId && pods.some((p) => p.id === selectedId)) return;
    if (pods[0]) setSelectedId(pods[0].id);
  }, [pods, selectedId]);

  const selected = pods.find((p) => p.id === selectedId) ?? pods[0] ?? null;
  useEffect(() => {
    if (selected?.id) rememberActiveMoneyPodId(selected.id);
  }, [selected?.id]);
  const selectedIsCloudPod = selected
    ? cloud.moneyPods.some((pod) => pod.id === selected.id)
    : false;
  const selectedDataLoading =
    Boolean(selected) && cloud.enabled && selectedIsCloudPod && !cloud.byPod[selected!.id];
  const podListLoading = !selected && cloud.enabled && cloud.loading;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 pb-4 pt-3 sm:px-4 sm:pt-4 lg:max-w-none lg:px-0 lg:pb-0 lg:pt-0">
      {joinNotice ? (
        <div
          role="status"
          className={cn(
            "mb-3 flex items-center gap-2 rounded-2xl border px-4 py-3 text-[13px] font-semibold shadow-[var(--shadow-sm)]",
            joinNotice.tone === "ok"
              ? "border-[color:var(--color-positive)]/35 bg-[color:var(--color-positive-soft,var(--color-brand-soft))] text-[color:var(--color-ink)]"
              : "border-[color:var(--color-negative)]/35 bg-[color:var(--color-paper)] text-[color:var(--color-negative)]"
          )}
        >
          {joinNotice.tone === "ok" ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
          <span className="min-w-0 flex-1">{joinNotice.text}</span>
        </div>
      ) : null}
      {podListLoading ? (
        <LoadingSurface compact className="min-h-[460px]" />
      ) : selectedDataLoading && selected ? (
        <PodLoadingSurface pod={selected} switchablePods={pods} onSwitch={setSelectedId} />
      ) : selected ? (
        <PodSurface pod={selected} switchablePods={pods} onSwitch={setSelectedId} />
      ) : (
        <FirstRunSetup
          defaultCurrency={me.defaultCurrency}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}
