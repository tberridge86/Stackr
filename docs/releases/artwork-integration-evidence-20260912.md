# Artwork integration evidence — 12 September 2026

## Scope

This note records what the client can display from the current source tree and
what the available evidence does **not** prove. It is a read-only integration
record: no catalogue records, image assets, provider settings, or remote jobs
were changed.

The requested scope is English, Japanese, Simplified Chinese (`zh-cn`) and
Traditional Chinese (`zh-tw`) historic card artwork and set marks. Card artwork
and standalone set logos are separate measures. A card face can be available
when its set does not have an independently verified logo, and a product image
is not evidence of either.

## Evidence status

| Region / measure | Evidence | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| English historic **standalone logos** | Source review recorded in task `6aa46e96-013c-83eb-b0e9-5db179e4b169` | 15 unique official logo graphics mapped to 30 relevant set codes after deduplication; five catalogue groupings were explicitly unresolved. | Full historic English logo coverage. The review rejected foreign-language wordmarks, package art, fabricated titles and unsupported parent substitutions. |
| Japanese **runtime set marks** | `lib/japaneseSetLogos.ts` and its bundled sources | The runtime has a curated Japanese lookup, language-scoped aliases, and narrow, named parent-mark mappings for selected extensions. | A count or proof that every historic Japanese set has a verified mark or card face. |
| Simplified Chinese **standalone logos** | Source review recorded in task `6aa47062-9da8-83eb-b10e-5e86a144859b` | Earlier material contains 103 product/pack/box pictures, 19 shared-family references, two low-resolution previews and five missing images across 129 entries. These are explicitly not approved as a standalone-logo library. | 124 verified logos, or complete `zh-cn` artwork/logos. Exact-logo downloads and verification were incomplete. |
| Traditional Chinese **standalone logos** | Source review recorded in task `6aa46fa5-abb8-83eb-90cd-9305f2fd5516` | A strict re-audit retained two of 83 requested entries as verified exact standalone logos. | Complete `zh-tw` logo coverage. Prior sheets mixed banners, package art, parent marks and generated title treatments, so they are not provenance for runtime artwork. |
| Production language catalogue | No current dated receipt was found in this integration pass. | Nothing about current live language or asset coverage. | Current English, Japanese, Simplified Chinese, or Traditional Chinese coverage. The July audit is historical and is not used as current evidence. |

## Published card-image census

The committed [12 September catalogue census](catalogue-continuity-audit-20260912.md)
contains more recent evidence than the individual logo acquisition tasks. Its
production database observation was **2026-09-12 14:08:15 UTC**, against baseline
`10e1f4c64735102136e0d4c9d730e1f8ee829ea5`. This task did not repeat that remote
query. The denominator is active published variants, not every official historic
printing, and usable image references do not establish successful phone rendering.

| Language | Usable card-image references / active variants | Missing references | Published set logos / active sets |
| --- | ---: | ---: | ---: |
| English | 31,211 / 33,168 (94.100%) | 1,957 | 141 / 217 |
| Japanese | 8,620 / 13,771 (62.595%) | 5,151 | 97 / 163 |
| Simplified Chinese | 19,431 / 20,408 (95.213%) | 977 | 0 / 136 |
| Traditional Chinese | 2,382 / 8,166 (29.170%) | 5,784 | 0 / 83 |

The census counts published database references; the earlier table describes
separate source-review/acquisition populations. Those denominators must not be
combined or mistaken for assets newly integrated by this task. Japanese active
sets with cards are 115/163 and English 215/217; existing published set shells
also prevent a complete card-list claim.

## Current client behaviour

- `StackrImage` uses stable, de-duplicated candidate keys. When an image fails,
  it advances to the next supplied candidate rather than retrying the same
  source. It retains controlled TCGdex attribution and cache restrictions.
- `EditionAwareCardImage` prefers an exact edition image from card data or the
  approved edition endpoint, then the supplied catalogue artwork. The
  constructed Scrydex URL is last, only for Unlimited, and does not prove an
  asset exists.
- Set displays use the language passed with the source record, gate provider
  marks through `enforceSetVisualRuntimePolicy`, and preserve a valid existing
  logo, symbol, or cover when available. The gate does not turn a card image
  into a set mark.
- The scan localiser can reject implausible four-corner geometry before a
  perspective correction is treated as confident. This improves capture
  guidance; it is not a recognition-accuracy or language-coverage claim.

## Release limitation

The app may display verified card artwork and the curated Japanese marks that
are present at runtime. It must not be described as having full historic
artwork or official standalone-logo coverage for all four requested regions.
Completeness requires a dated, exact-identity coverage report for cards and
for logos separately, each with asset provenance and a rendered client check.

## Focused checks

Run in this checkout on 12 September:

- `scripts/test-stackr-image-candidates.ts` passed: rendition fallback,
  de-duplication, cover priority, and candidate exhaustion.
- `npm run test:native-language-display` passed: native primary identity,
  reviewed English supplements, and translation fallbacks.
- `npm run test:provider-set-mark-runtime-policy` passed after the existing
  committed approval receipt was included in the sparse checkout and stale
  source assertions were reconciled with deferred binder artwork and cover
  priority. Default reads and deferred enrichment still request approved assets;
  the final rendering boundary still applies the same provider policy. No
  approval, runtime policy, catalogue asset, or image URL was changed.

The historical standalone Japanese-parent-logo and same-artwork-display
scripts are absent from this checkout and are not cited as validation.
