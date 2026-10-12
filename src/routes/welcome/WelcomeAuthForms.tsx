import { Apple, ArrowRight, Mail } from "lucide-react";
import type { RefObject } from "react";
import type { PasswordPolicyResult } from "../../../convex/lib/passwordPolicy";
import type { useLocale } from "@/lib/i18n";

type BusyState = null | "apple" | "google" | "email" | "reset" | "verify" | "resend";
type Translator = ReturnType<typeof useLocale>["t"];

/** Email sign-in / sign-up form — the expanded email lane on Welcome. */
export function WelcomeEmailForm({
  busy,
  email,
  setEmail,
  emailFlow,
  setEmailFlow,
  displayName,
  setDisplayName,
  password,
  setPassword,
  emailInputRef,
  submitEmail,
  setResetStage,
  setEmailMode,
  setError,
  passwordResetEnabled,
  emailVerificationEnabled,
  signUpPasswordPolicy,
  signUpPasswordIssues,
  t
}: {
  busy: BusyState;
  email: string;
  setEmail: (value: string) => void;
  emailFlow: "signIn" | "signUp";
  setEmailFlow: (value: "signIn" | "signUp") => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  emailInputRef: RefObject<HTMLInputElement | null>;
  submitEmail: (event: React.FormEvent) => void;
  setResetStage: (value: "request") => void;
  setEmailMode: (value: boolean) => void;
  setError: (value: string | null) => void;
  passwordResetEnabled: boolean;
  emailVerificationEnabled: boolean;
  signUpPasswordPolicy: PasswordPolicyResult | null;
  signUpPasswordIssues: string[];
  t: Translator;
}) {
  return (
    <form
      onSubmit={submitEmail}
      className="flex flex-col gap-2.5"
    >
      <div className="grid grid-cols-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)]/50 p-1">
        {(["signIn", "signUp"] as const).map((flow) => (
          <button
            key={flow}
            type="button"
            onClick={() => {
              setEmailFlow(flow);
              setError(null);
            }}
            disabled={busy !== null}
            className={`h-10 rounded-xl text-[13px] font-semibold transition ${
              emailFlow === flow
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] shadow-[var(--shadow-sm)]"
                : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {flow === "signIn" ? t("welcome.signIn") : t("welcome.createAccount")}
          </button>
        ))}
      </div>

      {emailFlow === "signUp" ? (
        <label htmlFor="welcome-auth-name" className="flex flex-col gap-1">
          <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
            {t("welcome.name")}
          </span>
          <input
            id="welcome-auth-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={busy !== null}
            className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
          />
        </label>
      ) : null}

      <label htmlFor="welcome-auth-email" className="flex flex-col gap-1">
        <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
          {t("welcome.email")}
        </span>
        <input
          id="welcome-auth-email"
          name="email"
          ref={emailInputRef}
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
      <label htmlFor="welcome-auth-password" className="flex flex-col gap-1">
        <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)]">
          {t("welcome.password")}
        </span>
        <input
          id="welcome-auth-password"
          name="password"
          type="password"
          autoComplete={emailFlow === "signUp" ? "new-password" : "current-password"}
          aria-describedby={emailFlow === "signUp" && password ? "welcome-auth-password-policy" : undefined}
          aria-invalid={emailFlow === "signUp" && password && !signUpPasswordPolicy?.ok ? true : undefined}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={busy !== null}
          className="h-12 sm:h-[54px] px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition disabled:opacity-60"
        />
      </label>
      {emailFlow === "signUp" && emailVerificationEnabled ? (
        <p className="text-[11px] text-[color:var(--color-ink-3)] leading-[1.4]">
          {t("welcome.verifyHint")}
        </p>
      ) : null}
      {emailFlow === "signIn" && passwordResetEnabled ? (
        <button
          type="button"
          onClick={() => {
            setResetStage("request");
            setError(null);
          }}
          disabled={busy !== null}
          className="self-end text-[12px] font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-60"
        >
          {t("welcome.forgotPassword")}
        </button>
      ) : null}
      {emailFlow === "signUp" && password ? (
        <div
          id="welcome-auth-password-policy"
          className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)]/55 px-4 py-3 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]"
        >
          {password && signUpPasswordPolicy?.ok ? (
            <p className="font-semibold text-[color:var(--color-brand)]">
              {t("passwordPolicy.ok")}
            </p>
          ) : (
            <ul className="space-y-1">
              {signUpPasswordIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={
          busy !== null ||
          !email.trim() ||
          !password ||
          (emailFlow === "signUp" &&
            (!displayName.trim() || !signUpPasswordPolicy?.ok))
        }
        className="h-12 sm:h-[54px] rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition disabled:opacity-50"
      >
        {busy === "email"
          ? emailFlow === "signUp"
            ? t("welcome.creating")
            : t("welcome.signingIn")
          : emailFlow === "signUp"
            ? t("welcome.createAccount")
            : t("welcome.signIn")}
        {busy === "email" ? null : <ArrowRight size={16} strokeWidth={2.5} />}
      </button>

      <button
        type="button"
        onClick={() => {
          setEmailMode(false);
          setEmailFlow("signIn");
          setError(null);
        }}
        disabled={busy !== null}
        className="text-center text-[13px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-60"
      >
        {t("welcome.backSocial")}
      </button>
    </form>
  );
}

/** OAuth buttons (Apple / Google) + the "continue with email" entry. */
export function WelcomeSocialAuth({
  busy,
  setEmailMode,
  setError,
  withProvider,
  appleOAuthEnabled,
  googleOAuthEnabled,
  t
}: {
  busy: BusyState;
  setEmailMode: (value: boolean) => void;
  setError: (value: string | null) => void;
  withProvider: (provider: "apple" | "google") => void;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
  t: Translator;
}) {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        {appleOAuthEnabled ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => withProvider("apple")}
            className="h-12 sm:h-[54px] rounded-2xl bg-[color:var(--color-ink)] text-[color:var(--color-bg)] border border-[color:var(--color-ink)] font-semibold text-[15px] inline-flex items-center justify-center gap-2.5 hover:brightness-110 transition-[filter] disabled:opacity-60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          >
            <Apple size={18} strokeWidth={2.2} aria-hidden />
            {busy === "apple" ? t("welcome.connecting") : t("welcome.continueApple")}
          </button>
        ) : null}

        {googleOAuthEnabled ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => withProvider("google")}
            className="h-12 sm:h-[54px] rounded-2xl bg-[color:var(--color-paper)] text-[color:var(--color-ink)] border border-[color:var(--color-line)] font-semibold text-[15px] inline-flex items-center justify-center gap-2.5 hover:brightness-[1.03] transition-[filter] disabled:opacity-60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.13 4.13 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.63z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34A9 9 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.95H.96A8.95 8.95 0 0 0 0 9c0 1.45.35 2.83.96 4.05l2.99-2.34z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.33 0 2.51.46 3.45 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            {busy === "google" ? t("welcome.connecting") : t("welcome.continueGoogle")}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setEmailMode(true);
          setError(null);
        }}
        disabled={busy !== null}
        className="inline-flex items-center justify-center gap-2 h-11 px-4 mx-auto rounded-full bg-[color:var(--color-paper)]/40 hover:bg-[color:var(--color-paper)]/70 text-[13px] font-semibold text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] transition-colors border border-[color:var(--color-line)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
      >
        <Mail size={14} strokeWidth={1.9} />
        {t("welcome.loginEmail")}
      </button>
    </>
  );
}
