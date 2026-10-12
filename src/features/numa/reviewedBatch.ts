export interface ReviewedBatchRow {
  uid: string;
  applied?: boolean;
  queued?: boolean;
}

export function markReviewedRowApplied<T extends ReviewedBatchRow>(
  rows: T[],
  uid: string,
  options?: { queued?: boolean }
) {
  return rows.map((row) =>
    row.uid === uid
      ? { ...row, applied: true, queued: options?.queued === true }
      : row
  );
}

export function pendingReviewedRows<T extends ReviewedBatchRow>(
  rows: T[],
  included: (row: T) => boolean
) {
  return rows.filter((row) => !row.applied && included(row));
}
