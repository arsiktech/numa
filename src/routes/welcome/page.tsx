import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { useAuth } from "@/services/auth";
import { useTheme } from "@/lib/theme";
import { useAppMode } from "@/lib/appMode";
import { emailSignInErrorMessage } from "@/lib/authErrorText";
import { useLocale } from "@/lib/i18n";
import { validatePasswordPolicy } from "../../../convex/lib/passwordPolicy";
import { localizePasswordPolicyIssues } from "@/lib/passwordPolicyText";
import { getPendingOnboardingFlow } from "@/lib/onboardingFlow";
import { revealDelay } from "@/lib/motion";
import { template } from "@/lib/podPageHelpers";
import { WelcomeProductPanel } from "./WelcomeProductPanel";
import { WelcomeEmailForm, WelcomeSocialAuth } from "./WelcomeAuthForms";

/** Client-side throttle between "resend verification code" requests. */
const RESEND_COOLDOWN_MS = 30_000;

/**
 * Pre-auth Welcome landing — the ONLY pre-auth surface.
 *
 * Design ref: PDF page 2 "Land them soft." + user request: no separate
 * /login or /signup routes. The page hosts:
 *   • Google OAuth (covers both new accounts and returning ones)
 *   • An inline email toggle that expands password sign-in/sign-up for users
 *     who do not want OAuth.
 *
 * Theme: follows the saved light/dark preference, with an inline toggle on
 * this page. The palette is pinned to Citrus regardless of stored preference
 * so the first frame is consistent with the brand; the user can swap palette
 * later in Settings.
 *
 * After OAuth / email login lands, we navigate to / and let the shared
 * authenticated onboarding gate decide whether this session is truly fresh.
 */
export default function WelcomePage() {
  const {
    currentAccount,
    signIn,
    signUp,
    signInWithProvider,
    passwordResetEnabled,
    requestPasswordReset,
    confirmPasswordReset,
    emailVerificationEnabled,
    verifyEmail,
    resendVerification,
    googleOAuthEnabled,
    appleOAuthEnabled
  } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "apple" | "google" | "email" | "reset" | "verify" | "resend">(
    null
  );
  const [submitted, setSubmitted] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [emailFlow, setEmailFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // Password-reset sub-flow: null = normal sign-in/up; "request" = asking for
  // the email; "verify" = code + new password. Only reachable when the
  // deployment can actually send reset emails (passwordResetEnabled).
  const [resetStage, setResetStage] = useState<null | "request" | "verify">(null);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  // Email-verification sub-flow: entered when signUp/signIn resolves
  // "verification-pending" (server emailed an 8-digit code instead of
  // starting a session). The server decides whether this happens — nothing
  // here is gated on the emailVerification flag.
  const [verifyStage, setVerifyStage] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  // Epoch-ms deadline before which "resend code" stays disabled.
  const [resendDeadline, setResendDeadline] = useState<number | null>(null);
  const [, setResendTick] = useState(0);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  // True once the user starts ANY auth attempt this mount (OAuth, email,
  // reset, verify). Lets the redirect effect below distinguish "already
  // signed in, just visited /welcome" from "mid sign-in flow".
  const authAttemptedRef = useRef(false);
  const { t } = useLocale();
  // Ensure the pre-auth Citrus palette regardless of stored palette prefs.
  // Restored on unmount.
  const [theme, setTheme] = useTheme();
  const [appMode] = useAppMode();
  void appMode;
  const isDark = theme === "dark";

  // Pin the palette to Citrus while mounted; keep the saved light/dark mode.
  useEffect(() => {
    const html = document.documentElement;
    const prevKey = html.dataset.themeKey;
    html.dataset.themeKey = "citrus";
    return () => {
      if (prevKey) html.dataset.themeKey = prevKey;
      else delete html.dataset.themeKey;
    };
  }, []);

  // After auth lands, route into the protected tree. The central onboarding
  // gate owns the fresh-vs-returning decision, using cloud profile state plus
  // the current-session signup/provider marker. Deciding here is too early:
  // profile hydration can still be in the "cloud-loading" placeholder.
  //
  // Already-signed-in visitors (deep link / back button to /welcome) skip the
  // auth UI entirely and go home — that includes deletion-grace accounts,
  // whose cancel banner lives inside the app. Only a flow the user actively
  // started this mount (authAttemptedRef) is allowed to keep the page up
  // until its own submit handler finishes.
  useEffect(() => {
    if (!currentAccount || currentAccount.id === "cloud-loading") return;
    if (!submitted && authAttemptedRef.current) return;
    navigate(
      submitted && getPendingOnboardingFlow() === "signUp" ? "/onboarding/mode" : "/",
      { replace: true }
    );
  }, [submitted, currentAccount, navigate]);

  // Focus the email input the moment the form expands — saves a tap on
  // mobile and keeps the keyboard cadence tight on desktop.
  useEffect(() => {
    if (emailMode) emailInputRef.current?.focus();
  }, [emailMode]);

  // Tick once a second while the resend throttle is live so the countdown
  // label stays current; the interval tears itself down once the deadline
  // passes (setting the deadline to null re-runs this effect's cleanup).
  useEffect(() => {
    if (resendDeadline === null) return;
    const id = window.setInterval(() => {
      setResendTick((tick) => tick + 1);
      if (Date.now() >= resendDeadline) setResendDeadline(null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendDeadline]);
  const resendSecondsLeft =
    resendDeadline === null
      ? 0
      : Math.max(0, Math.ceil((resendDeadline - Date.now()) / 1000));

  async function withProvider(provider: "apple" | "google") {
    authAttemptedRef.current = true;
    setError(null);
    setBusy(provider);
    try {
      await signInWithProvider(provider);
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("welcome.signInFailed");
      setError(
        /provider|not configured|not enabled|isn't enabled/i.test(msg)
          ? provider === "apple"
            ? t("welcome.appleUnavailable")
            : t("welcome.googleUnavailable")
          : msg
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    if (emailFlow === "signUp" && !displayName.trim()) return;
    if (emailFlow === "signUp") {
      const policy = validatePasswordPolicy(password, { email, displayName });
      if (!policy.ok) {
        setError(localizePasswordPolicyIssues(policy.issues, t).join(" "));
        return;
      }
    }
    authAttemptedRef.current = true;
    setError(null);
    setBusy("email");
    try {
      const result =
        emailFlow === "signUp"
          ? await signUp({
              email: email.trim(),
              displayName: displayName.trim(),
              password,
              defaultCurrency: "EUR"
            })
          : await signIn(email.trim(), password);
      if (result === "verification-pending") {
        // The server emailed a confirmation code instead of starting a
        // session (both flows: fresh sign-up, or sign-in with a correct
        // password on a not-yet-verified account, which re-sends the code).
        setVerifyStage(true);
        setVerifyCode("");
        setVerifyNotice(null);
        setResendDeadline(Date.now() + RESEND_COOLDOWN_MS);
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(
        emailFlow === "signIn"
          ? emailSignInErrorMessage(err, t("welcome.invalidCredentials"))
          : err instanceof Error
            ? err.message
            : t("welcome.emailFailed")
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitResetRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy("reset");
    try {
      await requestPasswordReset(email.trim());
      setResetStage("verify");
    } catch {
      setError(t("welcome.resetFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function submitResetVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !resetCode.trim() || !resetNewPassword) return;
    const policy = validatePasswordPolicy(resetNewPassword, { email });
    if (!policy.ok) {
      setError(localizePasswordPolicyIssues(policy.issues, t).join(" "));
      return;
    }
    authAttemptedRef.current = true;
    setError(null);
    setBusy("reset");
    try {
      await confirmPasswordReset({
        email: email.trim(),
        code: resetCode.trim(),
        newPassword: resetNewPassword
      });
      // Successful verification also signs the user in — route into the app.
      setSubmitted(true);
    } catch {
      setError(t("welcome.resetVerifyFailed"));
    } finally {
      setBusy(null);
    }
  }

  function exitResetFlow() {
    setResetStage(null);
    setResetCode("");
    setResetNewPassword("");
    setError(null);
  }

  async function submitVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !verifyCode.trim()) return;
    authAttemptedRef.current = true;
    setError(null);
    setVerifyNotice(null);
    setBusy("verify");
    try {
      const result = await verifyEmail(email.trim(), verifyCode.trim());
      if (result === "ok") {
        // Verification also signs the user in — the shared post-auth effect
        // above routes into the app (onboarding for fresh sign-ups).
        setSubmitted(true);
      } else {
        setError(t("welcome.verifyInvalid"));
      }
    } catch {
      setError(t("welcome.verifyInvalid"));
    } finally {
      setBusy(null);
    }
  }

  async function resendVerifyCode() {
    if (busy !== null || resendSecondsLeft > 0 || !email.trim()) return;
    setError(null);
    setVerifyNotice(null);
    setBusy("resend");
    try {
      await resendVerification(email.trim());
      setVerifyNotice(t("welcome.verifyResent"));
      setResendDeadline(Date.now() + RESEND_COOLDOWN_MS);
    } catch {
      setError(t("welcome.verifyFailed"));
    } finally {
      setBusy(null);
    }
  }

  function exitVerifyFlow() {
    setVerifyStage(false);
    setVerifyCode("");
    setVerifyNotice(null);
    setResendDeadline(null);
    setError(null);
  }

  const signUpPasswordPolicy =
    emailFlow === "signUp"
      ? validatePasswordPolicy(password, { email, displayName })
      : null;
  const signUpPasswordIssues = signUpPasswordPolicy
    ? localizePasswordPolicyIssues(signUpPasswordPolicy.issues, t)
    : [];
  const resetPasswordPolicy =
    resetStage === "verify" ? validatePasswordPolicy(resetNewPassword, { email }) : null;
  const resetPasswordIssues = resetPasswordPolicy
    ? localizePasswordPolicyIssues(resetPasswordPolicy.issues, t)
    : [];

  return (
    // Keep auth reachable on short viewports, with a keyboard or enlarged text.
    <div className="nm-welcome-screen fixed inset-0 h-[100dvh] bg-[color:var(--color-bg)] text-[color:var(--color-ink)] flex flex-col items-center px-5 pt-16 pb-[max(env(safe-area-inset-bottom),20px)] sm:px-8 overflow-x-hidden overflow-y-auto">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6 z-20">
        <button
          type="button"
          onClick={() => {
            setTheme(isDark ? "light" : "dark");
            setError(null);
          }}
          className="inline-flex h-11 items-center gap-1 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)]/72 p-1 text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] backdrop-blur-xl transition hover:bg-[color:var(--color-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          aria-label={isDark ? t("welcome.switchLight") : t("welcome.switchDark")}
        >
          <span
            className={`grid h-8 w-8 place-items-center rounded-full transition ${
              !isDark
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] shadow-[var(--shadow-sm)]"
                : "text-[color:var(--color-ink-3)]"
            }`}
            aria-hidden
          >
            <Sun size={15} strokeWidth={2.1} />
          </span>
          <span
            className={`grid h-8 w-8 place-items-center rounded-full transition ${
              isDark
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] shadow-[var(--shadow-sm)]"
                : "text-[color:var(--color-ink-3)]"
            }`}
            aria-hidden
          >
            <Moon size={14} strokeWidth={2.1} />
          </span>
        </button>
      </div>

      <div
        className={
          emailMode
            ? "relative my-auto grid w-full max-w-[420px] shrink-0 gap-5"
            : "relative my-auto grid w-full max-w-[1040px] shrink-0 gap-6 sm:grid-cols-[minmax(0,420px)_minmax(320px,430px)] sm:items-center sm:gap-10 lg:gap-16"
        }
      >
        {emailMode ? null : <WelcomeProductPanel />}

        {/* Hero block — eyebrow + wordmark + promise text. Packs at the top
            of the column; auth block below packs at the bottom thanks to
            justify-between. */}
        <div
          className="nm-reveal relative z-10 flex flex-col gap-3 sm:col-start-1 sm:self-end"
          style={revealDelay(0, 90)}
        >
          <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-[color:var(--color-ink-3)]">
            {emailMode ? t("welcome.emailEyebrow") : t("welcome.eyebrow")}
          </p>
          <h1
            className="nm-welcome-wordmark text-[clamp(44px,12vw,72px)] font-bold leading-[1] tracking-[-0.045em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Numa Pro
          </h1>
          <p className="max-w-[360px] text-[15px] leading-[1.45] text-[color:var(--color-ink-2)] sm:text-[17px]">
            <span className="text-[color:var(--color-brand-strong)] font-semibold">
              {t("welcome.headline")}
            </span>{" "}
            {t("welcome.subheadline")}
          </p>
        </div>

        {/* Auth block — sticks to the bottom of the column via justify-between
            on the parent. Inline error + footnote stay attached to it so the
            whole "actionable" area lives together. */}
        <div
          className="nm-reveal relative z-10 flex flex-col gap-3 sm:col-start-1 sm:self-start"
          style={revealDelay(1, 90)}
        >
          {emailMode && verifyStage ? (
            <form onSubmit={submitVerifyCode} className="flex flex-col gap-2.5">
              <p className="text-[14px] font-semibold text-[color:var(--color-ink)]">
                {t("welcome.verifyTitle")}
              </p>
              <p className="text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">
                {t("welcome.verifySubtitle")}{" "}
                <span className="font-semibold text-[color:var(--color-ink)]">{email.trim()}</span>
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
                  {t("welcome.verifyCode")}
                </span>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="12345678"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  required
                  disabled={busy !== null}
                  className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] tracking-[0.2em] font-mono text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
                />
              </label>

              <button
                type="submit"
                disabled={busy !== null || !email.trim() || !verifyCode.trim()}
                className="h-12 sm:h-[54px] rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition disabled:opacity-50"
              >
                {busy === "verify" ? t("welcome.verifyChecking") : t("welcome.verifyCta")}
                {busy === "verify" ? null : <ArrowRight size={16} strokeWidth={2.5} />}
              </button>

              {verifyNotice ? (
                <p className="text-[12.5px] text-[color:var(--color-brand-strong)] text-center">
                  {verifyNotice}
                </p>
              ) : null}

              <button
                type="button"
                onClick={resendVerifyCode}
                disabled={busy !== null || resendSecondsLeft > 0}
                className="text-center text-[13px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-60"
              >
                {resendSecondsLeft > 0
                  ? template(t("welcome.verifyResendIn"), {
                      seconds: String(resendSecondsLeft)
                    })
                  : t("welcome.verifyResend")}
              </button>

              <button
                type="button"
                onClick={exitVerifyFlow}
                disabled={busy !== null}
                className="text-center text-[13px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-60"
              >
                {t("welcome.verifyBack")}
              </button>
            </form>
          ) : emailMode && resetStage !== null ? (
            <form
              onSubmit={resetStage === "request" ? submitResetRequest : submitResetVerify}
              className="flex flex-col gap-2.5"
            >
              {resetStage === "request" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
                    {t("welcome.email")}
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@numa.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={busy !== null}
                    className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
                  />
                </label>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">
                    {t("welcome.resetCodeSent")}{" "}
                    <span className="font-semibold text-[color:var(--color-ink)]">{email.trim()}</span>
                  </p>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
                      {t("welcome.resetCode")}
                    </span>
                    <input
                      type="text"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="12345678"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      required
                      disabled={busy !== null}
                      className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] tracking-[0.2em] font-mono text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
                      {t("welcome.newPassword")}
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      required
                      disabled={busy !== null}
                      className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
                    />
                  </label>
                  {resetNewPassword ? (
                    <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)]/55 px-4 py-3 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
                      {resetPasswordPolicy?.ok ? (
                        <p className="font-semibold text-[color:var(--color-brand-strong)]">
                          {t("passwordPolicy.ok")}
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {resetPasswordIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              <button
                type="submit"
                disabled={
                  busy !== null ||
                  !email.trim() ||
                  (resetStage === "verify" &&
                    (!resetCode.trim() || !resetNewPassword || !resetPasswordPolicy?.ok))
                }
                className="h-12 sm:h-[54px] rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition disabled:opacity-50"
              >
                {busy === "reset"
                  ? resetStage === "request"
                    ? t("welcome.resetSending")
                    : t("welcome.resetConfirming")
                  : resetStage === "request"
                    ? t("welcome.resetSend")
                    : t("welcome.resetConfirm")}
                {busy === "reset" ? null : <ArrowRight size={16} strokeWidth={2.5} />}
              </button>

              <button
                type="button"
                onClick={exitResetFlow}
                disabled={busy !== null}
                className="text-center text-[13px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-60"
              >
                {t("welcome.backToSignIn")}
              </button>
            </form>
          ) : emailMode ? (
            <WelcomeEmailForm
              busy={busy}
              email={email}
              setEmail={setEmail}
              emailFlow={emailFlow}
              setEmailFlow={setEmailFlow}
              displayName={displayName}
              setDisplayName={setDisplayName}
              password={password}
              setPassword={setPassword}
              emailInputRef={emailInputRef}
              submitEmail={submitEmail}
              setResetStage={setResetStage}
              setEmailMode={setEmailMode}
              setError={setError}
              passwordResetEnabled={passwordResetEnabled}
              emailVerificationEnabled={emailVerificationEnabled}
              signUpPasswordPolicy={signUpPasswordPolicy}
              signUpPasswordIssues={signUpPasswordIssues}
              t={t}
            />

          ) : (
            <WelcomeSocialAuth
              busy={busy}
              setEmailMode={setEmailMode}
              setError={setError}
              withProvider={withProvider}
              appleOAuthEnabled={appleOAuthEnabled}
              googleOAuthEnabled={googleOAuthEnabled}
              t={t}
            />
          )}

          {error ? (
            <p className="text-[12.5px] text-[color:var(--color-negative)] text-center">
              {error}
            </p>
          ) : null}

          <p className="text-[11px] text-[color:var(--color-ink-3)] text-center leading-[1.4]">
            {t("welcome.legalPrefix")}{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)] rounded"
            >
              {t("welcome.terms")}
            </a>{" "}
            {t("welcome.and")}{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)] rounded"
            >
              {t("welcome.privacy")}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
