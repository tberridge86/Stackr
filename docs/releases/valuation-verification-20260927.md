# Collection pricing verification — 27 September 2026

The owner reports installed build 46 and incomplete collection values. This
repair reuses the existing Stackr price service, general-estimate resolver and
owner worker. It does not rewrite catalogue metadata, artwork or saved holdings.

## Measured starting point

Production's latest prepared generation was calculated at 2026-09-24 04:16 UTC:
366 copies, 166 exact-priced copies and 100 general-estimate copies, GBP 213.33
known subtotal, 100 unpriced copies. A fresh stored-evidence replay on 27 September
has the same coverage and GBP 211.90 subtotal; provider timestamps are 23 September,
so none of these prices is certified fresh. A newer snapshot is not a new sale.

Both Railway pricing services subsequently failed at `stored_exact_prices` with
Postgres cancellation 57014. The automatic schedule remains 06:00/18:00 UTC and
the explicit-request queue every five minutes. The owner has zero pending queue
requests at this baseline. GitHub's duplicate scheduled consumer remains disabled.

The RPC's unnest join allowed a scan of the entire published catalogue even for
one variant. The full single-card RPC measured 9,751 ms; its catalogue projection
alone measured 2,994 ms and 10,897 shared-buffer hits. Adding the logically
redundant requested-ID predicate measured 19 ms and 19 hits for that projection.
These are database measurements, not phone timings.

## Bounded repairs

- Add a requested-ID predicate to `latest_stored_exact_prices`. The exact price
  identity, source, publication, permissions, duplicate and 200-ID cap semantics
  remain intact. The existing backup-first preparation workflow has a pinned
  `stored-price-read` scope with definition-drift rejection and rollback rehearsal.
- Reuse the established verified English legacy set/collector rule for labelled
  general estimates when no literal card alias exists. Canonical printing IDs may
  also identify a same-set/language general base. Conflicts and repeated-printing
  ambiguity remain unavailable. This identifies 31 additional base-price identities
  in the frozen collection; none had a stored exact quote at diagnosis.
- Complete-owned/general refresh uses the same deduplicated owner snapshot as
  valuation, including legacy owned binder placements. Bounded/manual modes keep
  their existing scope. No saved quantity, condition, grade or finish is changed.

## Validation and delivery

PostgreSQL fixture tests compare old/new RPC results, wrong-language/condition and
private-snapshot rejection, duplicate inputs, the cap, unknown IDs, permission
checks, preservation of holdings and rehearsal restoration. Existing general
identity, worker, prepared-valuation and collection display tests cover the repair.

Production migration, deployed workers, refreshed coverage, public catalogue
verification and signed-in/device acceptance must be appended after measurement.
Build 46 predates the general-estimate client; source tests and stored totals do
not establish its displayed values or delivery of a newer client.
