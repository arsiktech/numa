import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  Webhook
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";

import { useAuth } from "@/services/auth";
import { useCloudState } from "@/services/cloudStore";

import { useLocale } from "@/lib/i18n";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
export function WebhooksCard() {
  const cloud = useCloudState();
  const { currentAccount } = useAuth();
  const tokens = useQuery(api.webhookTokens.listMine);
  const createToken = useMutation(api.webhookTokens.createToken);
  const revokeToken = useMutation(api.webhookTokens.revokeToken);
  const { locale, t } = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editablePortfolios = useMemo(() => {
    return cloud.portfolios.filter((p) => {
      const pdata = cloud.byPortfolio[p.id];
      if (!pdata) return false;
      const myMembership = pdata.memberships.find((m) => m.userId === currentAccount?.id);
      return myMembership?.role === "owner" || myMembership?.role === "editor";
    });
  }, [cloud.portfolios, cloud.byPortfolio, currentAccount?.id]);

  // No portfolios → render nothing (per spec: only visible when user has
  // at least one cloud portfolio they can edit).
  if (editablePortfolios.length === 0) return null;

  async function handleRevoke(id: Id<"webhookTokens">) {
    try {
      await revokeToken({ id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.revokeError"));
    }
  }

  async function handleCreate(input: { label: string; portfolioId: string }) {
    setError(null);
    try {
      const result = await createToken({
        portfolioId: input.portfolioId as Id<"portfolios">,
        label: input.label
      });
      setNewToken(result.token);
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.createTokenError"));
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t("settings.automationsTitle")}
          subtitle={t("settings.automationsSubtitle")}
          trailing={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setError(null);
                setDialogOpen(true);
              }}
            >
              <Plus size={14} /> {t("settings.generateToken")}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {tokens === undefined ? (
            <p className="text-[13px] text-[color:var(--color-ink-4)]">{t("settings.loading")}</p>
          ) : tokens.length === 0 ? (
            <p className="text-[13px] text-[color:var(--color-ink-4)]">
              {t("settings.noTokens")}
            </p>
          ) : (
            <div className="divide-y divide-[color:var(--color-line)]/60 -mx-2">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center gap-3 px-2 py-3"
                >
                  <div className="w-9 h-9 rounded-xl grid place-items-center bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-2)] shrink-0">
                    <Webhook size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">
                      {token.label}
                    </p>
                    <p className="text-[12px] text-[color:var(--color-ink-3)] truncate">
                      {token.portfolioName} ·{" "}
                      {new Date(token.createdAt).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                      {" · "}
                      {token.uses} {token.uses === 1 ? t("settings.useOne") : t("settings.uses")}
                      {token.lastUsedAt
                        ? ` · ${t("settings.last")} ${new Date(token.lastUsedAt).toLocaleDateString(
                            locale,
                            { month: "short", day: "numeric" }
                          )}`
                        : ` · ${t("settings.neverUsed")}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(token.id as Id<"webhookTokens">)}
                    aria-label={`${t("settings.revoke")} ${token.label}`}
                  >
                    <Trash2 size={13} /> {t("settings.revoke")}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-ink-3)] mb-1.5">
              {t("settings.shortcutsGuide")}
            </p>
            <pre className="text-[11.5px] leading-relaxed rounded-xl bg-[color:var(--color-cream-100)] border border-[color:var(--color-line)] px-3 py-2.5 overflow-x-auto whitespace-pre">
{`POST URL
https://numa-ecru.vercel.app/api/webhooks/transaction

Headers
Content-Type: application/json

Sample expense body
{ "token": "numa_wh_xxx", "amount": 12.5, "currency": "EUR", "kind": "expense", "description": "Coffee", "occurredAt": "2026-05-14T10:00:00Z", "categoryName": "Dining" }`}
            </pre>
          </div>

          {error ? (
            <p className="text-[12px] text-[color:var(--color-negative)]">{error}</p>
          ) : null}
        </CardBody>
      </Card>

      <NewTokenDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        portfolios={editablePortfolios.map((p) => ({ id: p.id, name: p.name }))}
        onSubmit={handleCreate}
      />

      <RevealTokenDialog
        token={newToken}
        onClose={() => setNewToken(null)}
      />
    </>
  );
}

export function NewTokenDialog({
  open,
  onClose,
  portfolios,
  onSubmit
}: {
  open: boolean;
  onClose: () => void;
  portfolios: Array<{ id: string; name: string }>;
  onSubmit: (input: { label: string; portfolioId: string }) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [portfolioId, setPortfolioId] = useState<string>(
    portfolios[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);
  const { t } = useLocale();

  // Reset form fields each time the dialog opens.
  useEffect(() => {
    if (open) {
      setLabel("");
      setPortfolioId(portfolios[0]?.id ?? "");
    }
  }, [open, portfolios]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !portfolioId) return;
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), portfolioId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("settings.tokenDialogTitle")}
      description={t("settings.tokenDialogDescription")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("settings.tokenLabel")} hint={t("settings.tokenLabelHint")}>
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Zapier"
            maxLength={60}
            autoFocus
          />
        </Field>
        <Field label={t("settings.tokenPortfolio")}>
          <Select
            value={portfolioId}
            onChange={(e) => setPortfolioId(e.target.value)}
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !label.trim() || !portfolioId}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {busy ? t("settings.generating") : t("settings.generate")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RevealTokenDialog({
  token,
  onClose
}: {
  token: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { t } = useLocale();

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard may be blocked — user can still long-press to copy */
    }
  }

  return (
    <Dialog
      open={token !== null}
      onClose={onClose}
      title={t("settings.copyTokenTitle")}
      description={t("settings.copyTokenDescription")}
      width={520}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-100)] px-3 py-2.5 text-[12.5px] font-mono break-all">
          {token ?? ""}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t("copied") : t("settings.copy")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("settings.savedToken")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

