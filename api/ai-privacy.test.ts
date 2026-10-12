// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), gateway: vi.fn(), stream: vi.fn(), object: vi.fn(), rate: vi.fn(), daily: vi.fn() }));
vi.mock("./_utils/auth.js", () => ({ getRequestAIIdentity: mocks.identity }));
vi.mock("@ai-sdk/gateway", () => ({ gateway: mocks.gateway }));
vi.mock("ai", () => ({ streamText: mocks.stream, generateObject: mocks.object }));
vi.mock("./_utils/rate-limit.js", () => ({ allowedOrigin: () => undefined, consumeRateLimit: mocks.rate, consumeDailyGlobalBudget: mocks.daily }));
import chat from "./chat";
import receipt from "./parse-receipt";
import merchant from "./merchant-image";
import { safeProviderError } from "./_utils/safe-provider-error";
const chatBody = { messages: [{ role: "user", content: "Synthetic question" }], context: {
  portfolio: { name: "Synthetic", defaultCurrency: "EUR" }, netWorth: 1, liquid: 1, invested: 0, liabilities: 0,
  categories: [], recentTransactions: [], assets: [], liabilitiesDetail: [],
} };
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() } as any; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-not-a-provider-key");
  mocks.identity.mockResolvedValue({ state: "allowed", userId: "synthetic-user" });
  mocks.gateway.mockReturnValue("synthetic-model");
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.daily.mockResolvedValue({ allowed: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each([["chat", chat, chatBody], ["receipt", receipt, { text: "Synthetic 12 EUR lunch" }]] as const)("%s actual AI route", (_name, handler, body) => {
  it.each([["signed-out", 401], ["consent-required", 403], ["unavailable", 503]] as const)("blocks %s before metering and provider access", async (state, code) => {
    mocks.identity.mockResolvedValue({ state }); const res = response();
    await handler({ method: "POST", body }, res);
    expect(res.status).toHaveBeenCalledWith(code);
    expect(mocks.rate).not.toHaveBeenCalled(); expect(mocks.daily).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled(); expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.object).not.toHaveBeenCalled();
  });
  it("meters the authenticated actor and does not expose request bodies in provider failure logs", async () => {
    const privateError = { name: "AI_APICallError", statusCode: 502, message: "SECRET-finance", requestBodyValues: { transcript: "SECRET-finance" }, headers: { authorization: "SECRET-token" } };
    mocks.stream.mockImplementation(() => { throw privateError; }); mocks.object.mockRejectedValue(privateError);
    const logger = vi.spyOn(console, "error").mockImplementation(() => {}); const res = response();
    await handler({ method: "POST", body }, res);
    expect(mocks.rate.mock.calls[0][2]).toMatchObject({ identity: "synthetic-user" });
    expect(res.status).toHaveBeenCalledWith(502);
    expect(logger).toHaveBeenCalledWith(expect.any(String), { kind: "AI_APICallError", status: 502 });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("SECRET");
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("SECRET");
  });
});
describe("streaming and disabled-provider boundaries", () => {
  it("sanitizes asynchronous stream errors as well as thrown errors", async () => {
    let options: any; const pipe = vi.fn();
    mocks.stream.mockImplementation(value => { options = value; return { pipeTextStreamToResponse: pipe }; });
    const logger = vi.spyOn(console, "error").mockImplementation(() => {}); const res = response();
    await chat({ method: "POST", body: chatBody }, res);
    expect(pipe).toHaveBeenCalledWith(res);
    options.onError({ error: { name: "AI_APICallError", statusCode: 401, message: "private", requestBodyValues: chatBody } });
    expect(logger).toHaveBeenCalledExactlyOnceWith("chat provider failure", { kind: "AI_APICallError", status: 401 });
  });
  it("never reads merchant text or invokes a provider on the disabled route", async () => {
    const res = response();
    const request = { method: "POST", get body() { throw new Error("must not read private text"); } };
    await merchant(request, res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "MERCHANT_ART_DISABLED" }));
    expect(mocks.gateway).not.toHaveBeenCalled(); expect(mocks.object).not.toHaveBeenCalled();
  });
  it("provider sanitizer tolerates hostile getters and never preserves arbitrary names/status/messages", () => {
    expect(safeProviderError({ get name() { throw new Error("private"); } })).toEqual({ kind: "ProviderError", status: null });
    expect(safeProviderError({ name: "private@numa.invalid", statusCode: 200, message: "private" })).toEqual({ kind: "ProviderError", status: null });
    expect(safeProviderError(null)).toEqual({ kind: "ProviderError", status: null });
  });
});
