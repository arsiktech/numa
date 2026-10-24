// @vitest-environment node
// After "Add Google", a normal "Continue with Google" must open the SAME account. This runs the
// real pinned Convex Auth store mutation (userOAuth) with this repo's createOrUpdateUser callback.
import { beforeEach, expect, it, vi } from "vitest";
import { privacyFixture } from "../src/test/privacyFixture";

const state = vi.hoisted(() => {
  process.env.AUTH_GOOGLE_ID = "dummy-google-id";
  process.env.AUTH_GOOGLE_SECRET = "dummy-google-secret";
  return { store: null as any };
});
vi.mock("@convex-dev/auth/server", async (importOriginal) => {
  const sdk = await importOriginal<any>();
  return { ...sdk, convexAuth: (config: any) => { state.store = sdk.convexAuth(config).store; return {}; } };
});
vi.resetModules();
await import("./auth");

function fixture() {
  const f = privacyFixture();
  f.signIn(null); // Google's callback is an HTTP request with no Numa session.
  f.rows.get("user").emailVerificationTime = 1;
  f.seed("authAccounts", "apple-1", { userId: "user", provider: "apple-native", providerAccountId: "apple-sub" });
  f.seed("authAccounts", "google-1", { userId: "user", provider: "google", providerAccountId: "linked-google-sub", emailVerified: "other@example.org" });
  f.seed("authVerifiers", "verifier-1", { signature: "sig" });
  // The shared adapter has no `neq`; the SDK's verified-email lookup needs it.
  const call = (args: object) => f.call({ _handler: async (ctx: any, input: any) => {
    const query = ctx.db.query;
    ctx.db.query = (table: string) => {
      const q = query(table); const filter = q.filter;
      q.filter = (fn: any) => filter((ops: any) => fn({ ...ops, neq: (field: any, value: unknown) => (row: any) => field(row) !== value }));
      return q;
    };
    try { return await state.store._handler(ctx, input); } finally { ctx.db.query = query; }
  } }, { args });
  return { f, call };
}
const google = (sub: string, email: string) => ({ type: "userOAuth", provider: "google", providerAccountId: sub, profile: { email, name: "Google Name", emailVerified: true }, signature: "sig" });

beforeEach(() => { vi.restoreAllMocks(); });

it("signing in with a linked Google account opens the existing account and keeps its email and name", async () => {
  const { f, call } = fixture();
  const code = await call(google("linked-google-sub", "other@example.org"));
  expect(typeof code).toBe("string");
  expect(f.all("authVerificationCodes")).toEqual([expect.objectContaining({ accountId: "google-1", provider: "google" })]);
  expect(f.all("users")).toHaveLength(1);
  expect(f.rows.get("user")).toMatchObject({ email: "qa@example.com", name: "Synthetic QA" });
});

it("an unlinked Google account with a different email still gets its own new account", async () => {
  const { f, call } = fixture();
  await call(google("fresh-google-sub", "someone@example.org"));
  const users = f.all("users");
  expect(users).toHaveLength(2);
  const fresh = f.all("authAccounts").find((a) => a.providerAccountId === "fresh-google-sub");
  expect(fresh?.userId).not.toBe("user");
  expect(f.rows.get("user").email).toBe("qa@example.com");
});
