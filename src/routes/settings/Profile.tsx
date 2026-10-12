import { useState } from "react";

import {
  Plus,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { Select } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

import { useAppMode } from "@/lib/appMode";

import { usePushProfile } from "@/lib/profileSync";

import { LOCALES, useLocale } from "@/lib/i18n";

import {
  useCurrentPortfolioId,
  usePortfolios
} from "@/services/store";
import { CreatePortfolioDialog } from "@/components/features/CreatePortfolioDialog";
import type { AppLocale } from "@/lib/types";


export function PortfoliosCard() {
  const [appMode] = useAppMode();
  const portfolios = usePortfolios();
  const [currentId, setCurrentId] = useCurrentPortfolioId();
  const [createOpen, setCreateOpen] = useState(false);
  const { t } = useLocale();

  if (appMode !== "advanced") return null;

  return (
    <Card>
      <CardHeader
        title={t("settings.portfoliosTitle")}
        subtitle={t("settings.portfoliosSubtitle")}
        trailing={
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> {t("settings.new")}
          </Button>
        }
      />
      <CardBody className="space-y-1">
        {portfolios.map((p) => {
          const active = p.id === currentId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrentId(p.id)}
              className={cn(
                "w-full flex items-center gap-3 min-h-12 px-3 rounded-xl text-left transition active:scale-[0.99]",
                active
                  ? "bg-[color:var(--color-brand-mist)]"
                  : "hover:bg-[color:var(--color-cream-50)]"
              )}
              aria-pressed={active}
            >
              <span
                className={cn(
                  "grid place-items-center w-9 h-9 rounded-xl shrink-0",
                  active
                    ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]"
                    : "bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)]"
                )}
              >
                <span className="text-[13px] font-semibold">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] tracking-tight truncate">
                  {p.name}
                </p>
                <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">
                  {p.tagline ?? p.type}
                </p>
              </div>
              {active ? (
                <span className="text-[10px] font-mono tracking-[0.14em] uppercase text-[color:var(--color-brand-strong)]">
                  {t("active")}
                </span>
              ) : null}
            </button>
          );
        })}
      </CardBody>
      <CreatePortfolioDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

export function LanguageCard() {
  const { locale, setLocale, t } = useLocale();
  const pushProfile = usePushProfile();

  function changeLocale(next: AppLocale) {
    setLocale(next);
    pushProfile({ locale: next });
  }

  return (
    <Card>
      <CardHeader title={t("language")} subtitle={t("languageHint")} />
      <CardBody className="space-y-3">
        <Select value={locale} onChange={(e) => changeLocale(e.target.value as AppLocale)}>
          {LOCALES.map((item) => (
            <option key={item.value} value={item.value}>
              {/* ru/es translation coverage is partial — labelled beta for v1. */}
              {item.value === "en" ? item.nativeName : `${item.nativeName} (beta)`}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-[color:var(--color-ink-4)]">
          {t("systemLanguage")}: {navigator.language}
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * Live "On / Off / Blocked" value for the account-list Notifications row —
 * same source of truth as NotificationsCard (browser permission + this-device
 * push subscription) instead of the hardcoded "On" it used to show.
 */
