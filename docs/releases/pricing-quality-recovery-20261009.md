# Pricing quality recovery — 9 October 2026

Implemented candidate only; not merged, deployed, refreshed, or verified on a phone. This correction belongs to coordinated release PR #323.

## Reproduced cause

The previous catalogue rarity/era baseline model v1 produced £0.25 when rarity was missing or unrecognised and fabricated broad category values for rare, holo, promo, and chase printings. A small age multiplier did not establish the value of an older card. This was a local source reproduction, not a claim that every low live price came from this fallback.

The general catalogue-read path could also replace a saved quote for the requested exact variant with a sibling finish or printing-level guide. It stripped verified sold provenance while wrapping selected exact quotes as general estimates. Both behaviours obscured the most specific existing evidence.

## Resulting policy

Retain the saved quote for the requested exact printing and variant, including language, raw near-mint GBP scope, original source, sold evidence when present, and stale status. General printing guides apply when that exact evidence is unavailable. This change does not invent a market value or fetch a provider per card.

The provisional model v2 applies only to recognised common/uncommon ordinary raw cards with valid known modern release metadata. The 2010 cutoff is a conservative eligibility rule, not evidence of monetary value. Rare, collectible, vintage, unknown metadata, and known special finishes/editions require provider evidence. The old universal £0.25 fallback is rejected, including cached v1 provisional rows. Existing genuine provider quotes remain usable.

The existing Cardmarket public-feed contract is a reviewed-printing blended general guide, with unknown language, finish, condition, and grade. It remains labelled as an estimate; it cannot certify a specific near-mint finish or an individual sale. The existing feed preserves EUR source amount and EUR-to-GBP conversion evidence and rejects the `low` asking floor. This correction does not activate or refresh that feed.

The TCGdex Cardmarket/TCGplayer adapters also treated a `low` asking floor as a market value when no market, mid, trend or average metric existed. The correction rejects a low-only quote, including legacy stored rows that contain only `tcg_low`. A supported market/average metric remains eligible and keeps the low asking floor separate as range data. A genuine stored market/mid amount remains usable with its separate low range. A prior adapter may already have copied an asking floor into a stored market column; those ambiguous values are not retroactively rewritten. A separately approved bounded refresh is required to replace them.

## Verification

Base revision: `a7bd32dda5cec52c6ea1d2722510cff0111c80d8`; the pricing follow-up is integrated in the head of PR #323 in `D:\Stackr-release-recovery-20261009`. Independent review found and resolved a Pokédex metadata regression, then confirmed no remaining actionable finding. The original dirty checkout was preserved; the interrupted managed C: file was recovered byte-for-byte from HEAD before relocating the candidate because C: was full.

Passed local checks, all exit 0:

- `scripts/test-server-catalogue-price-baseline.ts`: shared client/server v2 policy, unavailable metadata and finish/edition cases, exact/sold evidence preservation, bounded metadata reads.
- `scripts/test-catalogue-price-bulk-cache.ts`: requested exact stale quote retained ahead of a fresh sibling/printing guide, strict printing/variant/language scope, restart and stale retention.
- `scripts/test-catalogue-pricing.mjs`: supported normal/holo/reverse provider metrics, low-only rejection, Cardmarket ordinary/stamped identity; includes local stored-price-read PGlite fixtures.
- `scripts/test-market-pricing-service.mjs`: legacy low-only read rejection, genuine market/mid plus low range preservation, loopback HTTP routes and mocked provider behavior.
- `scripts/test-sold-provenance.mjs`: supported sold evidence remains separate from asking/market estimates.
- Client baseline, price-client and visible-set-window fixtures: retired v1 cache rows rejected, metadata-ineligible provisional quotes suppressed, nested selected variant metadata, real embedded/saved quotes and account/window behavior retained.
- The actual facts-only Pokédex shape omits set release dates: current server v2 estimates with verified publication metadata and matching language/printing/variant are retained, while mismatched identities, retired models and missing evidence remain blocked. Existing positive exact API prices take precedence over provisional estimates. The reviewer independently executed this hook fixture.
- `npm run typecheck`, `npm run typecheck:backend`, and `npm run lint`: no type errors, zero lint errors and eight pre-existing lint warnings.
- `git diff --check`: no whitespace errors.
- Final post-review production-profile iOS export and bundle guard passed: 3,364 modules, `entry-5d00f87098c215273d933452a07e10bf.hbc`, 11,589,132 bytes, SHA-256 `482a41c23602a30b7bee933366a5a0ca82fa21cfebb0f652b2ef845025169b3d`. Both v2/retired-cache code markers and all 33 recovered source assets were verified. This is an unsigned local export, not native or device delivery.

The PGlite cases use local in-memory fixtures; service requests use loopback and mocked providers. No live price response, old-rare cohort coverage, phone result, or deployment was measured.

## Remaining limitation

The existing legacy snapshot converter collapses a TCGdex/Cardmarket source into its TCGdex wrapper label and does not recover the underlying source/FX fields. Canonical estimate rows retain their full source breakdown. This focused correction preserves existing exact evidence but does not claim new provenance for those older wrapper snapshots.

The sale-preservation fixture exercises the catalogue reader with pass-through converters; it does not prove production conversion supplies individual last-sale evidence. This correction preserves that evidence when present and does not manufacture a last-sold claim from aggregate metrics.

Cards without a trustworthy reviewed mapping or supported exact quote remain explicitly unavailable. Complete valuation coverage is not proved by this local correction. No catalogue mutation, provider refresh, database operation, deployment, or mobile upload occurred.

## Identity research

Cardmarket lists separate printed products for Jungle Scyther [JU10](https://www.cardmarket.com/en/Pokemon/Products/Singles/Jungle/Scyther-V1-JU10) and [JU26](https://www.cardmarket.com/en/Pokemon/Products/Singles/Jungle/Scyther-V2-JU26), and Fossil Dragonite [FO4](https://www.cardmarket.com/en/Pokemon/Products/Singles/Fossil/Dragonite-V1-FO4) and [FO19](https://www.cardmarket.com/en/Pokemon/Products/Singles/Fossil/Dragonite-V2-FO19). Species/name alone cannot identify the monetary value. These pages support printing differences, not a current near-mint price claim or a feed import.

The 10 October [daily pricing follow-up](daily-pricing-readiness-20261009.md) extends this same candidate with provider freshness/checkpoint/rounding recovery, truthful coverage, exact client/server/gateway identity and supported verified-sale history. Its latest validation and unsigned local export supersede the earlier candidate export above; no live prices have been refreshed.
