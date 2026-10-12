import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "./OnboardingLayout";
import { useAppMode } from "@/lib/appMode";
import { usePushProfile } from "@/lib/profileSync";
import { revealDelay } from "@/lib/motion";
import {
  appModeForPrimaryJob,
  ONBOARDING_JOBS,
  starterTemplateForPrimaryJob,
  storeOnboardingIntent
} from "@/lib/productPositioning";
import type { PrimaryJob } from "@/lib/types";

/** Choose the job first; appearance remains available in Settings. */
export default function ModeScreen() {
  const navigate = useNavigate();
  const [, setMode] = useAppMode();
  const pushProfile = usePushProfile();

  function pick(job: PrimaryJob) {
    const appMode = appModeForPrimaryJob(job);
    const starterTemplate = starterTemplateForPrimaryJob(job);
    setMode(appMode);
    storeOnboardingIntent(job, starterTemplate);
    pushProfile({ appMode, primaryJob: job, starterTemplate });
  }

  function pickAndContinue(job: PrimaryJob) {
    pick(job);
    navigate("/onboarding/setup");
  }

  return (
    <OnboardingLayout
      step={1}
      total={2}
      variant="wide"
      eyebrow="Step 1 of 2"
      title={
        <>
          How will you use <span className="text-[color:var(--color-brand)]">Numa Pro?</span>
        </>
      }
      subtitle="Tap a starting point to continue. You can switch any time in Settings."
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        {ONBOARDING_JOBS.map((option, index) => {
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => pickAndContinue(option.id)}
              className="nm-reveal rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 text-left transition-colors hover:border-[color:var(--color-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--color-brand)]"
              style={revealDelay(index, 60)}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p
                    className="text-[22px] font-bold tracking-[-0.025em] leading-none text-[color:var(--color-ink)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {option.title}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[15px] text-[color:var(--color-ink-2)] leading-relaxed">
                {option.description}
              </p>
              <p className="mt-4 text-[13px] font-semibold text-[color:var(--color-ink)]">{option.firstAction} →</p>
            </button>
          );
        })}
      </div>

    </OnboardingLayout>
  );
}
