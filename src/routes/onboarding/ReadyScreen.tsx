import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSurface } from "@/components/layout/LoadingSurface";
import { useAuth } from "@/services/auth";
import { clearPendingOnboardingFlow, markOnboardingFlowComplete } from "@/lib/onboardingFlow";
import { usePushProfile } from "@/lib/profileSync";

/** Preserve completion and legacy links without a decorative countdown. */
export default function ReadyScreen() {
  const navigate = useNavigate();
  const { currentAccount } = useAuth();
  const pushProfile = usePushProfile();
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!currentAccount?.id || currentAccount.id === "cloud-loading" || launchedRef.current) return;
    launchedRef.current = true;
    const accountId = currentAccount.id;
    async function finish() {
      // Failed writes remain in the existing account-scoped preference retry stash.
      await pushProfile({ onboardingCompletedAt: Date.now() });
      markOnboardingFlowComplete(accountId);
      clearPendingOnboardingFlow();
      navigate("/", { replace: true });
    }
    void finish();
  }, [currentAccount?.id, navigate, pushProfile]);

  return <LoadingSurface />;
}
