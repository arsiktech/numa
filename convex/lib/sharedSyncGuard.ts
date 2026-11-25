import { ConvexError } from "convex/values";

/** A record Numa Shared updates. Its amount is not edited by hand. */
export function assertHandEditable(doc: { sharedSync?: unknown } | null | undefined) {
  if (doc?.sharedSync) {
    throw new ConvexError({
      code: "SYNCED_RECORD",
      message: "This record follows Numa Shared, so its amount isn't edited by hand.",
    });
  }
}
