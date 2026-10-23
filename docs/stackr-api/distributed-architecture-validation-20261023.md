# Distributed architecture implementation evidence

Date: 23 October 2026. Base: `7e22cee8d94f2904c3c2cfcf2c0e28da74eabdcc`.

The candidate was prepared in an isolated source checkout, preserving the user's
existing working changes. The current GitHub source changes were overlaid and
verified against their Git blob hashes; no complete media library was downloaded.

## Implemented

- Explicit R2 public catalogue writer with signed, create-only uploads, deadlines,
  bounded reads and byte verification before duplicate reuse.
- Exact original-byte preservation with separate WebP derivatives. Source rights,
  printing identity, immutable previous objects and rollback receipts remain intact.
- Provider/bucket-correct URLs in the actual v1 card and manifest responses and
  the legacy manifest. Mixed Supabase/R2 originals and derivatives are supported.
- Existing public ingestion/repair callers use the configured writer. Stored
  legacy repairs preserve original location and write only new derivatives to R2.
- New v1 client pages at most 50 rows; complete Pokédex windows and full-set row
  capacity are preserved. Server enforcement is an explicit rollout switch.
- Pages export configuration, server-only R2 environment example, repository
  architecture guidance and an explicit owner sign-off/rollback matrix.
- Regression suite is included in Platform CI as `test:distributed-architecture`.

## Local validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run typecheck:backend` | Pass |
| `npm run lint -- --no-cache` | Pass; eight existing warnings in unchanged UI files |
| ESLint on all changed JS/TS files | Pass; nine warnings in existing declarations |
| `npm --prefix gateway test` | Pass, 56 tests |
| `npm run test:distributed-architecture` | Pass; R2 storage/route fixtures, actual v1 service projection, pagination and stored repair |
| `npm run test:asset-pipeline` | Pass |
| `npm run check:api-contract` | Pass; generated contract and 43/43 route coverage |
| Search artwork batching, preferred set artwork and catalogue cache regressions | Pass |
| Printing manifest and backend search enrichment regressions | Pass |
| Japanese completion fixture suite | Pass |

The independent reviewer rechecked the final provider routing, repair read/write
split, stable manifest ordering and duplicate verification. No unresolved findings
remain in the reviewed scope.

Tests reused locally installed dependencies rather than performing a fresh network
install. In particular, local Sharp was 0.35.3 while the backend lockfile specifies
0.35.5. CI must repeat the suite using committed lockfiles. The broader
`test-stackr-api-v1.mjs` pure assertions passed, but its localhost HTTP stage was
blocked by sandbox EACCES. A standalone native client test could not bootstrap
React Native Flow in Node; the new pagination regression exercises the shipped
transport/index functions without native bootstrap.

## Explicitly outstanding

No deployment, remote database mutation, catalogue publication, production job,
DNS change or asset migration was performed. Live R2 conditional-write acceptance,
custom-domain binding, CORS, actual app image delivery, device rendering and
latency remain unverified.

The architecture is a staged implementation. Remaining work includes legacy
ownership/index query redesign, stable search continuation,
private binary storage migration, Railway scheduler/replica coordination,
Pages provisioning and any query-plan-backed index changes. Existing canonical
schema and RLS are preserved. The live changes require the concrete sign-off
evidence in `distributed-architecture-20261023.md`; they are not implied approval
to migrate data or alter infrastructure.
# Release-owner CI repair, 23 October 2026 16:54 UTC

Reviewed draft PR #437 at `12fbc463cb47b4577f66b25704c1883a662f5f5f`, based on
main `7e22cee8d94f2904c3c2cfcf2c0e28da74eabdcc`. This follow-up changes tests and
historical evidence only; it does not activate R2, change runtime code or deploy.

Hosted Platform CI [39989509377](https://github.com/tberridge86/Stackr/actions/runs/39989509377)
failed five jobs: benchmark evidence, API contract, integration, lint/type/unit
at server-delivery, and the secret scan. Database tests and the recognition
container passed; the release-candidate gate was skipped. The new distributed
architecture suite, backend tests and later lint/type/unit steps were skipped
after server-delivery failed. Gateway API-contract checks and binder source
checks also failed; pricing identity checks passed. These are not release passes.

The focused repair:

- Replaces an empty public index response mock with 1,350 synthetic identities.
  The real client must return exactly the requested 1,199 identities through
  exactly 24 requests (23 x 50, then 49), without reading a login token.
- Updates static manifest and OpenAPI assertions to the implemented 50-row limit;
  exact printing selectors, cursor and cancellation assertions remain.
- Uses an explicitly example service key in the mocked R2 test. Scanner rules
  remain unchanged.
- Preserves the historical importer as non-executable `.mjs.txt` evidence from
  commit `0944d528dea01056fb22c76c83c3fa6540779524`. Its original SHA256
  `ead106e80c9fc78be5fc957646a84572a2430c213d31916d9fc623d5aa201a02`
  and all six session checks remain unchanged; the plan now records its original
  path/revision rather than hashing the evolving runtime importer.

Local Linux/Node 24 checks: all four `test:distributed-architecture` commands,
API transport policy, API v1 integration, cache recovery, full `test:server-delivery`,
recognition tomorrow-prep, typecheck and lint passed (lint: 0 errors, 8 warnings).
Working-tree secret scan passed over 3,805 tracked files before adding the
historical snapshot. Independent review verified snapshot bytes, unchanged
capture restrictions and pagination assertions. Dependencies were reused from
the earlier isolated checkout; hosted locked installs remain authoritative.
These are mocked/local outcomes, not live CDN or device measurements.

**Exact remaining action:** the unchanged history scanner reproducibly rejects
`7e22cee8..12fbc463` because the original commit contains the synthetic
`fixture-service-key` assignment. Changing the current fixture does not erase
that finding. Resolve this verified false positive with a separately reviewed,
narrow scanner repair and positive/negative secret fixtures; do not disable the
gate, broadly exclude tests or rewrite history. Then inspect the new exact-head
CI run, including previously skipped steps. Keep this PR draft for owner review.

PR #436 is a separate draft at `65a671771f6bdfca3eb3723f136e27fe427736cf` with
overlapping client/API/gateway/CI changes. Its latest Platform run
[39986216811](https://github.com/tberridge86/Stackr/actions/runs/39986216811)
passed API/integration/benchmark/security jobs but failed lint/type/unit at
mobile-recovery; it is not a green integration prerequisite. Reconcile both
heads in an isolated integration checkout before promotion.

Release layers remain separate: no migration added here; production/staging
migration compatibility was not remeasured in this source-only repair. No
Railway, gateway, R2, Supabase, EAS native or OTA operation was dispatched.
Installed build/channel/runtime and actual image/card/price/device journeys
are unmeasured for this candidate. Existing storage/enforcement/scheduler/Pages
sign-off and rollback requirements above remain pending.

## Rebuild and automatic validation, 23 October 2026

This stage continues from PR head `416c235d062643cf3ac08e2eaf1edd5ec492bf01`.
It preserves both earlier commits and their source/evidence changes.

The binder and Platform CI failures at that head share one stale artwork-recovery
test. The repaired fixture checks four continuous 50-row pages for 200 identities,
complete results and distinct asset identity for every card. It no longer reuses
one synthetic asset ID across different cards. Full feedback-recovery and binder
retrieval suites pass locally, including 54 binder reopen/isolation checks.

The historical scanner finding is resolved through the narrow scanner repair
requested above. Only the exact, case-sensitive audited mock value is exempt
from the assigned-secret rule. Other values, prefixes/suffixes, neighboring
assignments and independent token rules still fail. Actual CLI/temporary Git
tests also prove detection after a secret is removed and across multiline patch
runs without joining separate files, hunks or opposite patch sides. The raw
history scan remains active; no branch history was rewritten. On this Windows
sandbox, temporary Git fixtures use an explicitly writable workspace directory
because Git cannot write its config in the default application temporary path.

The implementation now separates owned-name facts from optional artwork. Seven
adapter fixture groups prove zero ownership manifest requests, unchanged exact
identity selection, six concurrent fact reads, cancellation and rejection of an
incomplete required projection. Display callers retain artwork enrichment.
Ownership, English identity, Home startup, artwork reassignment and uncached-card
runtime regression suites pass. The remaining 500/1,000-row ownership reads are
still outstanding; no universal payload-limit or measured latency claim follows.

Plain anonymous CDN artwork uses real web lazy/eager image attributes while
retaining the stable frame and vetted retry/fallback candidates. Signed/header
sources, memory-only references, placeholders, transitions and tint keep the
existing Expo renderer. Native behavior is unchanged. DOM markup, component
events, image recovery and 25 preload/window checks pass. Browser cache source is
reported as unknown, not incorrectly labelled as a cache miss.

Architecture validation now runs in a separate Platform CI job against the exact
PR source commit. Each suite is attempted after dependencies install, even when
a preceding suite fails. Its artifact records every outcome and explicitly
keeps live R2/CDN/app/device/latency checks unverified. Missing or skipped checks
cannot make that report pass. The report contract tests and workflow YAML parse
pass locally. Root typecheck and lint pass; lint retains eight existing warnings.

Hosted locked-install CI remains the acceptance source for this revision. The
workflow artifact and PR checks carry its current results. No live migration,
deployment, catalogue publication or scheduler activation is performed by this
stage or its automatic validation job.

The prepared Railway catalogue worker uses the existing Docker image and runner.
Its wrapper and config are inactive by default, retain existing durable leases
and deadlines, and introduce no schedule. Activation and timeout tests pass;
configuration fields were checked against Railway's current public JSON schema.
Live service acceptance remains unverified. The combined eight-suite
`test:distributed-architecture` command passes, as does independent review of all
stage changes. Owner-teaching tests also pass. The local integration-repair chain
passes its five ownership/search groups, then stops at a named Storm logo evidence
file intentionally omitted from this isolated source snapshot; hosted CI uses
the complete committed source and remains the authority for that full chain.
