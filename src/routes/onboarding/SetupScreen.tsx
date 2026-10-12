import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gauge, PiggyBank, Sparkles } from "lucide-react";
import { OnboardingLayout } from "./OnboardingLayout";
import { useAppMode } from "@/lib/appMode";
import {
  readOnboardingPotName,
  readOnboardingWeeklyTarget,
  storeOnboardingPotName,
  storeOnboardingWeeklyTarget
} from "@/lib/productPositioning";
import { cn } from "@/lib/cn";
import { revealDelay } from "@/lib/motion";

const TARGETS = [150, 250, 400, 650];

export default function SetupScreen() {
  const navigate = useNavigate();
  const [mode] = useAppMode();
  const [target, setTarget] = useState(() => readOnboardingWeeklyTarget(250));
  const [potName, setPotName] = useState(() => readOnboardingPotName());

  const copy = useMemo(() => {
    if (mode === "shared") {
      return {
        eyebrow: "Step 2 of 2",
        title: "Name the first pot.",
        subtitle: "You can invite people and tune cards after launch.",
        lead: "Shared pot starts with one place for joint expenses.",
        detail: "The first screen will be people, balances, adding a split, and settling up."
      };
    }
    if (mode === "advanced") {
      return {
        eyebrow: "Step 2 of 2",
        title: "Set a weekly target.",
        subtitle: "A starting target for weekly spending. You can adjust it later.",
        lead: "Start with everyday spending.",
        detail: "Add accounts, holdings, and debts from Capital when you are ready."
      };
    }
    return {
      eyebrow: "Step 2 of 2",
      title: "Set a weekly target.",
      subtitle: "A starting point, not a limit on what you can spend.",
      lead: "Simple works best with one weekly spending target.",
      detail: "No charts first, no setup maze. Just the week, buckets, and quick capture."
    };
  }, [mode]);

  function pick(next: number) {
    setTarget(next);
    storeOnboardingWeeklyTarget(next);
  }

  function pickAndContinue(next: number) {
    pick(next);
    navigate("/onboarding/ready");
  }

  function nextStep() {
    // A weekly-spend target has no meaning for joint expenses — shared mode
    // stores the pot name instead (QA 2026-06-24, mismatched-control finding).
    if (mode === "shared") storeOnboardingPotName(potName);
    else storeOnboardingWeeklyTarget(target);
    navigate("/onboarding/ready");
  }

  return (
    <OnboardingLayout
      step={2}
      total={2}
      variant="wide"
      onBack={() => navigate("/onboarding/mode")}
      eyebrow={copy.eyebrow}
      title={
        <>
          {copy.title.split(" ").slice(0, -1).join(" ")}{" "}
          <span className="text-[color:var(--color-brand)]">
            {copy.title.split(" ").slice(-1)}
          </span>
        </>
      }
      subtitle={copy.subtitle}
    >
      <section className="grid min-h-0 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)]">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
            {mode === "shared" ? <PiggyBank size={22} /> : mode === "advanced" ? <Sparkles size={21} /> : <Gauge size={22} />}
          </div>
          <h2 className="mt-3 text-[20px] sm:text-[24px] font-bold leading-[1.05] tracking-[-0.035em] text-[color:var(--color-ink)]">
            {copy.lead}
          </h2>
          <p className="mt-2 text-[12px] sm:text-[13px] leading-relaxed text-[color:var(--color-ink-3)]">
            {copy.detail}
          </p>
        </div>

        {mode === "shared" ? (
          <div className="rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-3 sm:p-4 shadow-[var(--shadow-sm)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
              pot name
            </p>
            <input
              value={potName}
              onChange={(event) => setPotName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  nextStep();
                }
              }}
              placeholder="Home"
              aria-label="Pot name"
              className="mt-2 h-12 w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-4 text-[16px] font-semibold text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
            />
            <p className="mt-2 text-[11.5px] leading-snug text-[color:var(--color-ink-3)]">
              Rename it any time. Invites and cards come after launch.
            </p>
          </div>
        ) : (
        <div className="rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-3 sm:p-4 shadow-[var(--shadow-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            weekly target
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TARGETS.map((value, index) => {
              const active = target === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickAndContinue(value)}
                  className={cn(
                    "nm-reveal min-h-[68px] sm:min-h-[88px] rounded-2xl border px-3 py-2.5 sm:py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                    active
                      ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-mist)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_12%,transparent)]"
                      : "border-[color:var(--color-line)] bg-[color:var(--color-bg)] hover:border-[color:var(--color-line-strong)]"
                  )}
                  style={revealDelay(index, 60)}
                >
                  <span className="block text-[24px] sm:text-[28px] font-bold leading-none tracking-[-0.04em] text-[color:var(--color-ink)]">
                    €{value}
                  </span>
                  <span className="mt-1.5 sm:mt-2 block text-[10.5px] sm:text-[11px] text-[color:var(--color-ink-3)]">
                    {"per week"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}
      </section>

      <button
        type="button"
        onClick={nextStep}
        className="h-[54px] w-full sm:max-w-[420px] sm:self-center rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[15px] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
      >
        {mode === "shared" ? "Continue with this pot" : `Continue with €${target}`}
      </button>
    </OnboardingLayout>
  );
}
