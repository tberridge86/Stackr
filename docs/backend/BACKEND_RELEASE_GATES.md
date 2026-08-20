# StackR backend release gates

**Purpose:** move backend readiness toward 100% using evidence, not feature counts.

A backend area is complete only when its required gate passes for the exact commit being promoted. A route, table or integration existing in code does not by itself count as completion.

## Gate 1 — compilation and contracts

Required evidence:

- root TypeScript check passes;
- backend TypeScript check passes;
- generated/public API contract is in sync;
- StackR API v1 contract tests pass;
- gateway tests pass.

## Gate 2 — database integrity

Required evidence:

- migrations are ordered and backward compatible;
- migration tests pass against a clean PostgreSQL instance;
- owned-card membership migration tests pass;
- seller inventory batch migration tests prove atomic stock movement;
- production/staging reconciliation evidence exists before migrations are applied;
- destructive changes require a separately reviewed expand/contract sequence.

## Gate 3 — catalogue and assets

Required evidence:

- catalogue schema tests pass;
- ingestion tests pass;
- master importer tests pass;
- asset pipeline tests pass;
- imports are resumable and idempotent;
- source, permission, rights, hash and image-validation evidence are retained;
- language/set/card/variant identity is preserved;
- a quality report records recovered and remaining fronts, logos and symbols;
- no catalogue version is promoted while required asset or identity gates fail.

## Gate 4 — commerce integrity

Required evidence:

- seller stock-out routing tests pass;
- inventory changes are atomic;
- Premium Seller access controls pass;
- payment/webhook operations are idempotent before live money is enabled;
- order, sale, refund and cancellation state transitions are explicit and audited;
- shipping failures cannot leave payment, ownership and stock in contradictory states.

## Gate 5 — recognition runtime

Required evidence:

- recognition orchestrator tests pass;
- recognition-service Python tests pass;
- production container builds as a non-root user;
- container healthcheck is present and passes;
- approved model/index compatibility evidence exists;
- real-card benchmark evidence meets the agreed accuracy and latency thresholds.

## Gate 6 — security and privacy

Required evidence:

- secret scan passes for the commit range and exported bundles;
- dependency policy reports no unaccepted critical vulnerability;
- service-role credentials remain backend-only;
- row-level security and object-ownership tests pass;
- externally transmitted card images follow the recorded consent and retention policy;
- child/family permissions are not enabled until their dedicated privacy controls pass.

## Gate 7 — deployment and recovery

Required evidence:

- staging backend, recognition service and gateway deploy successfully;
- private and public smoke tests pass;
- a verified physical or logical backup exists before database mutation;
- rollback rehearsal identifies the exact prior service and catalogue versions;
- the mobile build records its backend, gateway, catalogue and model versions;
- Railway and gateway deployment statuses are green for the promoted commit.

## Machine-readable score

`node scripts/backend-readiness-report.mjs --scope=full`

The report runs the existing compile, API, commerce, catalogue, recognition and gateway checks and writes `reports/backend/readiness.json`. Its percentage is a test-pass percentage for that commit; it is not a claim that untested production behaviour is complete.

## Current rule

The backend may continue to advance while the customer-facing visual layer is frozen. Backend changes must remain on reviewed branches and must not be used to claim the current phone build has been visually approved.
