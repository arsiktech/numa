// @vitest-environment node
import { describe, expect, it } from "vitest";
import { attachPassword, mine } from "./signInMethods";

type Row = Record<string, any>;
function fixture(user: Row | null, accounts: Row[] = [], signedIn: string | null = "u1") {
  const rows = [...accounts];
  const ctx = {
    auth: { getUserIdentity: async () => (signedIn ? { subject: `${signedIn}|session` } : null) },
    db: {
      get: async (id: string) => (id === "u1" ? user : null),
      insert: async (_table: string, doc: Row) => { rows.push(doc); return "new"; },
      query: () => ({
        withIndex: (_name: string, cb: (q: any) => any) => {
          const want: Row = {};
          const q = { eq: (field: string, value: unknown) => { want[field] = value; return q; } };
          cb(q);
          return { first: async () => rows.find((r) => Object.entries(want).every(([k, v]) => r[k] === v)) ?? null };
        }
      })
    }
  } as any;
  const run = (fn: any, args: Row) => fn._handler(ctx, args);
  return { rows, run };
}

describe("sign-in methods", () => {
  it("lists which ways in an account has, with its email", async () => {
    const f = fixture({ email: "me@privaterelay.appleid.com" }, [{ userId: "u1", provider: "apple-native", providerAccountId: "sub" }]);
    expect(await f.run(mine, {})).toEqual({ email: "me@privaterelay.appleid.com", privateRelay: true, apple: true, google: false, password: false });
    expect(await fixture(null, [], null).run(mine, {})).toBeNull();
  });

  it("adds a password to the signed-in account's own email, already verified when its email is", async () => {
    const f = fixture({ email: "Me@Example.com", emailVerificationTime: 1 });
    await f.run(attachPassword, { userId: "u1", secret: "hash" });
    expect(f.rows).toEqual([{ userId: "u1", provider: "password", providerAccountId: "me@example.com", secret: "hash", emailVerified: "me@example.com" }]);
  });

  it("refuses a second password, an email another account uses, and an account without email", async () => {
    await expect(fixture({ email: "me@example.com" }, [{ userId: "u1", provider: "password", providerAccountId: "me@example.com" }]).run(attachPassword, { userId: "u1", secret: "h" })).rejects.toThrow(/already has a password/);
    await expect(fixture({ email: "me@example.com" }, [{ userId: "u2", provider: "password", providerAccountId: "me@example.com" }]).run(attachPassword, { userId: "u1", secret: "h" })).rejects.toThrow(/Another Numa Pro account/);
    await expect(fixture({}).run(attachPassword, { userId: "u1", secret: "h" })).rejects.toThrow(/no email/);
  });
});
