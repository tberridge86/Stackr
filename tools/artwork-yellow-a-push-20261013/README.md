# Frozen Yellow A alternate artwork batch

This route publishes exactly two inspected English alternate fronts from EN-CARDS-038, queue **STACKR-EN-FRONTS-20261013-ALT002**. Local validation is complete; production publication and API verification belong to the release owner.

| Canonical identity retained | Exact provider front | Observed footer | Observed underlying expansion |
| --- | --- | --- | --- |
| xya / 92a / Trainers’ Mail | Scrydex xy6-92a | 92a/108 | Roaring Skies |
| xya / 107a / Professor Sycamore | Scrydex xy9-107a | 107a/122 | BREAKpoint |

Both original PNGs are 734×1024, show the yellow A mark and lettered footer, and have directly observed ©2017 copyright. The provider’s parent-expansion grouping does not change Stackr’s canonical xya grouping. A parent release year cannot establish the printing year. Ordinary unsuffixed fronts and stamped alternatives fail the guards.

The source specialist inspected both whole originals; the release owner separately reopened them. The frozen source handoff records the marker, suffix, parent-set/rarity symbols, readable body and frame. Full pixel-observation hashes retain the supplied observations. Trainers’ Mail keeps its canonical curly apostrophe, source straight-apostrophe alias and actual printed “except for” wording. The provider’s omission of “for” remains a source transcription note; catalogue metadata is unchanged.

The public plan retains the provider-parent crosswalk, printed number, source name alias and a hash of previously collected TCGdex xya metadata. These establish identity evidence, without certifying a distribution product, physical foil/material or an independently issued vendor licence. The finite owner decision permits storing, resizing and displaying these exact fronts. Source-wide approval is false; the existing inactive, under_review Scrydex policy remains unchanged. The 19 earlier unresolved artwork holds remain outside this cohort.

## Frozen evidence

- Plan: `bcc86498342436261c52c7d9dafdeac6b8cb110b039183b85c8aefd597b66832`
- Owner decision: `ff7eabd3a9d87d051e6fcba76e34adb7e1881bc4e13f6ba72e89bccf71fb268c`
- Identity table: `920c7867fa8ed59488f72d5c9446e504024fb160ce578b0898ce6fa2fce9f075`
- Public source manifest: `4af5f1c029bc07dd4b1e2ee9e912d7ae8ebe216af00b989e077d3bc9101289f7`
- Inspected handoff: `df6995add5dca9a7172051f5f899ccf8fcd5b4fb27183e13d934d27ea31e4067`
- Release asset **638504756**, 1,250,882 bytes, SHA-256 `da73a211f009a3ee5f3bb61bbcccdc765744c66159c0480aca9c9301ac2cc21c`

The archive contains exactly 11 members: two unique originals, six unique display WebPs and three public-safe metadata files. All eight image references have distinct immutable paths. Derivatives are 240×335, 96×134 and 720×1004; none enlarges its original.

## Local checks

Run from the repository root:

```powershell
node --test tools/artwork-yellow-a-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-yellow-a-push-20261013/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-yellow-a-push-20261013/download-package.py <private-packages> --archive <frozen-local-zip>
node tools/artwork-yellow-a-push-20261013/verify-packages.mjs <private-packages>
```

Passed: 42 Node tests (17 alternate tests, 15 staging-fixture tests and 10 accepted preservation tests), three Python archive tests and one offline persisted-failure journal test. Five additional offline transaction checks used the exact private staging rows and proved full rollback. The actual frozen ZIP was extracted and all eight images fully decoded with exact hashes, sizes and dimensions. The new workflow parsed and passed eight protected guard groups. All 11 reused dependency hashes match the previously accepted implementation; validation.json records the owned file hashes.

The offline freeze helper accepts only the pinned source manifest and inspected handoff. It compares their actual observations with the exact saved identities and private current binding snapshots. It writes only this tool folder’s frozen plan, identity table, approval, read-only evidence query and hash constants. Raw before images and private source paths stay outside public artifacts.

## Publication and rollback

The workflow is manual, restricted to main and its exact revision, uses the protected production environment and shares the non-cancelling production deployment lock. Confirmation is **PUBLISH ARTWORK YELLOW A**; runtime variables use **STACKR_ARTWORK_YELLOW_A_**. The GitHub token can only read the immutable release asset. Hosted artifact upload requires a successful secret scan and excludes raw private metadata.

The reused publisher checks every current printing, name, set, normal variant, catalogue version and existing scoped asset/link/source row. Staging rehearses with its one missing Scrydex fixture and rolls all changes back. Production cannot insert or activate a source; it only adds these immutable front assets and published-version links. Existing assets and set marks are preserved. Repeated publication is empty.

A successful publisher verifies the returned asset manifest and served bytes before preparing a rollback receipt. Rollback can hide only the exact new artwork rows after checking their printing, immutable asset ID, original hash and frozen cohort. Immutable objects, old assets, links, source policies, ownership and prices remain preserved. The rollback SQL is prepared evidence, not an automatic operation.

No live database or storage writes, workflow dispatches or Git operations were performed during this implementation. Publication remains pending release-owner integration and independent review.

## Retry after the staging rehearsal guard

Run 38483359973 failed before any upload or publication because staging already contains two older 320×446 variant pictures. Independent reads confirmed all 11 production and 13 staging rows, current bindings and source policies stayed exactly unchanged. The source originals, frozen cohort, owner decision and image package remain identical.

The retry adds a Yellow-A-only staging fixture. Within the existing serializable, always-rolled-back rehearsal, it verifies the complete fingerprints of those two known staged assets and temporarily hides only their public visibility. A fresh full database snapshot permits only these two flag changes and trigger timestamps; every other existing row and field must remain unchanged. The standard preservation guard then checks the new rehearsal assets and links. Its receipt records the temporary fixture explicitly, and rollback restores all original staging rows. The production guard uses the original path and applies no visibility fixture or replacement exception.

Fixture bytes: d04e674be1d85787e3e7ca36b944e48a531c3ba4e9b660c7b46e2d2015158ab0. The new tests reject missing, extra, changed-hash, wrong-variant and wrong-dimension assets, unrelated field changes, wrong environments and production fixture use. Offline checks also reject wrong transaction isolation and partial updates while proving rollback restores the complete retained baseline. No dependency or workflow changes were needed.
