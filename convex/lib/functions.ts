/* eslint-disable no-restricted-imports -- the one place the plain builders are wrapped */
import { v } from "convex/values";
import { internalMutation as plainInternalMutation, mutation as plainMutation } from "../_generated/server";
import { parseReason, withRecordHistory } from "./recordHistory";

/**
 * The mutation builders every module uses. Each mutation also takes an optional `reason`, and its
 * writes to assets, debts, holdings, wallets and debt events land in the change history
 * (lib/recordHistory.ts). Import these instead of the ones in _generated/server; lint enforces it.
 */

type Definition = { args?: Record<string, unknown>; handler: (ctx: any, args: any) => unknown } & Record<string, unknown>;

function recorded(definition: Definition | Definition["handler"], systemName?: string) {
  const def: Definition = typeof definition === "function" ? { handler: definition } : definition;
  return {
    ...def,
    ...(def.args ? { args: { ...def.args, reason: v.optional(v.string()) } } : {}),
    handler: (ctx: any, input: any) => {
      const { reason, ...args } = (input ?? {}) as Record<string, unknown>;
      return def.handler({ ...ctx, db: withRecordHistory(ctx, parseReason(reason), systemName) }, def.args ? args : input);
    },
  };
}

export const mutation = ((definition: any) => plainMutation(recorded(definition) as any)) as typeof plainMutation;
export const internalMutation = ((definition: any) => plainInternalMutation(recorded(definition) as any)) as typeof plainInternalMutation;

/** An internal mutation run by a scheduled job, named in the history as `systemName`, like "Company portal". */
export const internalMutationBy = (systemName: string) =>
  ((definition: any) => plainInternalMutation(recorded(definition, systemName) as any)) as typeof plainInternalMutation;

/** For deleting a whole space or account, which erases its history too: writes are not recorded. */
export { plainMutation as mutationWithoutHistory, plainInternalMutation as internalMutationWithoutHistory };
