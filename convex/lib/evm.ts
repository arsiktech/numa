/**
 * Small helpers for reading EVM contracts over JSON-RPC without a library: ABI words in and out,
 * and Multicall3 to ask one node many questions in a single request.
 */

import type { Call, Get } from "./publicWallets";

export const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
/** A uint256 (or a negative number as two's complement, for int24 ticks). */
export const uint = (n: number | bigint) => (BigInt(n) < 0n ? 2n ** 256n + BigInt(n) : BigInt(n)).toString(16).padStart(64, "0");
export const words = (hex: string) => {
  if (!/^0x([0-9a-f]{64})+$/i.test(hex)) throw new Error("bad response");
  return Array.from({ length: (hex.length - 2) / 64 }, (_, i) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64)));
};
export const int = (w: bigint) => (w >= 2n ** 255n ? w - 2n ** 256n : w);
export const address = (w: bigint) => "0x" + w.toString(16).padStart(40, "0");

/** Multicall3 lives at the same address on every chain Numa reads. */
export const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const CHUNK = 150;

/** aggregate3 calldata: every call may fail on its own without failing the batch. */
export function encodeAggregate3(calls: Array<{ to: string; data: string }>): string {
  const tuples = calls.map((c) => {
    const data = c.data.replace(/^0x/, "");
    const length = data.length / 2;
    return pad(c.to) + uint(1) + uint(0x60) + uint(length) + data.padEnd(Math.ceil(length / 32) * 64, "0");
  });
  let offset = calls.length * 32;
  const heads = tuples.map((t) => { const at = offset; offset += t.length / 2; return uint(at); });
  return "0x82ad56cb" + uint(0x20) + uint(calls.length) + heads.join("") + tuples.join("");
}

/** aggregate3 results: the return data of each call, or null where that call failed. */
export function decodeAggregate3(hex: string): Array<string | null> {
  const h = hex.replace(/^0x/, "");
  if (!/^([0-9a-f]{2})*$/i.test(h) || h.length < 128) throw new Error("bad response");
  const at = (byte: number) => Number(BigInt("0x" + h.slice(byte * 2, byte * 2 + 64)));
  const array = at(0), n = at(array), base = array + 32;
  return Array.from({ length: n }, (_, i) => {
    const tuple = base + at(base + i * 32);
    const ok = at(tuple) === 1, data = tuple + at(tuple + 32), length = at(data);
    return ok ? "0x" + h.slice((data + 32) * 2, (data + 32 + length) * 2) : null;
  });
}

/** Many read calls through Multicall3, in a few requests. */
export async function multicall(call: Call, rpc: string, calls: Array<{ to: string; data: string }>): Promise<Array<string | null>> {
  const chunks: Array<Array<{ to: string; data: string }>> = [];
  for (let i = 0; i < calls.length; i += CHUNK) chunks.push(calls.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map(async (chunk) => decodeAggregate3(await call(rpc, MULTICALL, encodeAggregate3(chunk)))));
  return results.flat();
}

/** The uint256 a call returned, or null when it failed or returned nothing. */
export const firstWord = (result: string | null): bigint | null => (result && result.length >= 66 ? BigInt(result.slice(0, 66)) : null);

/** Blockscout PRO answers for every chain's explorer by chain id; Numa asks it only when a public explorer turns it away. */
export const BLOCKSCOUT_PRO = "https://api.blockscout.com";

/** One explorer API path (like `/api/v2/addresses/0x…`), from each host in turn until one answers. */
export async function explorerGet(hosts: readonly string[], path: string, get: Get): Promise<unknown> {
  let last: unknown = new Error("no explorer");
  for (const host of hosts) {
    try { return await get(host + path); } catch (error) { last = error; }
  }
  throw last;
}
