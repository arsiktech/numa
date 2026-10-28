# First-party active-day measurement

The signed-in foreground tracker records the authenticated user ID and the server's UTC calendar date. Convex document metadata also contains creation time. The transaction checks the account ID, refuses pending or started deletion, and inserts at most one row per user and date through a compound index. Multiple spaces and repeated opens count as one day. There is no financial content, analytics provider, device ID, session content or historical backfill.

The app attempts collection only while visible and connected. Collection is best effort. It retries on a visible minute tick or foreground event. A connection loss after dispatch can leave an SDK request in flight; the server still checks the expected account and deduplicates the day. Collection does not block financial work.

`activeDays:weeklyReport` is an **internal query**, not an app endpoint. It returns aggregate counts for the last four completed Monday–Sunday UTC weeks. A person is retained when present in at least three of those weeks. Supply an independently verified `outsideHouseholdUserIds` cohort to assess the ten-person target. Omit it to get total active users with a null cohort verdict. An empty supplied cohort means verified no eligible participants, not unknown membership. No email or name is inferred as cohort membership.

The report reads at most 10,001 rows and rejects an oversized result rather than returning an incomplete verdict. It never changes pricing, release decisions, the user cohort, or a scheduler. Before collection starts, the absence of historical rows is missing coverage, not evidence that users were inactive.

## Operator workflow

For an already authorized deployment, an authenticated operator can invoke the internal query with the standard Convex CLI. First verify the intended deployment and source revision. In local synthetic QA only:

```sh
npx convex run activeDays:weeklyReport '{}'
```

Add `outsideHouseholdUserIds` only after verifying that cohort. Do not add private participant IDs to source control. The result includes the exact window, weekly totals, retained count, target and interpretation. Store an operator note outside this public repository. Scheduled production collection/reporting requires its own deployment and scheduler authorization.

## Privacy and lifecycle

`dataExport:page` includes a paginated `activeDays` section containing the caller's account-level dates only. These are independent of the selected space; other members' activity is excluded. The existing bounded account-erasure lifecycle drains `activeDays` by user ID. Dates otherwise remain while the account is open. The privacy-policy source describes first-party repeat-use measurement and its proposed legitimate-interest basis.

Before public release, reconcile the final policy and App Privacy answers. Classify account ID and usage/product interaction data as linked to the user and used for analytics; this is not advertising or cross-app tracking. Those answers are proposed classifications, not a claim that App Store Connect was updated. Review the complete app disclosure, including existing providers, rather than replacing it with this narrow inventory.
