# Backend metadata audit — 10 October 2026

Inspected source: `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1` on
`codex/specialist-audits-backend-repair-20261010` in the isolated release checkout.
The original `D:\Stackr-1` worktree was left unchanged. Root's concurrent agent
configuration work is outside this specialist's changes.

## Result and delivery state

A local correction prevents conflicting language/set metadata from selecting an
inferred Japanese English set name. The backend metadata audit also reproduced a
separate wrong English card alias through the actual production API. That alias
exists in the approved generated source itself; repairing its source and
publication requires the translation/catalogue handoff below.

| State | Evidence |
| --- | --- |
| Implemented | `backend/lib/cardDisplayNames.js` and focused cases in `scripts/test-backend-approved-card-names.mjs`. |
| Tested | Focused alias/identity regression, backend typecheck, Japanese and Chinese set supplement tests, translation search and server-to-mobile name delivery passed. |
| Independently reviewed | Pending coordinator review. |
| Committed/merged | Not performed by this specialist. |
| Deployed | This guard is not deployed. At `2026-10-10T22:16:01.473Z`, production `/health` reported backend SHA `9fae8fac7e8a`, `bundled_workflow_sha`, deployment `7070a53d-6b09-41e7-9e06-ee3fcb7b8212`. |
| Device verified | Not measured; no installed iPhone was inspected. |

No production catalogue/price write, refresh, job, schema change, source
activation, deployment, schedule change or cleanup was performed.

## Bounded scope

Read `AGENTS.md`, `docs/agents/README.md`, the backend/catalogue briefs and the
canonical catalogue contract. Followed the existing card route and versioned
transport through `app/card/[id].tsx`, `lib/stackrApiV1.ts`,
`backend/routes/v1.js` and `backend/lib/stackrApiV1.js`. The active serializer
reads published `api.catalogue_cards`, preserves the printing and publication
identifiers, native labels, collector number, separate variant/finish values and
explicit missing detail values.

`backend/lib/cardPresentation.js` and `backend/lib/metadataLibrary.js` do not
exist in this checkout. They were not recreated. The inspected implementation is
`backend/lib/cardDisplayNames.js`, called by the canonical card serializer and
the existing TCGdex/Japanese metadata adapters. The changed set-name branch is
used by those metadata adapters; it does not rewrite already published set names
in canonical API rows or alter the catalogue.

This is an initial targeted audit, not a whole-catalogue census. There was one
live card-detail check plus a named generated-source record inspection.
Metadata completeness, migration parity, duplicate counts, storage retention,
queue health and full-language coverage remain unmeasured in this audit.
The existing merged Chinese TCGdex conflict repair in PR #326 was preserved.

## Reproduced code mismatch and local correction

Before the change, these inputs incorrectly selected the Japanese manual set
lookup `Pokemon Card 151`:

```js
{ language: 'zh-cn', id: 'ja:sv2a', setCode: 'sv2a', localName: '测试' }
{ language: 'ja', setCode: 'sv2a', raw: { language: 'zh-tw', set_code: 'sv4a' } }
```

The corrected behavior is:

- Explicit canonical/raw language values must all identify Japanese before a
  Japanese manual lookup can be used. A region or old ID cannot override them.
- Conflicting explicit set codes or known manual-map aliases keep both the
  inferred English name and provider/editorial supplement unresolved.
- An unknown supplied set code cannot borrow a known older ID's translation.
- Valid `ja`/`jp`, an uncontradicted legacy Japanese ID and canonical UUIDs remain
  supported. Native primary names and directly supplied English metadata remain
  intact. No printing equivalence is inferred from a display name.

The regression exercises six contradictory identity cases, positive Japanese
and legacy-ID cases, canonical UUIDs, unknown codes, a stale region, preserved
native names and supplied English metadata. Existing coverage still checks all
19,315 approved exact printing aliases and the evidence hashes. This proves
lookup behavior and regression preservation; it does not prove those reviewed
aliases are semantically correct.

## Reproduced production alias error: 瑪俐 labelled Pikachu

At `2026-10-10T22:14:42.955Z`, this bounded public request returned HTTP 200:

`GET https://api.stackrtcg.com/v1/cards/4a459e00-0853-43a7-b0a6-e9d0f56c42f6`

Request ID: `c1578da3-f95e-4442-8ef5-ac676230e07d`.

| Field | Actual production value |
| --- | --- |
| Catalogue version | `f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e` |
| Language | `zh-tw` |
| Set | `205ab185-9052-4965-b9f0-20fe44b7b61f`, `SC1b`, `劍&盾 SET B` |
| Collector number | `171`; prefix/suffix null, sort `171`, sort key `000000000171` |
| Native name | `瑪俐` |
| Delivered English name | `Pikachu` |
| English source/provenance | `printing` / `published_stackr_exact_native_name`, authoritative `false` |
| Supertype / artist | `Trainer` / `kirisAki` |
| Rarity | Code and label null; applicability/source proof not assessed here. |
| Variant / finish | `28542b48-d40e-4cb8-8598-45a4c8720e4c`, `normal` / `normal` |
| Native image status | `scan_acquisition_required` |

The exact generated record in
`backend/lib/generated/ownerApprovedCardEnglishNames.js` is
`['zh-tw', '瑪俐', 'Pikachu', [12 printing IDs]]`. Its shared printing IDs are:

```text
1386b19f-ada3-447a-83d0-105acf48752c
3467f1b3-cfed-47c1-bddb-73a6507009b4
44b54476-f33f-435f-8985-b412cb5edb4c
4a459e00-0853-43a7-b0a6-e9d0f56c42f6
4a9af5de-61f9-4bb7-8133-5d28e2b356ad
63019ce2-f59b-4aed-a3e0-025789ecb7ab
818b3095-25cf-491e-b536-6a2e7513a3a0
971eba73-3c5f-4306-a6d5-700e8b748c9b
a52f71c8-a76c-449a-8030-219ec64a61d8
c3ee4722-7304-4cbf-a905-93162e371e76
d2132ffe-de94-462d-be98-8b6fba08e8ad
f9c8c84e-1179-4585-8a38-9591727bb676
```

The resolver's exact-ID path reproduces the same erroneous alias locally. This
audit did not fetch the other eleven live printings, claim their current API
state, independently source an official replacement translation or modify the
generated snapshot. Native identity and the Trainer classification were retained.

Handoff: translation specialist must verify the complete native title against a
permitted authoritative/reviewed source, correct the source-of-truth through the
existing generation path, inspect both generated server/client maps and add a
semantic Trainer-name regression. Catalogue owner must separately determine
whether any canonical published row needs a scoped, reversible data correction.
Root coordinates review and publication. The existing Pokédex Trainer exclusion
avoids an incorrect Pokémon result but does not correct this card-detail alias.

## Checks actually run

All commands ran from the repository root and returned exit code 0:

- `node scripts/test-backend-approved-card-names.mjs`
- `npm run typecheck:backend`
- `node --import tsx scripts/test-japanese-set-english-runtime-lookup.ts`
- `node --import tsx scripts/test-chinese-set-translation-runtime-lookup.ts`
- `node scripts/test-backend-translation-search.mjs`
- `node --import tsx scripts/test-server-name-delivery.mjs`
- Scoped `git diff --check` for the two changed code/test files.

The conflict cases initially failed against the previous implementation; the
final implementation passed them. No application TypeScript or gateway file was
changed. Existing set-name supplement tests were rerun after the final guard
change. Tests and a healthy API response are not full metadata sign-off.

## Next bounded backend repairs

1. Integrate and independently review the local set-name guard, then verify
   affected metadata delivery after release promotion.
2. Resolve the exact Marnie alias source cohort with translation/catalogue owners;
   retain unknowns until verified. Do not broadly replace Trainer names or infer
   translations from species IDs, price or artwork.
3. Establish indexed, publication-scoped read-only cohorts for missing native
   names, collector numbers, rarity applicability, species/supertype conflicts,
   set/language mismatches and variant finishes. Record denominators and exact
   conflicts before proposing any catalogue change.
4. Use the coordinator's central repair queue for subsequent bounded passes.
   This specialist dispatch has not created a continuous process or scheduled
   automation. Live mutation/deployment remains with the release coordinator.
