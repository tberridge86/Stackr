# Backend ownership repair follow-through — 11 October 2026

This second heartbeat pass started from
`4504a75276a0680540c9edfc59f7239e86ac55fc` on
`codex/specialist-audits-backend-repair-20261010`, matching open PR #329.
The maintained checkout was clean before the coordinator claimed work. Original
`D:/Stackr-1` changes were preserved. Main remained at
`38db6229f0dc419db37cca009320db9c1a7bbe92`; no new integration merge was needed.

## Prior repair checks

At the start of this pass, all nine applicable hosted checks succeeded on the
previous pushed head `4504a75276a0680540c9edfc59f7239e86ac55fc`. The release
candidate and canary API gates were skipped under PR conditions. PR #329
remained open and unmerged. This establishes the previous head's CI result,
not production or installed-device acceptance.

## PDX-001 feasibility

The backend specialist made a bounded read-only check of the existing published
index producer, consumers and representative named snapshot metadata. The
snapshot contains provider route IDs and names only; the existing source does
not contain a complete verified species/form mapping. The mobile consumer uses
those provider IDs for Dex numbers, region and completion calculations.

A safe correction needs a reviewed, versioned contract carrying provider route
ID, canonical species identity, National Dex number and default/form status,
with separate species and entry counts and preserved form browsing. A numeric
cutoff or name suffix heuristic would guess identities. The snapshot was not
rewritten or published and no full provider mapping sweep was performed.
PDX-001 remains unresolved; its next owner is backend with Pokédex identity
review. The historical audit measurements remain historical.

## PDX-004 implementation lane

The specialist reproduced the actual owned-name consumer admitting an explicit
Trainer or Energy card with a wrong Pikachu alias. The canonical adapter already
retains supertype metadata: its final row conversion preserves
`raw_data.supertype` even when the top-level field is absent. The worker owns
only `lib/pokedexCollection.ts`, `scripts/test-pokedex-loading.ts` and its new
scoped evidence report. The coordinator owns the queue and this receipt; the
reviewer is read-only.

Implementation revision: `b17c772f771d15170c60f6a5864fe812db094557`.
The guard checks outer `supertype`, `raw_data.supertype` and
`raw_payload.supertype` before deriving names. An explicit Trainer/Energy value
in any supported location takes precedence over blank or conflicting metadata.
It uses the existing NFKC/trim/lowercase policy and adds no provider or ownership
requests. Native and approved English names, reviewed form aliases, exact
card/set/source contributions and the underlying inventory remain intact.

The [specialist repair evidence](../audits/20261011/pokedex-ownership-eligibility-repair.md)
records 36 actual-consumer contamination controls failing before the guard and
passing afterward. The regression exercises 20 metadata scenarios independently
across physical, binder and manual ownership: 60 controls, including 24 retained
eligible or unknown-classification compatibility controls. Every case also
checks retained exact card/set/source identity, unchanged fixtures and no writes.
These are local fictional fixtures, not a new live catalogue census.

The [independent review](../audits/20261011/pokedex-ownership-eligibility-review.md)
found no actionable defect. The reviewer reran both narrow Pokédex regressions
and eight additional actual row-adapter/eligibility controls, all passing.
Final application typecheck and lint passed; lint has zero errors and eight
existing warnings. Whole-task diff checks passed. Backend/gateway runtime did
not change, so their checks were not rerun or claimed for this pass.

Missing and unknown classifications preserve existing compatibility; they do
not become verified species metadata. The separate Marnie translation proposal
is still unpublished; a defensive ownership correction does not repair that
source alias. Account-change ownership state and species/form completion counts
remain separate open findings.

PDX-004 is locally committed, tested and independently reviewed. It is not
merged, published to a signed application or installed-device verified. The
matching PR is the review lane; updated-head CI must be checked separately from
the previous head's passing checks.

## Delivery boundaries

No live catalogue correction, provider refresh, database script, schema change,
source activation, deployment, native upload or paid operation was performed.
No background or existing price-worker schedule was changed. Local source,
tests, review, merge, running API, signed application and installed-device
verification have separate states in the shared queue.
