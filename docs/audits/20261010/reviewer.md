# Independent reviewer audit — 10 October 2026

Reviewer: `stackr_reviewer`. Read-only review of `D:/Stackr-release-recovery-20261009`, branch `codex/specialist-audits-backend-repair-20261010`.

No blocking defect was found in the seven prepared runtime repairs. All seven are **review-ready locally**, subject to the coordinator’s final integrated checks. This does not establish merge, deployment, matching signed-app delivery or installed-device behavior.

## Baseline and scope

The reviewed baseline is HEAD `7b6cb00eff1d9d85b11a0af5700cb1bba0fd7cd6`. The other specialists’ historical audit baseline remains `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`. The separately owned changes merged through PR #327 are baseline work, not changes attributable to this task.

Reviewed the task-owned working diff in:

- `backend/lib/cardDisplayNames.js`
- `components/PricingV2Summary.tsx`
- `lib/cardArtworkPresentation.ts`
- `lib/pricingV2.ts`
- `lib/searchNormalisation.ts`
- `lib/stackrDomainAdapter.ts`
- Their five changed regression scripts, plus `AGENTS.md`

Also read `.codex/AUDIT_PROTOCOL.md`, `.codex/agents/stackr_backend.toml`, the assignment plan, all eight other specialist reports, audit README, repair queue and the Marnie correction proposal. Followed relevant client, serializer, account-cache, collection-price, search, Pokédex, artwork, cover-control and history callers. Read the repository ownership briefs and applicable React Native/Supabase skills.

The original `D:/Stackr-1` checkout was not changed. No source edits, generated artifacts, catalogue changes, migrations, provider calls, live jobs, deployments, commits, pushes or external messages were performed.

## Seven repairs reviewed

| Repair | Review result and protected behavior |
| --- | --- |
| **BACKEND-SET-IDENTITY-001** | Ready. `backend/lib/cardDisplayNames.js:264,339,366,411` rejects contradictory explicit language/set identity before inferred manual/provider supplements. Valid Japanese inputs, canonical UUIDs, uncontradicted legacy IDs, native names and directly supplied English metadata remain supported. This does not rewrite published canonical names. |
| **PRICE-AUDIT-01** | Ready. `lib/pricingV2.ts:60–89` resolves the actual client account/server namespace before cache lookup, prevents caller properties overriding account/card identity, and checks account identity after asynchronous reads. Sign-out and account changes reject instead of returning an earlier account’s response. Cache insertion is bounded to 200 entries at line 135. |
| **PRICE-AUDIT-02** | Ready. `lib/stackrDomainAdapter.ts:1386` preserves `provisional_catalogue_baseline` as general, alongside ordinary general estimates. Exact controls remain exact. The change does not introduce sold evidence or alter holdings. |
| **PRICE-AUDIT-03** | Ready. `lib/pricingV2.ts:121` recognizes the real `provider` field and retains source, original amount/currency, FX and raw-record fields through presentation conversion. Missing historical evidence remains missing. |
| **PRICE-AUDIT-04** | Ready. `components/PricingV2Summary.tsx:56` conditions stale queue copy on `refreshQueued`. The false queued claim is removed when that field is false. A forced stored-price read is still not evidence of a provider refresh job. |
| **ART-001** | Ready. `lib/cardArtworkPresentation.ts:51–62` accepts an absent sibling only through consistent explicit same-artwork status/pointers and ordinary selected finish. Existing asset permission, availability, game/card/set scope and present-sibling checks remain intact. Results retain the `shared` label; exact selected artwork retains priority. |
| **SEARCH-001** | Ready. `lib/searchNormalisation.ts:21–36` preserves native letters/marks, gender and delta-form terms while folding Latin accents and retaining collector syntax and aliases. The regression executes the real normalizer and mounted screen callback, plus actual set ranking, rather than mocking normalization. Other callers in global search and product-to-set matching were traced. |

No broad rights exception, canonical identity rewrite, price refresh operation or account-access bypass was introduced by these changes.

## Unresolved substantive findings

These are existing findings retained in the queue, not regressions introduced by the reviewed diff. Source checks and local reproductions corroborate the principal findings; fresh live observations remain attributable to their named specialist reports.

| Priority / queue ID | Exact source, trigger and incorrect behavior | Concrete repair direction |
| --- | --- | --- |
| **P1 — PDX-002** | `app/(tabs)/pokedex.tsx:353` publishes ownership without an account comparison; `app/pokemon/[id].tsx:127` guards late publication but retains previous ownership after a failed new-account read. Account change/failure can display another account’s or unknown ownership as current. | Store successful ownership with its account, invalidate on auth changes, and expose pending/error state. Disable ownership-derived decisions until the current account’s read succeeds. |
| **P1 — TRANSLATION-MARNIE-001** | `backend/lib/generated/ownerApprovedCardEnglishNames.js:32` contains the exact `zh-tw / 瑪俐 / Pikachu` group. An independent local resolver call for printing `4a459e00-0853-43a7-b0a6-e9d0f56c42f6` still returns Pikachu. | Correct the reviewed source/canonical aliases through the existing exact 12-ID proposal, preserving current before-images, provenance and scoped rollback. Reconcile stored search aliases and generated candidate indexes. |
| **P1 — PDX-004** | `lib/pokedexCollection.ts:539` converts owned display names into species ownership without Trainer/Energy eligibility checks. Owning the wrongly aliased Trainer can mark Pikachu owned. | Exclude known non-Pokémon rows and resolve ownership through reviewed species identity. Keep the semantic Marnie correction separate. |
| **P1 — PDX-001 / PDX-003** | `backend/lib/pokedexIndex.js:27` exposes provider Pokémon/form IDs; `app/(tabs)/pokedex.tsx:409,464,485` uses them for completion and numbers. `lib/pokedexCollection.ts:42` removes gender glyphs, while `backend/lib/pokedexCards.js:26` uses different matching semantics. | Separate species, form and route identities; count species once and share reviewed gender/form aliases across retrieval and ownership. |
| **P1 — PERF-001** | `app/set/[id].tsx:696` awaits the default artwork-enriched card reader before publishing facts at line 699. Optional enrichment can delay useful content. | Consume the existing bounded facts lane, publish facts first, and enrich with request/account guards. Prove behavior with stalled artwork. |
| **P1 — PERF-002** | `app/(tabs)/search.tsx:1129` waits for every source before final group publication/loading completion. A nonsettling source can leave loading active. | Publish each source independently with bounded deadlines, cancellation and honest partial errors. |
| **P2 — ART-002** | `lib/corocoroSuppliedCovers.ts:36` ignores the existing environment removal controls; `components/CorocoroIssueCover.tsx:12` supplies no disabling context. An independent in-memory reproduction still returns May 2001 artwork with both controls set. | Apply the existing source/per-issue policy before supplied-cover selection, retaining placeholders. |
| **P2 — TRANSLATION-SET-PARITY-002 / TRANSLATION-TRAINER-FALLBACK-003** | `lib/pokemonDisplayNames.ts:522,651` still accepts contradictory set identity; line 844 can infer Pikachu from a legacy Marnie `dexId:[25]`. Both were independently reproduced locally. | Match backend conflict semantics and restrict species-derived full-title inference, preserving native/unresolved names. |
| **P2 — HISTORY-DIRECT-WRITE-001** | `app/set/[id].tsx:776,795,816` saves inventory before a separate history write without persisted history-only recovery. The binder path is corroborated by the coding audit. | Reuse owner-bound recovery with stable event IDs; retry history without replaying holdings. |
| **P2 — PDX-005 / SEARCH-002** | `app/pokemon/[id].tsx:510` confines retry/error presentation to empty results; populated partial results retain misleading loading/progress copy at line 497. `app/(tabs)/search.tsx:994,1154` treats cached facts as fresh success after factual retrieval fails. | Show partial failure/retry independently of emptiness; distinguish cached facts from successful fresh facts. |

PERF-003 remains a source-backed image-boundary handoff, without measured image-cost or speed claims. Backend metadata cohorts remain an investigation, not an established completeness result. The unreachable legacy price fallback is a low-priority cleanup candidate, not a demonstrated live failure.

## Checks independently performed

All executed checks passed, with TEMP/TMP directed to D:

- `node scripts/test-backend-approved-card-names.mjs`
- `node --import tsx scripts/test-pricing-v2-client.ts`
- `node --import tsx scripts/test-catalogue-price-client.ts`
- `node --import tsx scripts/test-master-set-artwork.ts`
- `node scripts/test-progressive-card-search.mjs`
- `node --import tsx scripts/test-global-search-language-fanout.ts`
- Scoped `git diff --check`

Additional local probes confirmed the unresolved client set conflict, legacy Trainer fallback, exact approved Marnie alias and supplied-cover removal-control bypass. JSON inspection confirmed **24 unique queue IDs** and **12 unique proposal printing IDs**; the proposal remains pending canonical review with `canonicalDatabaseWriteAuthorized:false`.

A minor translation-report hash description was corrected by the coordinator: `3309…` describes the containing generated snapshot across 19,315 printings, rather than only the Marnie group. No source or finding changed.

## Validation and delivery limits

The coordinator supplied passing backend typecheck and pre-search application typecheck/lint results, with zero lint errors and eight existing warnings. Final integrated application/backend gates after SEARCH-001 remain coordinator-owned and were not represented here as completed. Gateway runtime files are unchanged.

The supplied Hermes compiler check supports Unicode-property-regexp compilation for SEARCH-001; this reviewer did not independently execute it or obtain native runtime evidence.

No new API, private inventory/RLS, provider, signed-build or phone observation was made. Historical build 54 records source `bf3d7a…`; the unsigned export and prior server deployment do not establish installation of these repairs. Current complete price coverage, catalogue semantics, HD artwork coverage and physical-device latency remain unmeasured.

The protocol/backend definition preserves bounded ownership and existing live-operation authority. ACTIVE two-hour local continuation is coordinator-supplied evidence and requires the computer and Codex app to be running; configuration alone does not prove a completed background repair.

**Conclusion:** all seven prepared repairs are independently reviewed and ready for local integration gates. The unresolved queue, Marnie publication proposal and matching API/signed-app/device delivery requirements remain explicit. The coordinator records this read-only report and completes the nine-report inventory.
