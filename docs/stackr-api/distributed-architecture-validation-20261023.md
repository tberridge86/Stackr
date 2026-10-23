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
ownership/index query redesign, stable search continuation, web renderer lazy
loading, private binary storage migration, Railway scheduler/replica coordination,
Pages provisioning and any query-plan-backed index changes. Existing canonical
schema and RLS are preserved. The live changes require the concrete sign-off
evidence in `distributed-architecture-20261023.md`; they are not implied approval
to migrate data or alter infrastructure.
