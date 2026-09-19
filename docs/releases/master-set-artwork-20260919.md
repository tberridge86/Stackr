# Master Set artwork candidate — 19 September 2026

Implemented and locally tested in `agent/catalogue/master-set-artwork-20260919`, in `D:/Stackr-master-set-artwork-20260919`. This is an isolated candidate, not a released fix or phone acceptance. No catalogue records, schemas, images, prices, seller inventory, production data, release controls or delivery settings were written. The shared `D:/Stackr-1` checkout was left intact. No new images were sourced.

## Next production release queue

Queued on 19 September 2026 at the owner's explicit request: "make sure this is queued for the next production release". The matching draft pull request is the release-owner handoff, following the existing PR lifecycle process in [specialist ownership](../agents/README.md). Target the next coordinated production release; queueing does not authorize automatic merge, deployment, an OTA publication or a native build/submission.

- Tested implementation: `ebde3a865aa96830813812cdeeedc49d5a44f9f8`. Subsequent queue documentation does not change the implementation or extend its test evidence.
- Include the backend exact-original selection repair and the compatible client artwork/ownership changes together in release scope. Deliver the backend first through its existing lane, then the intended production client artifact. Confirm its actual runtime/channel rather than assuming an owner-only channel satisfies the production target. No schema, gateway, provider activation or catalogue write is required for this code change.
- Keep the PR draft until its exact-head CI/review and the existing release gates pass. Reconcile overlapping artwork/binder paths with the release owner's integration source; do not import the shared dirty checkout or replay older artwork branches wholesale.
- Resolve the 102 edition-crossing aliases or explicitly accept the disclosed 58 additional Base Set placeholders in release review. Retry the 186 failed source checks before claiming source coverage; the 59 confirmed absent faces remain a separate sourcing queue. No new artwork coverage is claimed by this candidate.
- Complete the installed-app acceptance below for images, finish eligibility, independent quantities, reload/mode toggles and unchanged notes/prices. Record the backend and client delivery identities separately. Automated fixtures and 30 image decodes are not device acceptance.

## Baseline and scope

- Repository: `tberridge86/Stackr`; protected `main` was `989da7d489d4e127ac80a8798a1bf67367942954` at checkout and implementation verification. No matching open artwork repair PR was found then. The later owner-requested draft release queue is recorded above; no merge or deployment is part of this handoff.
- Production backend health reported bundled source `92ba011b1442`, resolving to `92ba011b1442d5afa0c2bcb1b1189b61988a5ba0`, deployment `10613eca-a888-4ef0-af96-8dc1cc7d7d20`, production project `oakdbbzdqwurpjnoqhmu`. The candidate starts from current main; main and the running backend are different revisions.
- Public app API: `https://api.stackrtcg.com/v1`. The dated sample began at **2026-09-19 11:27:34 UTC**. Each page's API timestamp/request ID is retained in the local raw capture; its SHA-256, catalogue versions, cohort IDs and findings are in [summary.json](evidence/master-set-artwork-20260919/summary.json).
- Eight completely paginated sets, 26 card pages, **1,313 distinct printings / 2,240 canonical variants**. Two sets each in English, Japanese, Simplified Chinese and Traditional Chinese. Korean and the rest of each catalogue are unmeasured. Terminal pagination does not certify that every real-world printing has been catalogued.
- Installed app build, received OTA, device/OS and phone rendering were unavailable. They remain unverified. Current protected-main controls and release gates were preserved.

## Existing path and repair

The existing binder grid, horizontal finish slices, modal, Master Set preference, filter reset, long press, foil/tilt and haptics remain in `features/binder/BinderDetailScreen.tsx`. The slices continue to use the actual eligible finish keys from `lib/catalogueVariantPresentation.ts`; special finishes remain separate entries in that existing mechanism. `lib/masterSetProgress.ts` continues to count eligible canonical variants, independently of images. The initial add-card finish filter is already `any`, with the existing reset; it was not changed to non-holo.

Public facts and artwork still travel through `StackrApiClient`, `lib/stackrDomainAdapter.ts`, `lib/stackrPreferredSetArtwork.ts`, `EditionAwareCardImage` and `StackrImage`. No client database/provider lookup or per-variant artwork request was added.

The repair:

1. Retains all matching finish images when a page contains repeated printing rows. The previous last-row map could discard earlier images. The regression is reproduced with a multi-row fixture; it did **not** explain additional missing final images in this live sample.
2. Separates image selection from the canonical default finish. The adapter no longer switches the default variant to whichever finish has a picture. An approved face may be shared only among ordinary finishes of the same canonical printing, with consistent artwork identity when supplied. A stamp, special pattern, alternate illustration or edition cannot borrow an ordinary face. No equivalence is inferred from a name, collector number, filename or translation.
3. Prefers an exact variant's usable approved original or rendition before a shared face. The backend formerly required all rendition roles before preferring some exact images. Missing/broken grid and detail images now retain the supplied approved original in the client candidate chain. Candidates are deduplicated, tried once, and finish with an image placeholder. A changed image reference recovers while the component remains mounted.
4. Records presentation-only exact/shared provenance and source variant in existing `raw_data.presentation` metadata. Shared images show **“Reference image; finish may differ.”** in detail. Artwork refreshes and binder snapshots carry that provenance without changing ownership, canonical facts or prices.
5. Preserves existing ordinary copies on the first independent finish edit. Previously, selecting Reverse on an owned but not yet finish-managed card could hide the existing Base quantity. The existing `user_card_variants` action now preserves that baseline, rejects unavailable finish keys, and handles returned write errors. Existing row IDs, variant storage keys, notes, grades and price fields are retained. Master Set toggling still writes only the preference; it does not clear finish ownership. No persistence schema or endpoint was added.

## What the sample establishes

| Gap category | Dated finding | Candidate outcome |
| --- | --- | --- |
| A — technical renditions | 70 M5 Japanese approved original references have no grid/detail derivatives. | Originals remain usable; missing thumbnails are not new card faces. No renditions were regenerated. Exact-original priority and error fallback are regression tested. |
| B — finish photography | 303 ordinary variants already have approved same-printing shared-face links: EN Evolving Skies 133, JA SV2a 153, TW SV2a 17. | Reuses those faces and labels shared presentation. The fallback also handles a missing ordinary finish image without changing its identity. No new photographs or mappings are claimed. |
| C — associations | 102 Base Set aliases cross ordinary/first-edition distinctions. | Withheld from the new fallback and exported for mapping/marking review. Exact asset records are untouched. These are not automatically requests to source 102 new images. |
| D — absent faces | 245 printings lack a face in their complete public card responses: TW SV2a 187, TW SV1V 58. | All catalogue rows and finish eligibility remain. Exact-printing manifests confirmed 59 absent faces; 186 checks failed and remain pending. |
| E — display/delivery | 30 sampled image files fetched and decoded. Generic set-manifest lookup timed out; scoped manifest reads returned 59 successes and 186 failures (503/504). | Image availability is kept separate from catalogue membership and phone rendering. No installed-phone diagnosis is claimed from these reads. |

The 186 failed manifest reads cannot establish that no approved asset exists. They are excluded from manual sourcing. The probe now stops further manifest requests after a wholly failed batch rather than repeatedly calling an unhealthy endpoint.

## Before / after on the same cohort

“After” means replay through candidate code against the captured production responses, not a production deployment.

| Measure | Before | Candidate after |
| --- | ---: | ---: |
| Unique printings lacking any approved face in the published card response | 245 / 1,313 | 245 / 1,313 |
| Confirmed source-image needs after scoped manifest checks | 59 faces | 59 faces |
| Further no-face source checks blocked by manifest failures | 186 faces | 186 faces |
| Exact canonical variant-to-asset associations | 1,454 / 2,240 | 1,454 / 2,240 |
| Independently verified exact finish photographs | Not measured | Not measured |
| Safe ordinary variants using approved shared faces | 303 / 2,240 | 303 / 2,240, explicitly labelled |
| Edition-crossing shared aliases | 102 | 102 unresolved; no longer allowed as a fallback |
| Approved originals without a grid rendition | 70 | 70; usable originals retained |
| Broken image files among attempted probes | 0 / 30 | 0 / 30, same files |
| Native-device rendering checks | 0 | 0 |
| Browser visual rendering checks | 0 | 0 |
| Newly sourced images / generated rendition files | 0 / 0 | 0 / 0 |

**Material release limitation:** withholding those edition aliases adds **58 placeholders** for currently selected Base Set default variants in this replay. The other exact first-edition records still exist; no card/finish is removed. Preferred-path blank tiles therefore change from **245 to 303**, not to zero. This is an intentional refusal to display an unverified different edition, not an artwork-coverage gain. Resolve the mappings before claiming Base Set display closure. The new shared-face mechanism must not be reported as having filled genuinely absent faces.

| Language / set | Printings | Variants | No published face | Exact asset associations | Safe shared presentation | Unresolved edition aliases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| EN swsh7 | 237 | 370 | 0 | 237 | 133 | 0 |
| EN base1 | 102 | 204 | 0 | 102 | 0 | 102 |
| JA M5 | 118 | 118 | 0 | 118 | 0 | 0 |
| JA SV2a | 210 | 363 | 0 | 210 | 153 | 0 |
| ZH-CN cs6ac | 169 | 277 | 0 | 277 | 0 | 0 |
| ZH-CN 151c | 192 | 470 | 0 | 470 | 0 | 0 |
| ZH-TW SV2a | 207 | 360 | 187 | 20 | 17 | 0 |
| ZH-TW SV1V | 78 | 78 | 58 | 20 | 0 | 0 |

## Queues and evidence

- [Manual sourcing exceptions](evidence/master-set-artwork-20260919/manual-sourcing-exceptions.csv): **59 deduplicated printings**, representing 60 unresolved ordinary variants. Includes printing, variant and canonical IDs, language, set, collector number, distinctions and reason. TW SV2a Pikachu `025` needs one face for its normal/reverse entries, not two photographs.
- [Pending source checks](evidence/master-set-artwork-20260919/pending-source-checks.csv): **186 printings** excluded from sourcing until the existing approved assets can be checked.
- [Mapping review](evidence/master-set-artwork-20260919/mapping-review.csv): **102 edition-crossing aliases**, with exact source and target IDs.
- [Per-printing replay](evidence/master-set-artwork-20260919/coverage.csv), [image fetch/decode evidence](evidence/master-set-artwork-20260919/image-delivery.json), [validation receipt](evidence/master-set-artwork-20260919/validation.json), [changed files](evidence/master-set-artwork-20260919/changed-files.txt).

`scripts/probe-master-set-artwork.mjs` is read-only and bounded to the named sets. `--resume` retains completed set samples. `scripts/report-master-set-artwork.ts` replays the captured pages through baseline and candidate resolvers and exports the separate queues. `scripts/check-master-set-image-delivery.py` decodes the sampled public files without saving new catalogue images. Raw capture remains local in `.tmp/master-set-artwork/sample.json`; the committed summary records its hash and all failure identities.

## Validation and exact remaining checks

Passed: `npm run typecheck`, `npm run typecheck:backend`, `npm run lint` (12 pre-existing warnings), `npm run test:master-set-artwork`, `npm run test:binder-retrieval`, `npm run test:binder-catalogue`, `npm run test:english-set-visibility`, and `node scripts/test-stackr-api-v1.mjs`. A targeted lint pass over modified helpers/screen/tests also had no errors (13 existing warnings outside the normal app/components lint scope).

Focused tests cover Base+Reverse without Holo, holo-only, three eligible finishes sharing one face, exact finish priority, protected stamps/patterns/editions/illustrations, missing thumbnails with originals, genuine missing faces retaining slots, actual ownership handlers with reload and mode toggles, preserved IDs/quantities/notes/prices, rejected writes, partial-catalogue cache rejection, and actual `StackrImage` component candidate exhaustion/recovery. Fixture languages include EN, JA, ZH-CN and ZH-TW. All-three-finish behavior is fixture proof, not a coverage claim for every sampled set. The reopen suite includes real file-backed SQLite reopen/isolation/rollback. Component host doubles and desktop image decoding do not prove Expo/iOS rendering.

Before release:

1. Review this isolated candidate and the 102 edition mappings; resolve the latter with exact marking/edition evidence, or keep the disclosed placeholders. Retry the 186 failed source checks through the existing healthy API. Do not turn either queue into an indiscriminate image acquisition job.
2. Run protected PR/CI review for the exact candidate commit and reconcile it with release-owner main. No release freeze or gate was lifted here.
3. With separate release authorization, deploy the backend exact-original selection repair through the existing backend lane, then deliver the reviewed compatible owner mobile bundle/build through the existing release path. Record full backend, native/OTA/runtime/channel identities. No schema, gateway or catalogue deployment is required by this patch.
4. On the installed app, record device/OS, build and received update; check actual English/Japanese/Chinese grids and details, original fallback and placeholder recovery, Base/Reverse/Holo quantities after navigation/reload/off/on, unavailable finishes, special-variant access, notes/prices, deliberate filter/reset behavior, counts in both existing modes, long press, tilt and haptics. Include a missing face and an unresolved edition mapping. No existing owner data should be rewritten merely to obtain test evidence.

Rollback is a source revert plus the existing authorized backend/mobile rollback lanes. There is no catalogue or database migration to reverse. Legitimate collector finish quantities saved while using this candidate remain ordinary existing ownership records.
