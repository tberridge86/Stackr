# High-resolution artwork selection review

**Review time:** 2026-10-11
**Frozen comparison:** `fcf697bab7785c3ed87747ed1721e9c033818557`
**Reviewed paths:** `lib/cardArtworkPresentation.ts` and `scripts/test-master-set-artwork.ts` only.
**Scope:** source-level selection of existing approved card-art renditions. No asset acquisition, catalogue mutation, public request, deployment, native build, or device test was performed.

## Decision

**Accept the scoped source change.** It changes only which already-approved rendition becomes the preferred `large` candidate for an eligible asset:

1. a `detail-page`/`detail`/`large` rendition with a known long edge of at least 1,000 pixels;
2. otherwise the existing original only when its known long edge is at least 1,000 pixels;
3. otherwise the existing detail rendition.

Grid selection remains unchanged, and the former detail/original candidates remain in the ordered retry list.

## Safety review

| Concern | Evidence | Result |
| --- | --- | --- |
| Exact printing, language, set and finish | Selection remains after the existing approved asset, game, set, card, same-artwork and `canShareFace` checks. The patch does not alter variant IDs, asset IDs, rank or `exact`/`shared` classification. | Preserved. |
| Special finishes and same-artwork references | The absent-sibling explicit-reference gate and protected special-finish conditions are untouched. The new choice operates only on rendition URLs from an already accepted asset. | Preserved. |
| URL/policy safety | Every chosen derivative and original still passes `publicUrl`, which applies the existing runtime image policy. An unsafe or unavailable high-resolution URL cannot become preferred; normal fallback selection continues. | Preserved. |
| Known versus invented resolution | A derivative qualifies only with finite, positive width and height and long edge ≥1,000. The original uses the same finite/positive requirement. Unknown, zero, negative and infinite metadata cannot be promoted as high resolution. | Preserved. |
| Fallback/recovery order | `urls` now contains de-duplicated `small`, preferred `large`, normal `detail`, and `original`; a successful smaller detail rendition remains available after a high-resolution original. Existing one-time candidate retry handling remains unchanged. | Preserved. |
| Duplicate derivative roles | The public card-image eligibility path requires exactly one record for each required derivative role (`backend/lib/stackrApiV1.js:390-395`), so duplicate `detail-page` records are withheld before normal public card delivery. The selector’s first-match behaviour is therefore not a new public-path ambiguity. | Safe for the reviewed public contract. |

## Test evidence

All checks passed at the reviewed working tree.

| Check | Evidence established |
| --- | --- |
| `npm run test:master-set-artwork` | New high-resolution cases plus five-language same-artwork, identity/permission conflicts, protected finishes, candidate recovery and image selection suites passed. The expected simulated write-failure log in the ownership test is part of that test’s assertion; the command exited successfully. |
| `scripts/test-issue304-artwork-delivery.ts` | Exact-printing rendition choice, CoroCoro separation and large-artwork delivery constraints remain intact. |
| `scripts/test-stackr-api-v1.mjs` | API manifest identity/pagination and delivery contract regression passed. |
| Static comparison with frozen baseline | Only preference selection and its focused test cases changed in the two reviewed paths. |

The new focused test proves all of the following source states:

- a 1,200-pixel original is chosen before an 825-pixel detail rendition while `card-grid` remains the small image;
- a qualifying 1,050-pixel detail rendition takes precedence over the original;
- source-limited and unknown-resolution assets retain the former detail behaviour;
- infinite dimension metadata is not treated as qualifying;
- the input card, printing, finish, source records and dimensions remain unchanged.

## Limits

- Asset dimensions are trusted as existing delivery metadata for candidate ordering only. This review did not decode bytes or establish that a stated dimension matches the actual image.
- The 1,000-pixel condition is a source-level preference rule, not whole-catalogue coverage evidence. No denominator, language coverage, real card cohort, device pixel density, visible crop/blur check, or installed-iPhone result was measured.
- The separate original/detail candidate URLs remain subject to runtime availability and image decoding. The retry list provides fallback behaviour; it does not prove any network response in this review.

## Handoff

The change is fit to retain as a narrow presentation improvement. Before claiming the target met, measure a declared multilingual printing cohort from actual API response through decoded detail image and reference-iPhone rendering, reporting images that are source-limited or lack verified dimensions separately.
