import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Dialog";
import { useLocale } from "@/lib/i18n";
import { useCurrentPortfolioId } from "@/services/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function failure(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Connects one Numa Shared household. The key is stored on the server and is not shown again. */
export function SharedBalancesCard() {
  const { t } = useLocale();
  const [portfolioId] = useCurrentPortfolioId();
  const links = useQuery(api.sharedLinks.listForPortfolio, portfolioId ? { portfolioId: portfolioId as Id<"portfolios"> } : "skip");
  const connect = useMutation(api.sharedLinks.connect);
  const syncNow = useMutation(api.sharedLinks.syncNow);
  const disconnect = useMutation(api.sharedLinks.disconnect);
  const [householdId, setHouseholdId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await work(); } catch (err) { setError(failure(err)); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader title={t("settings.sharedTitle")} subtitle={t("settings.sharedSubtitle")} />
      <CardBody className="flex flex-col gap-3">
        {links === undefined ? <p className="text-[13px] text-[color:var(--color-ink-3)]">{t("settings.loading")}</p> : null}
        {links?.length === 0 ? <p className="text-[13px] text-[color:var(--color-ink-3)]">{t("settings.sharedEmpty")}</p> : null}
        {links?.map((link) => (
          <div key={link.id} className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] px-3 py-2">
            <p className="text-[13px] font-medium">{link.householdId}</p>
            <p className="text-[12.5px] text-[color:var(--color-ink-3)]">
              {link.status === "stale" ? t("settings.sharedStale") : link.readingAt ? new Date(link.readingAt).toLocaleString() : t("settings.sharedEmpty")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void run(() => syncNow({ id: link.id })); }}>{t("settings.sharedSync")}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void run(() => disconnect({ id: link.id })); }}>{t("settings.sharedDisconnect")}</Button>
            </div>
          </div>
        ))}
        <Field label={t("settings.sharedHousehold")}>
          <TextInput value={householdId} onChange={(e) => setHouseholdId(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t("settings.sharedKey")}>
          <TextInput value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" />
        </Field>
        {error ? <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p> : null}
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !householdId.trim() || !token.trim()}
          onClick={() => {
            void run(async () => {
              await connect({ portfolioId: portfolioId as Id<"portfolios">, householdId: householdId.trim(), token: token.trim() });
              setToken("");
              setHouseholdId("");
            });
          }}
        >
          {t("settings.sharedConnect")}
        </Button>
      </CardBody>
    </Card>
  );
}
