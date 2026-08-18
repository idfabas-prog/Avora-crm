import type { GhlSyncCounts } from "./types";

export type ReconciliationSnapshot = {
  fetched: number;
  mapped: number;
  duplicates: number;
  stale: number;
  missingInternal: number;
  missingExternal: number;
  exceptions: number;
};

export function reconciliationHealth(snapshot: ReconciliationSnapshot) {
  if (snapshot.exceptions > 0 || snapshot.duplicates > 0) return "warning";
  if (snapshot.missingInternal > 0 || snapshot.missingExternal > 0 || snapshot.stale > 0) return "review";
  return "matched";
}

export function countsFromPage(previous: GhlSyncCounts, pageSize: number): GhlSyncCounts {
  return {
    ...previous,
    fetched: previous.fetched + pageSize,
    unchanged: previous.unchanged + pageSize,
    pages: previous.pages + 1
  };
}

export function emptyCounts(): GhlSyncCounts {
  return { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, pages: 0 };
}
