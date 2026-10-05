# Classified Stackr pricing — 5 October 2026

Later recovery: [card-price recovery](pricing-recovery-20261005.md) records **4,174 newly stored provider quotes**, the historical cheap-value fallback and the subsequent full classification refresh. The figures below retain the original 17:17 observation.

The production database has processed **76,078 / 76,078 current published variants (100.00%)** across English, Japanese, Simplified Chinese and Traditional Chinese. **28,426 variants (37.36%) have a usable guide or estimate.** This is a database readback, not an authenticated production API or phone acceptance result. **The complete release definition of done is not met.**

Observation: 2026-10-05 17:17:05 UTC. Production project: `oakdbbzdqwurpjnoqhmu`. Source baseline: `28cbcfc7d68eb11edc622078b0bbc3216810610f`. The [machine-readable receipt](pricing-classified-coverage-20261005.json) records publication IDs, migration aliases, function hashes, sample identities, original-provider references and limits.

| State | Variants | Published denominator |
| --- | ---: | ---: |
| Exact price | 0 | 0.00% |
| Market guide | 7,335 | 9.64% |
| Estimated value | 21,091 | 27.72% |
| Price unavailable | 47,652 | 62.64% |
| Classified | 76,078 | 100.00% |

| Language | Published / classified | Exact | Guide | Estimated | Unavailable | Usable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| English | 33,359 / 33,359 | 0 | 5,315 | 14,563 | 13,481 | 59.59% |
| Japanese | 14,100 / 14,100 | 0 | 2,020 | 4,931 | 7,149 | 49.30% |
| Simplified Chinese | 20,453 / 20,453 | 0 | 0 | 0 | 20,453 | 0.00% |
| Traditional Chinese | 8,166 / 8,166 | 0 | 0 | 1,597 | 6,569 | 19.56% |

Korean remains excluded under the existing owner instruction. The denominator includes all latest published memberships, including **48 invalid/retired/conflicting Simplified Chinese memberships** omitted by the earlier physical-only denominator of 76,030. Those 48 are explicitly unavailable; no catalogue identity was repaired or retired by this change.

The earlier 43.45% positive-general-guide figure used weaker Cardmarket printing availability and a physical-only denominator. The stricter result above rejects blended evidence for valuable, rare or special variants. It does not erase the older source records or reclassify their original provenance.

## Evidence and providers

| Resolved evidence | Variants | Interpretation |
| --- | ---: | --- |
| Exact variant market | 25,822 | Matching printing, language and finish; provider market aggregate with unspecified raw condition |
| Same-language printing market | 437 | Explicitly weaker basic-finish guide/cheap estimate, restricted below £20 |
| Reviewed blended printing market | 2,167 | Only ordinary common/uncommon Normal variants with market evidence below £2 |
| No accepted evidence | 47,652 | Explicit unavailable record |

TCGCSV supplies **26,259** usable values and Cardmarket public guides supply **2,167**. The other **47,652** have no selected provider.

“Exact variant market” is an evidence scope, **not** an EXACT PRICE classification. These feeds do not prove the condition of an owned copy or an individually completed sale. Their exact condition-aware price count is therefore zero. Existing exact-condition and graded readers remain separate; historical quotes and maps are retained.

The raw general assumption is `raw_market_unspecified`: a typical provider raw-market aggregate whose individual condition distribution is unknown. It is never renamed near mint, applied to every condition, or mixed with graded prices. Confidence scores are policy heuristics, not calibrated accuracy probabilities. General guides remain ineligible for exact holdings valuation; **37.36% describes the requested catalogue usable-tier metric, not measured Home/owned-collection coverage**.

## Unavailable reasons

| Reason | Variants |
| --- | ---: |
| Unsupported provider language | 24,535 |
| Unresolved provider identity | 14,604 |
| Blended language/finish/condition evidence insufficient | 4,683 |
| No provider quote | 2,899 |
| Unsupported provider finish | 723 |
| Stronger variant evidence required | 160 |
| Invalid published identity | 48 |

“Unsupported provider language” describes the current TCGCSV outcome, not a claim that the card has no market. Simplified Chinese was fully processed. No Chinese quote was borrowed from Japanese, English or Traditional Chinese.

The existing approved PikaQian adapter is metadata-only and has no retained price feed/base URL. The TCGdex Simplified Chinese metadata investigation does not establish Simplified Chinese price identity: some identifiers resolve to Traditional Chinese. Both remain unavailable rather than fabricated.

Additional legitimate sources were investigated against official contracts:
- [CardTrader](https://www.cardtrader.com/it/docs/api/full/reference): server bearer credential missing.
- [PriceCharting](https://www.pricecharting.com/api-documentation): API entitlement/token missing.
- [eBay Marketplace Insights](https://edp.ebay.com/api-docs/buy/marketplace-insights/resources/methods): limited-release sold evidence; no permitted active sold lane. The existing Browse adapter supplies asking prices, and has no proven successful runtime read for this cohort.

No subscription was purchased, provider restrictions bypassed, dormant sold adapter enabled or approval ledger changed.

The largest Japanese samples include exact set/collector matches with several materially different provider products. SV2a collector 001 has ordinary Bulbasaur, Poké Ball Pattern and Master Ball Pattern products. The retained USD market signals are 0.22, 1.94 and 43.75 respectively. Existing uniqueness safeguards correctly quarantine these ambiguous product matches. No generic title stripping or pattern-price substitution was introduced. The source register and finite mapping backlog remain open; unavailable is a truthful current decision, not a claim that all future mapping work is impossible.

## Valuable-card QA

| Minimum GBP value | Production values checked | Identity / dated-FX consistency passed |
| --- | ---: | ---: |
| £20 | 2,111 | 2,111 |
| £50 | 945 | 945 |
| £100 | 439 | 439 |
| £500 | 39 | 39 |
| £1,000 | 8 | 8 |

The thresholds overlap. All qualifying values have direct variant-market evidence, matching language/finish and printing/set IDs, positive original values, attributed dated FX and consistent conversions. No £20+ value inherits a printing-level or cheap-card estimate. Twenty-five retained-provider samples additionally cover five non-overlapping value bands. Examples include Aquapolis Lugia Holo (£3,408.90), Skyridge Charizard Reverse Holo (£2,272.59), and Japanese modern/vintage controls.

This establishes source consistency and protects against inappropriate fallback. It does **not** independently validate sale transactions, condition, accepted offers or the provider's underlying market methodology. £100+ API responses are flagged `high_value_single_provider` and `raw_condition_unspecified`. Multiple independently entitled market signals remain an external provider dependency.

## Implementation and actual execution

Three additive forward migrations create a private current classification store, append-only change history, a value-sensitive policy, bounded classification writes and a 100-variant bulk reader. Existing provider maps/quotes are read without modifications. The resolver rounds cheap evidence to 10p bands, retains original observations and source/retrieval/FX dates, selects the strongest allowed evidence, and produces explicit unavailable reasons.

Staging was classified first (75,558 memberships). Production then stored every one of its 76,078 memberships in bounded batches. Production and staging independently read back identical hashes/configuration for all five functions. All are SECURITY INVOKER with an empty search path and service-only execute permission. Anonymous/authenticated users cannot read the new tables/functions directly. RLS is enabled. The production security advisor returned no notice referencing these new classification objects.

Production readback found **0 invalid/null/zero usable amounts**, **0 stored identity mismatches**, and **76,078 initial history records**. Eighteen service-RPC samples cover every populated class/language combination. No exact-class sample exists because its count is zero. Repeated unchanged classifications do not duplicate history; original provider observations remain retained. `checkedAt` is the last persisted classification check, not a fresh provider-fetch timestamp.

The general catalogue API now has a source implementation that reads resolved classifications in bulk. Deliberate unavailable decisions override older weaker general quotes. The exact-condition/graded paths stay separate. Client labels distinguish the four classes and retain stale/provider attribution. General-cache scopes identify unspecified raw condition.

Both existing ingestion workers have source hooks to classify retained evidence after ingestion, including a provider failure. Disabled workers and offline fixtures cannot trigger this write hook. The classifier checks monotonically advancing bounded cursors, unchanged publication IDs and an exact complete denominator before reporting success.

These worker hooks and API/client changes are **not yet deployed**. The production classification is a measured snapshot; continuous classification of future publications requires shipping the hooks.

## Validation and delivery status

Passed local checks:
- `npm run typecheck`, `npm run typecheck:backend`, `npm run lint -- --no-cache` (nine existing warnings).
- `npm run test:pricing-classified`: 39 PostgreSQL policy cases plus persistence/history, stale outage retention, new publication, access boundaries, authoritative API selection, 100/100/1 bulk paging, disabled worker and offline fixture checks.
- `npm run test:catalogue-price-cache`, `npm run test:pricing-v2`, `npm run test:personal-pricing`, `npm run test:collection-pricing-ui`.
- Backend unit suite: 46/46.
- Generated API contract matches; 41/41 operations retain route coverage.

Fixtures cover English commons/Holo/Reverse Holo/vintage, Japanese identities, both Chinese languages, promos/special editions, £20–£1,000+ raw values, graded separation, missing sources, unsupported finishes, provider outages, stale values and newly published identities. The app price overlay already isolates price-request failures from card rendering; collection/cache regressions verify this separation. These are fixture checks, not handset acceptance.

| Layer | Actual observation |
| --- | --- |
| Production database | Applied, full classified readback passed at 17:17:05 UTC |
| Source integration | Isolated change prepared on the existing PR312 baseline; not merged |
| Production backend | Still source `28cbcfc7d68e`, deployment `e985732a-4ebe-4281-8811-963a61276a58` |
| Backend health / public catalogue | HTTP 200; correct production Supabase target and language list |
| Direct private pricing origin | HTTP 401 `gateway_origin_auth_required` |
| Public gateway pricing | HTTP 401 `authentication_required`; authenticated prices not verified |
| Existing owner browser session | None in the connected browser inventory |
| Native/OTA delivery | New labels remain source-only; no publication attempted |
| Representative phone retrieval | Not verified |

The complete request is blocked on an owner-authenticated production session, the reviewed backend/worker release and compatible app delivery/device acceptance. The repository's explicit deployment-approval rule and protected release path are retained. No token was manufactured and owner authentication was not weakened.

Rollback of API/worker source can retain the additive database tables and history. Do not remove original provider maps/observations or rewrite applied migrations. Canonical migration filenames use production ledger versions; staging assigned different timestamps to the same named bodies, recorded in the JSON receipt. Any later automated migration push must reconcile those known aliases rather than replay the CREATE statements blindly.

