# Normal-price source selection — 22 October 2026

Base source: `2172db553ef8cc717ac4a65872a7be163243ffdf`. Candidate is a source repair, not a production-delivery receipt. See [machine-readable evidence](owner-pricing-source-selection-20261022.json).

## Demonstrated break and bounded repair

The actual exact-owner refresh calls `fetchTcgdexNormalCardPrice`, which delegates normal cards to `summariseTcgdexNormalPricing`. Main preferred any English TCGplayer normal entry ahead of Cardmarket, irrespective of source age. Three public provider records were read between 08:15:29 and 08:15:36 UTC, with no provider refresh job or database mutation.

For English Wimpod `me04-025`, normal variant `0c9ac0ed-7491-436b-a461-febc4a45b2a5`, the captured response contains TCGplayer dated **14 October 22:55:13.910 UTC** and Cardmarket dated **21 October 22:54:33.026 UTC**. Replaying that same response against main selects £0.07 / TCGplayer; the candidate selects £0.03 / Cardmarket. The selected observation is almost seven days newer. This is one demonstrated affected identity, not a measured impact claim for every English card.

The repair chooses the newest usable normal observation from the existing permitted lanes. Equal timestamps retain TCGplayer priority. Nonpositive quotes, unsupported currencies and missing/invalid/future timestamps cannot displace usable observations. Future-time tolerance matches the service's existing five-minute limit. Language and normal availability restrictions remain; holo/reverse selection is unchanged. Original source, currency, timestamp and raw evidence remain attached. Existing static USD/GBP and EUR/GBP conversions remain unchanged: no live FX observation is claimed. Shipping remains unknown and these are provider estimates, not completed sales.

**Newer does not mean fresh:** at the database observation time both Wimpod observations exceed the existing six-hour expiry. No TTL, schedule, queue-success definition, cache policy or provider gate changes.

## Production baseline and controls

Read-only production project `oakdbbzdqwurpjnoqhmu`, **22 October 08:19:39.987324 UTC**: the same [339-ID frozen cohort](owner-pricing-cohort-20261021.json) has **327 positive stored quotes, 327 expired, 0 unexpired, 0 unknown expiry and 12 missing positive quotes**. It includes general base identities and is not a count of physical holdings or the whole catalogue.

Latest qualifying snapshots span 15 October 06:11:19.054 to 21 October 06:13:19.540 UTC. An unchanged snapshot does not prove a worker failed to execute. Current whole-owned eligibility, refresh fairness and older-card starvation are not remeasured.

Four exact controls were queried using latest-per-ID selection: Wimpod remains stored at the older TCGplayer observation; Japanese `S12a-113` and English holo `svp-051` have Cardmarket observations dated 20 October; variant `0ea904d5-a4d7-50e5-888e-f1ffe42e28be` has no qualifying positive snapshot. The two public control responses now contain 21 October Cardmarket observations. No saved identity, finish, history or provenance was edited.

## Separate runtime and app evidence

- Railway connector returned `UNAUTHORIZED`, requiring reconnection. Today's deployed identities, schedules and worker outcomes are unmeasured. Yesterday's recorded cron/deployment is a dated lead only.
- GitHub [Stackr Price Refresh 39741612834](https://github.com/tberridge86/Stackr/actions/runs/39741612834) is pending; two immediately preceding refresh runs in the inspected list were cancelled. [Owner Provider Price Refresh 39728571209](https://github.com/tberridge86/Stackr/actions/runs/39728571209) was skipped. These do not describe Railway outcomes; no job was dispatched.
- Source trace: the exact service persists provider time and expiry; `legacySnapshotEstimate` returns stale/source-timestamped estimates. `lib/collectionPricingApi.ts` requests `client.cardPrice` with identity/condition/GBP and retains freshness; `lib/collectionPricingState.ts` treats non-fresh values as stale. Authenticated API readback and actual screen/device display remain **not measured**, because no authorized owner session/device evidence was available. Source inspection is not end-to-end proof.

## Validation and release handoff

`node --test backend/test/tcgdex-normal-price-source.test.mjs`: main **4/7 pass, 3 fail**; candidate **7/7 pass**. Covers source age, ties, future/invalid time, amount/currency, supported languages, single-provider fallback and finish isolation. The test is included by the existing backend `test/*.test.mjs` glob. Independent pricing review found no blocking defect. The broader owner-refresh suite could not execute in this partial fixture because `dotenv` is absent; no pass is claimed. No TypeScript changed.

Release owner: run normal CI and the owner-refresh/service tests in the full checkout; confirm no competing API/worker release; promote the accepted source through existing backend and worker lanes. Reconnect Railway to establish actual deployed SHA and worker receipts. On the next authorized bounded refresh, check the exact Wimpod snapshot's source/time/amount, retain its honest stale label when appropriate, then read it through the authenticated owner API and app. Recheck Japanese and holo controls and the unavailable control. Capture real runtime source, provider time and device evidence separately. No schema, activation, paid provider or native/OTA change is required by this patch. Roll back the adapter commit through the existing release mechanism; retain all observed price history.

