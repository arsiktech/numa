import { Email } from "@convex-dev/auth/providers/Email";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import type { GenericDataModel } from "convex/server";
import { internal } from "./_generated/api";
import { hashAuthEmail } from "./lib/authEmailRateLimit";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Sign-up email-verification OTP sender backed by Resend's plain HTTP API
 * (no SDK). Mirrors ResendOTPPasswordReset exactly, but for the Password
 * provider's `verify` option.
 *
 * Wired into the Password provider's `verify` option ONLY when
 * AUTH_RESEND_KEY is set on the Convex deployment (see convex/auth.ts), so
 * deployments without an email account keep working — sign-up completes
 * immediately without a confirmation step in that case. The client reads
 * authConfig.flags.emailVerification for optional copy only; the server
 * decides whether verification actually happens.
 *
 * To enable:
 *   npx convex env set AUTH_RESEND_KEY re_...        (dev or prod)
 *   npx convex env set AUTH_EMAIL_FROM "Numa Pro <noreply@yourdomain.com>"
 * The AUTH_EMAIL_FROM sender must be verified in Resend; for quick testing
 * Resend allows onboarding@resend.dev (delivers only to your own account
 * email).
 */
export const ResendOTPVerify = Email({
  id: "resend-otp-verify",
  maxAge: 60 * 15, // code valid for 15 minutes
  async generateVerificationToken() {
    // 8-digit numeric code. Uses rejection sampling so every digit is
    // uniform (256 % 10 !== 0 would otherwise bias 0–5).
    const digits: number[] = [];
    while (digits.length < 8) {
      const byte = crypto.getRandomValues(new Uint8Array(1))[0]!;
      if (byte < 250) digits.push(byte % 10);
    }
    return digits.join("");
  },
  async sendVerificationRequest(
    { identifier: email, token, expires },
    ctx?: GenericActionCtxWithAuthConfig<GenericDataModel>
  ) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throw new Error("AUTH_RESEND_KEY is not configured on this deployment.");
    }
    if (!ctx) throw new Error("Authentication email context is unavailable.");
    await ctx.runMutation(internal.authEmailRateLimits.consume, {
      kind: "verification",
      identityHash: await hashAuthEmail(email)
    });
    const from = process.env.AUTH_EMAIL_FROM ?? "Numa Pro <onboarding@resend.dev>";
    const minutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Confirm your email for Numa Pro",
        text:
          `Your Numa Pro email confirmation code is: ${token}\n\n` +
          `Enter it in the app to confirm this email address. The code expires in ${minutes} minutes.\n\n` +
          `If you didn't create a Numa Pro account, you can safely ignore this email.`
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Could not send the confirmation email (${res.status}). ${detail.slice(0, 200)}`);
    }
  }
});
