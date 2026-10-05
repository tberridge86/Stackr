# Card-price recovery — 5 October 2026

**4,174 additional provider quotes were stored in production and independently read back.** This receipt records the recovery after the 17:17 classified-coverage snapshot.

Observation: **2026-10-05T21:12:14.760913+00:00**. **76,078 / 76,078 classified (100.00%)**. **33,677 usable variants (44.27%)**, compared with 28,426 (37.36%) in the original readback. The observed gain is 5,251; the live worker also refreshed existing evidence during this period. The 4,174 recovered quotes directly changed 3,975 previously unavailable variants to a usable class and strengthened evidence for another 199.

| State | Variants | Published denominator |
| --- | ---: | ---: |
| Exact price | 0 | 0.00% |
| Market guide | 9,822 | 12.91% |
| Estimated value | 23,855 | 31.36% |
| Price unavailable | 42,401 | 55.73% |

| Language | Published / classified | Guide | Estimated | Unavailable | Usable |
| --- | ---: | ---: | ---: | ---: | ---: |
| en | 33,359 / 33,359 | 7,750 | 17,232 | 8,377 | 74.89% |
| ja | 14,100 / 14,100 | 2,072 | 5,026 | 7,002 | 50.34% |
| zh-cn | 20,453 / 20,453 | 0 | 0 | 20,453 | 0.00% |
| zh-tw | 8,166 / 8,166 | 0 | 1,597 | 6,569 | 19.56% |

Of **20,066 commons**, **9,709 have estimated values** (previously 8,669), **1,665 have market guides**, and **8,692 remain unavailable**. No common received a blanket nominal price. The historical fallback contributed 70 usable estimates overall: 63 TCGdex/Cardmarket and seven TCGdex/TCGplayer observations.

The full refresh acknowledged 77 monotonic pages and 76,078 memberships with unchanged publication IDs. One transport failure was resumed from its last acknowledged cursor. A final incremental reconciliation updated 109 records whose source quotes had advanced during the scan; zero differing source records remained at that readback.

Production QA found zero invalid usable amounts, zero stored identity mismatches and zero weak £20+ values. All 2,756 £20+ resolved source records passed native-price/GBP-conversion and variant/language/finish consistency checks. History now contains 98,830 append-only observations for all 76,078 variants. Twenty-one bulk-reader samples cover all populated language/class combinations plus recovered commons, expensive raw cards and stale historical estimates. The prepared source reader accepted all 21; authenticated HTTP and handset acceptance remain unverified.

The [JSON receipt](pricing-recovery-20261005.json) contains source/FX dates, cohort hash, group acknowledgements, transitions, full unavailable reasons, provider/evidence counts, migration aliases and function hashes.

## What was recovered

The current TCGCSV feed contained titles such as `Eiscue - 048/193` and `Blaine (17)`, while the catalogue stored the underlying name. The exact-name matcher rejected these. The recovery accepts only a terminal numeric listing label when the label, retained provider collector number, canonical collector number, English set/group and requested basic finish all agree. Both the printing and provider product must be unique. Existing mappings, presales, editions, stamps, patterns and alternate languages are excluded.

Complete feeds and catalogue candidates were inspected for 109 groups, including the initial SV02 recovery. Positive quotes were stored for 93 groups. All 4,174 new durable maps passed the existing review and price-storage contracts. The transactions rejected pre-existing maps and rolled back quotes from a changed provider build. Two rejected batches were rebuilt from the updated feed. Their rejected rows do not contribute to the stored count. The supplied cohort planner is offline; the existing pricing worker can refresh these durable maps on later runs.

The provider published its next build during this run: 2026-10-04 20:05:38 UTC advanced to 2026-10-05 20:05:57 UTC. The final batches read the group again immediately before writing and used the ECB USD/GBP rate dated 5 October (0.756158514816137). Early batches used the independently fetched 2 October rate; the existing worker continued refreshing those maps. Each stored quote preserves its actual provider and FX timestamps.

## Historical cheap estimates

A separate fallback uses only identity-bound, shared TCGdex observations with an actual central market signal and a retained GBP value below £2. English/Japanese card, printing, set, collector, raw product, finish metadata and provider payload identities must agree. Ordinary finishes only; no graded or condition-specific valuations. Values are rounded to 10p bands.

Stored FX conversion dates were absent in these historical observations. This remains explicit as `retained_conversion_without_rate_timestamp`, low confidence (0.55), `retained_fx_unverified` in the source reader, and the original stale dates. A low asking price alone cannot establish a cheap card; native GBP signals of £2 or more and USD/EUR central signals of 3 or more block this fallback.

The latest valid identity-bound observation is selected before applying the cheap-value limit. A newer incomplete observation cannot erase a valid old quote. A newer valid valuable observation blocks an older cheap estimate. Existing stronger classes and stronger-evidence-required decisions are preserved. Chinese observations remain excluded because their provider identities have not been validated.

The 332,267 unlabelled historical English snapshots retained from April–July are preserved, including the May data. They lack the identity/source/finish/conversion proof required by this recovery. Two public probes of the old PokémonTCG.io path failed today: `base1-61` timed out and `sv1-048` returned HTTP 500. These probes do not establish a permanent provider outage.

## Verification and remaining delivery

All 4,174 recovered records passed positive-value, language, printing/set/variant, provider product/finish and dated-FX conversion checks. At the recovery readback, the overlapping value thresholds included 646 at £20+, 296 at £50+, 143 at £100+, nine at £500+, and one at £1,000+. These checks establish source consistency, not completed-sale or individual-condition accuracy. Valuable quotes remain direct variant-market guides with a single-provider limitation.

The classification and recovery regressions, catalogue cache/provider suite, application/backend typechecks and lint passed; lint retains nine existing warnings. The history tests cover newer invalid and newer valuable snapshots, stale retention, stronger-evidence priority, Chinese identity exclusion, access boundaries and bulk 100/100/1 retrieval.

Four additive migrations were rehearsed in staging before production. Applied SQL bodies and function hashes match. All new functions are SECURITY INVOKER, use an empty search path and are executable only by the service role. Production filenames and staging aliases are recorded in the JSON receipt; reconcile aliases before any automated migration push.

Production backend health passed at 20:48:34 UTC on source `28cbcfc7d68e`, deployment `e985732a-4ebe-4281-8811-963a61276a58`. The public bulk price route returned HTTP 401 `authentication_required` at 20:49:11 UTC. No owner session is available for authenticated API or phone acceptance. No backend, worker, native or OTA release was deployed.

Remaining gaps include genuine missing/ambiguous provider identities, separately modelled vintage edition subtypes, Japanese pattern products and missing permitted Chinese price feeds. The later [PikaQian access check](pikaqian-pricing-access-20261005.md) confirmed a documented Simplified Chinese price API, but the saved key returned HTTP 403 `tier_required`; its working name export supplies no prices or exact printing/finish bindings. CardTrader access is not configured and PriceCharting entitlement is absent; eBay sold access remains a provider entitlement dependency. Unavailable counts are explicit, not hidden inside usable valuation coverage.

The full release definition of done remains unmet until the reviewed backend/worker/app changes are delivered and representative authenticated API and phone retrieval pass.
