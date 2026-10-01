**Latest artwork completion (October 1 record):** [72 Japanese fronts published and independently verified](artwork72-completion-20261001.md). Recovery total: **8,849 fronts / 26,547 derivative references / 35,329 distinct stored objects**. [Run 36811389122](https://github.com/tberridge86/Stackr/actions/runs/36811389122), source `9802dbc99082d3c9c4a8e5c4c3d81ac99e090347`, passed all **72 card and 288 image checks**. Its [receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36811389122/artifacts/11138779839) is independently checksum-verified. All ten recovery cohorts remain present. **889 of the owner's 4,201 cases are resolved; 3,312 remain**. Exactly 72 printing native names and their 72 native search-name rows were corrected atomically with artwork; other fields, aliases, variants, prices and holdings were preserved. Another **70 Japanese fronts and 210 derivatives are prepared offline** and need precise native-name corrections before protected publication. The **94 missing checklists**, logo, pricing and installed-device gates remain separate.

**Evening update:** [Railway restoration and measured live search/pricing delivery](railway-restored-20260930.md) supersedes this morning's Railway/deployment blockers. Historical measurements below are retained.

# October 1 release: progress and remaining work

Checkpoint: September 30, 2026, 07:38 UTC. This report separates published work, prepared work and unresolved delivery. It does not claim catalogue-wide 99% completeness or phone acceptance.

## Artwork

The earlier **7,911 fronts and 23,733 derivative references are published and verified**, with 30/30 live API checks. Their frozen cohort, existing files and associations are unchanged.

From the separate **4,250-case exception register**, **49 more English fronts and 147 derivatives are now prepared**: McDonald's 2014, 2015, 2017 and 2018 (12 each), plus Oddish SVP 102. The provider's generic card back for Tropical Tidal Wave HGSS18 was rejected. Each accepted front was visually compared with checksum-verified pinned metadata. Fronts identify a printing; they do not certify every foil finish.

The [downloadable verified artwork archive](https://github.com/tberridge86/Stackr/releases/tag/artwork-english49-review-20260930) preserves originals, derivatives, manifests, metadata and visual review sheets. ZIP SHA256: `ac6bb248dee86f9c83b68b25fd9a184470cc717a2a44220fa2c4a71d0adea3d5`. It was downloaded again, checksum-verified, safely extracted, and all 196 card objects were decoded and verified through the existing publisher validator. [Package receipt](english49-prepared-20260930.json).

Read-only checks in both databases found all 49 exact identities, no identity changes and no existing visible fronts or artwork references. [Preflight evidence](english49-read-only-preflight-20260930.json). The additional protected `english49` lane reuses the existing immutable transfer, staging/production transaction rehearsals, publication and public-byte verification. It does not replace an existing image or change metadata, prices, holdings or global source permissions. **This was the morning checkpoint; the batch is now published (see completion above).**

The saved [Scrydex permission record](../../catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json) explicitly limits itself to 89 MEP fronts and excludes other cohorts. At the morning checkpoint, the additional permission attestation was pending. The owner subsequently supplied it and explicitly requested publication. The earlier attestation is preserved. The [new frozen approval](../../tools/english49-publish-20260930/approval.json) was subsequently approved in PR261; publication and verification are now complete.

The 4,250-case frozen worklist now contains **49 published + 4,201 still unresolved**. The unresolved categories are 3,530 exact-source cases, 605 language-identity conflicts, 33 printed-denominator conflicts, 20 artwork choices, 5 identity conflicts, 2 resolution failures, 2 card-name conflicts, 2 composite reviews, 1 source-image conflict and the rejected HGSS18 front. Counts refer to the frozen worklist, not a whole-catalogue denominator.

## Missing sets and logos

Fresh readback confirms the same **94 set identities still have no published cards**. The [source review](checklist94-source-review-20260930.json) now classifies every one:

- 46 have matching-name checklist leads.
- 18 have likely name-alias leads requiring identity confirmation.
- 4 have different grouping boundaries: Diamond/Pearl Space-Time Creation, unnumbered Japanese promos, and the combined English Classic product.
- 1 is Delta Reign, listed for November 6 with no released checklist.
- 25 Traditional Chinese sets still lack a verified source in the checked indexes.

These are source leads, not completed imports. Full card checklists, languages, set membership, reprints and existing aliases must be reconciled before publication. Do not use a source's all-variant count as a printing total or copy one grouped checklist into two sets.

The [logo review](logo-source-review-20260930.json) identifies the remaining cases:

- Six Chinese Gym promo packs: all **72 listed cards already exist** in the published S-P promo catalogue. The supplied logos exist; exact pack grouping/display links remain. Do not create duplicate cards or apply six pack logos to the entire S-P set.
- Scarlet & Violet Energies: the supplied icon artwork exists; the source groups eight unnumbered energies. Its No. 001–008 labels are not verified printed collector numbers. Exact canonical group mapping remains.
- 30thD: the corresponding Espeon/Umbreon deck is listed as **30thDC**, with 40 numbered cards plus five unnumbered energies. The observed source symbol is only **25 × 14 pixels**; a usable logo/cover and exact alias reconciliation remain.

The earlier seven additive logo mappings (130 mapped images total) remain merged. Existing 81 CoroCoro cover checks remain intact; installed rendering is still a device check.

## Pricing, search and response times

The [fresh valuation replay](valuation-reconciliation-20260930.json) used the existing pricing implementation and live saved inputs, with no provider calls or writes. **204 Home/binder summary comparisons passed**, and the collection revision matches. General valuation is **£1,166.00 across 366 copies: 179 exact-priced, 181 general estimates and 6 unpriced**. Exact-only valuation is £123.10; the two valuation modes must not be conflated. All available quotes are older, with source timestamps on September 26.

The six unpriced copies are four graded cards, the unresolved Japanese `pokedata:57932` identity and one Chinese unsupported/unpublished variant. Three graded cards are explicitly unsupported; `sv10-193` also has an ambiguous saved identity. Raw-card estimates must not replace graded values. Card-detail UI and installed-device reconciliation remain unverified.

A further read-only trace narrows the Japanese case: preserved PokeData evidence identifies **S12a 254, Electric**. Production VSTAR Universe has **258 of its declared 262 printings**, with **251–254 absent from both the canonical printing table and published API**. This needs a bounded source-verified card import, exact finish reconciliation and provider-reference mapping before a price refresh can work. It is separate from the 94 entirely empty sets and the artwork-only worklist. The Chinese unresolved card is the published Scovillain 020/SV-P holo printing; its saved variant still requires reconciliation. [VSTAR evidence](vstar-unpriced-identity-20260930.json).

The R/WAT selected-set search fix is tested and merged in [PR259](https://github.com/tberridge86/Stackr/pull/259), source `2ef619c2f4b4761d7c4734c746d0d48192ca6af7`; 11 applicable CI checks passed. R identifies the English anniversary Mew; WAT identifies the Japanese basic Water Energy. [Deployment run 36680646429](https://github.com/tberridge86/Stackr/actions/runs/36680646429) failed before creating a new deployment: the first attempt returned 502, the one retry explicitly reported **Railway trial expired**. The live backend remains the earlier healthy deployment. No purchase or access-control change was made. [Deployment/worker evidence](backend-deployment-blocker-20260930.json).

Both configured pricing-worker services show failed last attempts, so refresh persistence is not verified. Fresh read-only provider checks returned **401 invalid credentials for Scrydex and PikaQian**. The owner must restore Railway deployment access and update provider secrets in service settings, not in chat. [Sanitized provider results](provider-access-20260930.json).

[Fresh response measurements](public-response-check-20260930.json) timed the complete decoded JSON body. English Mew detail took 2,800 ms first / 65 ms repeat; Japanese Water detail took 383 / 69 ms. Both had correct identities and image references. R still returned 400; WAT still omitted its target on the old live backend. Fast failures are not useful retrieval. Shared cache state was unknown; these are not phone or genuinely cold-cache measurements. Universal sub-0.5-second retrieval remains unproven.

## October 1 handoff

Keep the existing October 1 09:00 Europe/London normal production-profile TestFlight continuation. Do not start a duplicate build or alter its schedule. Before calling the release ready: restore backend/provider access, deploy and verify the reviewed backend and workers, complete the separate artwork approval/publication, resolve or explicitly retain catalogue exceptions, then build the exact reviewed app and verify Apple processing/availability.

Build 46 remains the last verified artifact. Installation, Home/binder/card-detail values, artwork/logos, haptics, gyro movement, reduced motion, camera and first/repeat screen timings still require the phone. Nothing here establishes a new TestFlight delivery or device pass.
