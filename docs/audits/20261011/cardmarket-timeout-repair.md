# Cardmarket worker timeout repair — 11 October 2026

The production worker regressed from the previously tested 100-row reviewed
mapping reader to 500-row reads when main-based source `ea8190f3` was deployed.
The 08:20 UTC run failed with a database statement timeout. Subsequent scheduled
runs recovered; this is an intermittent reliability defect, not a claim that
every refresh remains down. Staging still uses the 100-row source `f6aee12a`.

Restore 100-row keyset reads with a 2,500-page bound, retaining the original
250,000-mapping ceiling. Reject partial/error pages and non-monotonic product
IDs before replacing the durable ledger. SQL failure diagnostics disclose only
the cursor and a fixed reason. Add the actual loader regression to platform CI.
No database definition, provider permission, price expiry, cache or schedule is
changed by this repair. The larger ordered SQL candidate remains separate.

At 10:55 UTC, read-only service-role EXPLAIN ANALYZE against production's existing
function returned 500 rows in 2,796.589 ms and 100 rows in 155.585 ms. Staging's
100-row sample took 1,485.293 ms. All probes used an eight-second statement
deadline and rolled back. These single observations establish bounded sampled
reads, not a latency benchmark or proof of the exact historical slow page.

The audit's 59 stale guides belong to TCGCSV (20 English, 39 Japanese), separately
from Cardmarket's printing-level blended guidance. Chinese and Korean TCGCSV
remain unsupported. Source timestamps, currency, FX, native identities and the
48-hour expiry remain authoritative; downloading a file cannot renew its age.

Validation and delivery are recorded in the task's final release receipt. A
successful worker must also yield current stored source evidence. Owner-authenticated
phone prices and exact finish/condition prices are outside this worker repair.
