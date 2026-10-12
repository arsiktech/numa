import { Email } from "@convex-dev/auth/providers/Email";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Password-reset OTP sender backed by Resend's plain HTTP API (no SDK).
 *
 * Wired into the Password provider's `reset` option ONLY when
 * AUTH_RESEND_KEY is set on the Convex deployment (see convex/auth.ts), so
 * deployments without an email account keep working — the client hides the
 * "Forgot password?" entry point via the authConfig.flags query in that case.
 *
 * To enable:
 *   npx convex env set AUTH_RESEND_KEY re_...        (dev or prod)
 *   npx convex env set AUTH_EMAIL_FROM "Numa Pro <noreply@yourdomain.com>"
 * The AUTH_EMAIL_FROM sender must be verified in Resend; for quick testing
 * Resend allows onboarding@resend.dev (delivers only to your own account
 * email).
 */
export const ResendOTPPasswordReset = Email({
  id: "resend-otp-password-reset",
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
    { identifier: email, token, expires }
  ) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throw new Error("AUTH_RESEND_KEY is not configured on this deployment.");
    }
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
        subject: "Your Numa Pro password reset code",
        text:
          `Your Numa Pro password reset code is: ${token}\n\n` +
          `Enter it in the app to set a new password. The code expires in ${minutes} minutes.\n\n` +
          `If you didn't request this, you can safely ignore this email — your password is unchanged.`
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Could not send the reset email (${res.status}). ${detail.slice(0, 200)}`);
    }
  }
});
