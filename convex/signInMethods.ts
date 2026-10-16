import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { validatePasswordPolicy } from "./lib/passwordPolicy";

/**
 * How the signed-in person can sign in: which of Apple, Google and email-and-password are linked to
 * their account, and the email a password would use. Only booleans and their own email leave here.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const has = async (provider: string) =>
      (await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", provider)).first()) !== null;
    const [appleNative, appleOAuth, google, password] = await Promise.all([has("apple-native"), has("apple"), has("google"), has("password")]);
    const email = typeof user?.email === "string" ? user.email : null;
    return {
      email,
      privateRelay: email?.endsWith("@privaterelay.appleid.com") ?? false,
      apple: appleNative || appleOAuth,
      google,
      password
    };
  }
});

/**
 * Lets someone who signed up with Apple or Google also sign in with their email and a password,
 * on any device. The password is hashed here, the same way the password provider hashes it.
 */
export const setPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<{ email: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    if (password.length > 200) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "That password is too long." });
    const email: string = await ctx.runQuery(internal.signInMethods.emailFor, { userId });
    const policy = validatePasswordPolicy(password, { email });
    if (!policy.ok) throw new ConvexError({ code: "WEAK_PASSWORD", message: policy.issues[0]?.message ?? "Password is too weak." });
    const secret = await new Scrypt().hash(password);
    await ctx.runMutation(internal.signInMethods.attachPassword, { userId, secret });
    return { email };
  }
});

export const emailFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string> => {
    const user = await ctx.db.get(userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email) throw new ConvexError({ code: "NO_EMAIL", message: "This account has no email to sign in with." });
    return email;
  }
});

export const attachPassword = internalMutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, { userId, secret }) => {
    const user = await ctx.db.get(userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email) throw new ConvexError({ code: "NO_EMAIL", message: "This account has no email to sign in with." });
    const existing = await ctx.db.query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email)).first();
    if (existing && existing.userId === userId) throw new ConvexError({ code: "ALREADY_SET", message: "This account already has a password. Use “Forgot password?” on the sign-in page to change it." });
    if (existing) throw new ConvexError({ code: "EMAIL_TAKEN", message: "Another Numa Pro account already uses this email with a password." });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: email,
      secret,
      // An email Apple or Google already verified needs no emailed code at sign-in.
      ...(user?.emailVerificationTime ? { emailVerified: email } : {})
    });
  }
});
