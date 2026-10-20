# Independent pricing audit — 10 October 2026

Audit owner: `stackr_pricing`. Source baseline:
`5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, integration branch
`codex/specialist-audits-backend-repair-20261010`, checkout
`D:/Stackr-release-recovery-20261009`. Checks completed at approximately
22:18 UTC. This audit changed this report only. It did not refresh prices, call
providers, query a remote database, deploy, or inspect an installed phone.

The stored bulk-read controls pass, but the separate V2 presentation cache has a
reproduced account-boundary defect. The catalogue snapshot adapter also loses a
provisional estimate's general classification. Neither finding proves that the
owner's current TestFlight build uses the affected path.

## Inspected contract and bounded sample

Read `AGENTS.md`, `.codex/AUDIT_PROTOCOL.md`, `docs/agents/README.md`,
`docs/agents/pricing.md`, `assignment-plan.json`, the pricing-service and V2
methodology documents. Inspected actual tracked `lib/pricing.ts`,
`lib/pricingV2.ts`, `lib/stackrDomainAdapter.ts`, `lib/cataloguePrices.ts`,
`lib/cataloguePriceCacheCore.ts`, client/server baseline modules,
`lib/useCataloguePriceOverlay.ts`, `lib/collectionPricingApi.ts`,
`lib/collectionPricingState.ts`, `components/PricingV2Summary.tsx`, the card-detail
caller, `backend/lib/marketPricing/service.js`, `cataloguePriceRead.js`,
`estimateBuilder.js`, sold-provenance contract and the named regression scripts.
Read the dated daily-readiness, pricing-quality and live-promotion receipts.

Named vintage controls are Base Set Alakazam/Mewtwo holo, Jungle Scyther 10 holo
and 26 normal, Fossil Dragonite 4 holo and 19 normal. They were traced through the
existing receipt and current general/exact reader selection, rather than
repeating a live sweep. Modern common/uncommon and raw/graded/sealed controls
used local fixtures. Existing identity tests exercise Chinese Traditional
variant/finish/edition mismatches and language/set isolation.

## Reproduced findings

### PRICE-AUDIT-01 — P1: V2 cache bypasses the current account check

`lib/pricingV2.ts:52–64` builds its memory cache key from card ID and options,
then returns a cached value before invoking `fetchStackrPrice`. It includes no
account/auth/server scope and no guard after an in-flight response. The lower
raw-detail catalogue cache has account isolation; this upper cache bypasses it.

Reproduction transpiled the actual module with only its adapter dependency
replaced. The adapter succeeds for owner A and would reject another account or
sign-out. Owner A reads the card; change to owner B and then sign out; request the
same card/options. Both receive A's £42 fixture quote, with exactly one adapter
call. The reuse window is 60 seconds. This is a demonstrated local boundary
failure, not a production price or proof of another owner's holdings exposure.

`components/PricingV2Summary.tsx:95` consumes this function, and the card-detail
screen mounts that component. Its activation requires
`EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED=true`; current signed-build flag evidence
was not obtained. Production API account enforcement is not thereby disproved.

Smallest repair: resolve the hashed pricing account/server scope before a cache
lookup; include it in the key; reject stale-account completions before storing
or returning; bound/clear obsolete presentation entries. Delegate
`lib/pricingV2.ts` and `scripts/test-pricing-v2-client.ts` together to the pricing
owner, then independently review the account boundary. Required cases: A→B,
A→signed-out, token rotation within A, account change in flight, alternate
conditions/grades/languages, forced refresh. **Status: reproduced, unfixed.**

### PRICE-AUDIT-02 — P2: provisional snapshot marked exact

`lib/stackrDomainAdapter.ts:1386` classifies only
`fallbackEstimate.reason === 'general_card_estimate'` as general. A
`provisional_catalogue_baseline` therefore becomes `price_basis: 'exact'` in
`fetchStackrPriceSnapshots`, despite its explicit `exact:false`, zero observed
samples and prohibition on exact/holdings use.

Reproduction executed the actual adapter with a returned provisional row and
`estimateMode:'general'`; it returned `price_basis:'exact'`. The normal collection
price loader separately checks `fallbackEstimate`/`quoteScope`; this audit did
not establish that Home currently consumes this wrong field or incorrectly
adds that baseline to holdings. Current exact-default snapshot callers do not
by themselves demonstrate a general-price leak.

Smallest repair: preserve every labelled fallback/general/provisional scope in
the snapshot conversion, including usability flags and provisional model
identity where exposed. Add a real-adapter fixture for provisional and general
rows plus exact/sold controls. Coordinate exclusive ownership of
`lib/stackrDomainAdapter.ts` with coding/performance. **Status: reproduced,
unfixed.**

### PRICE-AUDIT-03 — P2: V2 presentation loses provider provenance

`lib/pricingV2.ts:113–118` reads `providerCode`/`source`, but current service
snapshot conversions use `sourceBreakdown[].provider` (for example
`backend/lib/marketPricing/service.js:1202`). The mapper returns `unknown` and
retains neither `evidenceType`, original amount/currency nor FX evidence. The
same actual-module reproduction confirmed a `provider:'tcgdex'` breakdown
becomes `source:'unknown'`.

The full price response retains those fields; this is a presentation conversion
loss, not proof that raw evidence was deleted. Existing legacy wrapper snapshots
already have a separately recorded underlying-source/FX retention limitation.
Smallest repair: accept the real provider field and retain source/evidence/FX
details in the presentation model, without inventing missing historic fields.
Add a fixture carrying both TCGCSV and Cardmarket provenance. **Status:
reproduced, unfixed; same owner as PRICE-AUDIT-01.**

### PRICE-AUDIT-04 — P2: stale V2 copy claims a queued refresh

`components/PricingV2Summary.tsx:54` says a refresh has been queued for every
stale value. `lib/pricingV2.ts:123` always returns `refreshQueued:false`; its
current adapter path reads stored evidence. This is a source-demonstrated false
status message. A tap labelled refresh bypasses local caches; it does not itself
prove a provider refresh job was queued.

Smallest repair: condition the queue copy on actual queue evidence, otherwise
state that the stored estimate is stale. Keep refresh reads separate from
write-capable refresh endpoints. Add a stale-not-queued copy fixture.
**Status: source-reproduced, unfixed; mobile activation/device unverified.**

## Passing controls and evidence limits

- `read_catalogue_prices` currently accepts **1–100 exact references**.
  `cataloguePriceRead.js` uses one stored-evidence identity RPC, optional bounded
  printing-guide batches, and an optional 450 ms metadata phase. It does not
  make a provider request per common card or queue a refresh during this read.
- The actual price-client fixture fetched **201 references in 3 bulk requests**
  (100/100/1), with **zero individual identity/price requests**. A simulated disk
  restart used zero network requests. Account, refreshed-token, language,
  general/exact and detail-condition scopes passed. Authentication failures were
  not converted into an empty price response.
- General browsing retains an available requested exact stored quote, including
  stale evidence, ahead of sibling/printing guides. General estimates clear
  individual sold claims and cannot be promoted to exact/holdings evidence.
  Cardmarket blended scope has unknown language/condition/finish/grade; TCGCSV
  printing guides preserve their supported source language separately. Exact
  mode does not use either guide as a comparable.
- GBP display uses pennies; original provider precision, currency, dated FX and
  source timestamps remain in the general reader's source breakdown. Invalid,
  nonpositive, future or insufficiently scoped quotes remain unavailable.
  Existing legitimate low amounts are preserved rather than inflated by a
  blanket vintage price floor.
- Sold-estimate construction requires authorised provider evidence, exact
  canonical match, completed/final-paid verification, source item/HTTPS URL,
  immutable raw record, evidence hash and dated provenance. Asking-only
  observations cannot qualify as sales. Sale-derived estimates remain estimates;
  an aggregate is not an individually proven last sold.
- Current source deliberately uses **baseline-v2**, for recognised modern
  ordinary common/uncommon raw cards only, and rejects retired v1 cache rows.
  A common 2024 control returns £0.09 with low confidence and
  `Estimated price (provisional baseline)`; rare/vintage/unknown/special finish,
  graded and sealed controls return no provisional value. This preserves the
  reviewed cheap-vintage correction, but **does not satisfy the supplied broad
  v1/all-resolved-raw coverage requirement**. Reintroducing the former £0.25
  unknown/rare baseline would conflict with the recorded pricing-quality repair.
  Root must reconcile that policy explicitly; no broad baseline was silently
  restored in this audit.

## Daily refresh and 75,000-card requirement

The latest **prior live** receipt is
`docs/releases/daily-pricing-live-promotion-20261010.md`, approximately
09:49–10:33 UTC. It records backend bundled source `9fae8fac7e8a`, production
database `oakdbbzdqwurpjnoqhmu`, and successful retained bulk workers. This audit
made **no fresh live/API observation** and does not re-date those measurements.

That receipt measured 76,317 published variants, 76,269 classified and 48
unclassified; TCGCSV English quotes 23,125 and Japanese 6,980, with 36,336 open
repairs including 28,813 unsupported-language and 1,240 unsupported-finish
outcomes. Cardmarket acknowledged 9,198 price inputs with a completed provider
cursor. These counts are different populations; they are neither additive
unique-card coverage nor proof of 75,000 usable current valuations.
`fullCatalogueCurrent=false` remains explicit. Combined unique fresh API-price
coverage and latest owner/phone coverage are **unmeasured in this audit**.

The prior vintage controls preserve their scope: Alakazam holo £53.52 and
Mewtwo holo £65.72 are condition-unspecified general estimates. Scyther 26 normal
£32.10 and Dragonite 19 normal £266.83 are reviewed Cardmarket blended general
values, unusable for exact variants or holdings. Scyther 10 holo and Dragonite 4
holo remain unavailable. All six exact controls were unavailable in that prior
service receipt; this is honest missing exact evidence, not a zero price.
Primary TCGdex references supported the normal printing-product bindings, but
archived Cardmarket raw-record references were absent from production. Preserve
the latter as a provenance-retention handoff, without quarantining a mapping
solely because a value is high.

Fresh-provider detection and hourly idempotent checks already exist; repeated
zero-write runs of an unchanged provider revision are valid. A rolling 48-hour
source-age gate is not a guarantee of new prices every calendar day. Completing
the retained provider cursor does not resolve unsupported languages, missing
mapping/finish identity, missing market evidence or full coverage. Exact
language/condition/finish/grade matching must precede any further price value.

## Checks actually executed

All below exited 0 using local fixtures/mocked providers. The service suite's
HTTP calls used a loopback Express server. No live job entry point was run.

| Exact command | Result |
| --- | --- |
| `node --import tsx scripts/test-pricing-v2-client.ts` | PASS: exact identity, grading, force, currency and late UI responses |
| `node --import tsx scripts/test-catalogue-price-client.ts` | PASS: bounded bulk reads, restart and scoped caches |
| `node scripts/test-market-pricing-service.mjs` | PASS: raw/graded identity, read-only routes, stale/legacy scope and mocked provider cases |
| `node scripts/test-catalogue-price-daily-status.mjs` | PASS: source freshness, honest incomplete coverage and bounded logs |
| `node scripts/test-cardmarket-daily-worker.mjs` | PASS: mocked worker invocation, mounted paths and pinned write target |
| `node scripts/test-sold-provenance.mjs` | PASS: completed-sale provenance boundary |
| `node scripts/test-market-pricing-estimate-builder.mjs` | PASS: exact sale-derived estimate construction |
| `node --import tsx scripts/test-catalogue-price-baseline.ts` | PASS: current v2 baseline eligibility/rounding and exclusions |
| Actual-module VM reproductions described above | FAILING INVARIANTS REPRODUCED: account reuse, provisional exact basis, provider loss |

The passing existing tests do not cover the reproduced V2 account defect. No
runtime edits were assigned, so root TypeScript/backend/gateway checks were not
rerun for this report-only audit.

## Coordinated next work

1. Pricing owner fixes PRICE-AUDIT-01 and PRICE-AUDIT-03 in one exclusively owned
   presentation change, with independent account/provenance review.
2. Coding assigns the adapter conversion repair for PRICE-AUDIT-02 sequentially
   with any other `stackrDomainAdapter.ts` work; mobile owner fixes PRICE-AUDIT-04.
3. Pricing/backend owners continue exact reviewed mapping and archived source
   retention work from the existing queue. Obtain a bounded, frozen combined
   catalogue denominator and owner-authenticated readback when the established
   release lane permits it. Unsupported provider/language scopes and missing
   completed-sale access remain explicit.
4. Release owner verifies signed-build flags and actual installed-phone pricing
   after coordinated mobile delivery. Source tests and successful bulk jobs
   cannot close that requirement.

Delivery state: **audited/reproduced locally**; report only. No new pricing fix
implemented, merged, deployed or device-verified by this specialist run.
