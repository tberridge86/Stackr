# Saved history during pending valuation

A successful prepared-valuation response may contain `state: pending` and `summary: null`. The screen treated that response as authoritative empty data, erased valid owner-bound Home history and suppressed a later saved-cache read. The existing SQL contract explicitly permits this response.

Commit `75012ea60ce777c96ae48409e402dc7865a35d4d` keeps validated saved history visible with its saved-data and unverified-current-holdings labels while preparation continues. Saved origin is part of the displayed collection state, so Retry retains it when the next disk read hangs or returns no data. A response without a summary cannot preserve an earlier prepared value as a current valuation.

Every valid non-null summary remains authoritative, including genuine zero, empty, all-unpriced and revision-mismatched results. Account, epoch, generation and either principal request's access-denial guards still block stale private fallback. The change adds no provider request, per-card price fan-out or refresh job.

Verification:

- The actual-screen regression reproduces both arrival orders, same-scope Retry with a hanging/null disk read, prepared data taking precedence, empty/mismatched summaries and access denial from either request.
- An independent small actual-screen probe passed zero/all-unpriced authority and superseded-generation/old-epoch cases. Review SHA256: `7834225ac4a6deec3acf48c835979fbe896ae7a34b8737c2dcf8087714506c06`.
- Coordinator typecheck and lint passed, with zero errors and eight existing warnings. Required-check receipt SHA256: `9aadca45b1e4ed15b1f7401eb636a8a663a094d1b0362b2f214d399f97136c20`.

Private evidence is preserved under `D:/Stackr-organization/evidence/consolidation-20261018/pricing-history-post-main-gap-triage-20261019` and `validation/value-history-pending-20261019`.

This is source verification. Live prepared-route/account coverage, exact owned-card price reconciliation and installed-phone ranges, plot, Retry and haptics remain open. No phone performance percentile is measured by these tests. TestFlight stays held.
