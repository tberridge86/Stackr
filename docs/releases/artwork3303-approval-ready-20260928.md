# Recovered artwork: ready for owner approval

The lost-package recovery milestone is complete: **3,303 card fronts and 9,909 derivatives**, covering **85 sets**. All 13,212 image files have been independently read, decoded and checked against frozen hashes, dimensions and formats. **Zero fronts from this recovery have been published to production.**

| Source | Fronts | Derivatives |
| --- | ---: | ---: |
| Official Japanese | 2,065 | 6,195 |
| PokeData Japanese | 333 | 999 |
| English Pokémon TCG API | 424 | 1,272 |
| Existing Taiwanese TCGdex package | 116 | 348 |
| Existing official Taiwanese package | 365 | 1,095 |
| Total | 3,303 | 9,909 |

The files are preserved in [11 downloadable GitHub archives with checksums](artwork3303-downloads-20260928.md). The assembled package passed [the full file check](https://github.com/tberridge86/Stackr/actions/runs/36479094244); its [verification receipt is downloadable](https://github.com/tberridge86/Stackr/actions/runs/36479094244/artifacts/10997050110). Archive retention expires on 27 December 2026.

## Checks completed

- All 3,303 printing identities match production and staging, across 3,550 variant rows. Native name, language, set UUID, collector number and published catalogue version were checked. Staging has its own Japanese version and three observed set-code aliases; card records were preserved.
- Existing assets were checked before preparing publication. Six unavailable English provider references exist in production; none appears in the public asset manifest. They will remain intact. Staging also has older non-manifest assets; these were preserved.
- The final frozen plan passed **34 actual staging database rehearsals covering 3,303 fronts**. Each checked inserted assets, API visibility, duplicate prevention, and successful rollback. A final query confirmed zero rehearsal assets and zero temporary Taiwanese source records remained. No storage objects were uploaded.
- PokeData's 333 original files were labelled WebP by the provider but decode as JPEG. The publication plan now uses the detected JPEG type and matching object extension. All original bytes and original source declarations are retained.
- Eighteen Japanese cards received new visual identity review, with decisions bound to their exact image hashes. These decisions are saved separately from automatic name-anchor checks. Physical foil finish is not certified by a front image.
- The final implementation revision `5c47d9e69810d095e8fdae38d018fe1e8ca82fe4` passed standard CI, pricing identity regression and the assembled image-package check. The unrelated full release-candidate gate was skipped. This is preparation evidence, not a deployment or phone-rendering receipt.

Evidence: [catalogue preflight](artwork3303-catalogue-preflight-20260928.json), [final staging rehearsal](artwork3303-final-staging-rehearsal-20260928.json), [file verification](artwork3303-file-verification-20260928.json). The older rehearsal saved in the tool directory belongs to the earlier MIME-labelled plan and is superseded by the final rehearsal linked here.

## Owner decision

Approve publication of the frozen **3,303 fronts plus 9,909 derivatives**, and confirm that existing artwork permission covers **storing, resizing and displaying the 365 official Taiwanese fronts** in Stackr. Their saved source evidence still says `REVIEW_REQUIRED`; file verification alone does not resolve that permission entry. Existing English store/resize/display authorization and approved source records are retained.

The approval record is deliberately pending. No source-wide activation is proposed. Taiwanese source registration is an inactive provenance record; permission applies only to these 365 reviewed fronts.

Frozen cohort SHA-256: `d047cb0475f5b676f2ee6e3bdab27352a3d5cad4c462b41e9acbf368014ee259`.

## Publication after approval

Record the actual owner response against this hash, complete review of [PR #247](https://github.com/tberridge86/Stackr/pull/247), and merge through normal checks. Dispatch the existing protected `deploy-production.yml` workflow with release scope `artwork3303`, the exact resulting main revision, and all unrelated release flags false. Keep other identifiers blank.

The lane retrieves the immutable archives, rechecks every image locally, rehearses the executable publisher in staging and production with rollback, then uploads content-addressed objects without overwriting existing objects. Every public object is hash/decode checked before the asset/link transaction commits. It then verifies the public API manifest and unchanged card identities. Any different existing published artwork blocks the transaction for review.

The change only adds artwork assets, version links and the bounded Taiwanese provenance record. It does not change card metadata, holdings, binders, prices, variants, finish definitions, recognition approval, catalogue versions, the mobile build or source-wide activation.

Failures before commit roll back catalogue writes; uploaded immutable objects are retained for retry. The receipt records created versus reused objects, assets and links, and distinguishes unknown commit outcome from a confirmed commit. A post-commit rollback must first reconcile that receipt with live state, then remove only this release's newly created version links in a transaction. Preserve pre-existing links and all image bytes. Do not run broad asset deletion or roll back unrelated catalogue versions.

## Exceptions and remaining measurement

The [separate source-exception list](artwork3303-exceptions-20260928.md) records five Japanese identity conflicts, two undersized Japanese images and 50 unavailable English provider images. These 57 records are outside the recovered 3,303 and are not silently substituted or marked complete.

This closes the prepared-package recovery milestone. The earlier 12,161-item artwork audit included other source, reference and review categories; it was not a count of missing card metadata. Overall artwork/logo coverage, pricing completeness, installed build 47 and sub-0.5-second retrieval require their own current measurements. This upload does not claim those broader milestones are complete. After publication, measure the changed live API/image paths and obtain phone rendering evidence.
