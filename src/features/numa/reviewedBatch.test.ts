import { describe, expect, it } from "vitest";
import { markReviewedRowApplied, pendingReviewedRows } from "./reviewedBatch";

describe("partial reviewed batches", () => {
  it("keeps successful rows terminal while later failed rows remain retryable", () => {
    const initial = [
      { uid: "row-1", description: "Original", include: true },
      { uid: "row-2", description: "Retry me", include: true }
    ];
    const afterPartialFailure = markReviewedRowApplied(initial, "row-1");
    const edited = afterPartialFailure.map((row) =>
      row.uid === "row-1" ? { ...row, description: "Misleading edit" } : row
    );

    expect(pendingReviewedRows(edited, (row) => row.include)).toEqual([
      expect.objectContaining({ uid: "row-2" })
    ]);
  });

  it("keeps queued rows terminal and labels their sync state", () => {
    const rows = markReviewedRowApplied(
      [{ uid: "queued-row", include: true }],
      "queued-row",
      { queued: true }
    );

    expect(rows[0]).toMatchObject({ applied: true, queued: true });
    expect(pendingReviewedRows(rows, (row) => row.include)).toEqual([]);
  });
});
