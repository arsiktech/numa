import { query } from "./_generated/server";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Public, unauthenticated capability flags for the auth surfaces. Lets the
 * client show/hide entry points ("Forgot password?") based on what this
 * deployment is actually configured to do, instead of hardcoding or letting
 * users hit dead ends. Exposes only booleans — never the underlying values.
 */
export const flags = query({
  args: {},
  handler: async () => ({
    passwordReset: Boolean(process.env.AUTH_RESEND_KEY),
    emailVerification: Boolean(process.env.AUTH_RESEND_KEY),
    googleOAuth: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    appleOAuth: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)
  })
});
