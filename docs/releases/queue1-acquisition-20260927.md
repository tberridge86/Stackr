# Queue 1 English artwork: acquisition receipt — 27 September 2026

## Delivered layer

348 English printing-front image files were fetched, decoded and retained for review. They are NOT ingested catalogue assets, published API images or device-verified fixes. Source review is still required; no permissions were changed.

| Set | Exact target printings | Acquired and decoded | Published by this work |
| --- | ---: | ---: | ---: |
| Shining Legends / sm3.5 | 78 | 78 | 0 |
| Dragon Majesty / sm7.5 | 78 | 78 | 0 |
| Shining Fates Shiny Vault / swsh4.5sv | 122 | 122 | 0 |
| Crown Zenith Galarian Gallery / swsh12.5gg | 70 | 70 | 0 |
| Total | 348 | 348 | 0 |

The 348 identities were compared with the original Queue 1 catalogue snapshot using exact set/collector identifiers and limited Unicode/GX-EX typography normalization for names. All matched; no target was replaced by a provider-only variant. SV and GG prefixes and leading zeros are preserved. Live production and staging reads at the start of this work still showed no published image links / no set-linked image assets respectively for these groups. The source snapshot is NOT a substitute for a fresh binding lookup at ingestion time.

## Reproducible execution evidence

- Base main: `478b3a5bf1fc955f31119f03367efcf65a05fe47`.
- Acquisition revision: `497738138c1a6212e486fcc57e6d9f674d8b38ca`.
- Isolated branch: `agent/catalogue/queue1-acquisition-20260927`.
- Successful run: https://github.com/tberridge86/Stackr/actions/runs/36303082404 . Job 108574325404 completed successfully, including tests, acquisition and artifact upload.
- Acquisition receipt time: `2026-09-27T07:30:17.075146+00:00`.
- Artifact: `queue1-review-36303082404`, ID `10926700303`, 269,306,089 bytes; expires 11 October 2026 under the workflow's 14-day retention. The attachment delivered in ChatGPT is a separate retained handoff copy.
- Original artifact SHA-256: `b7a307717726c7b22cfeda5b3179dec5ec79f42c4bb9240aba8f56246d9b21b1`.
- Acquired images: 348 distinct hashes, 348 successful image decodes. Every image is 734 x 1024. Largest original: 1,429,371 bytes. Total original image bytes: 270,395,525.
- The downloaded artifact was independently checked locally: 348/348 receipt hashes matched the files, 348/348 images decoded and dimensions matched, zero duplicate image hashes, zero canonical set/collector duplicates.
- Eight locally assembled visual samples (first/last target in each group) were inspected for English card name and printed collector number. They matched. This is an 8-image optical sample, NOT optical verification of all 348, finish verification or app rendering.
- 22 focused offline guard tests passed locally. The corresponding GitHub test step also passed. Deployed script and test blob hashes match the locally tested files: `5dcd3a177b12e8db96089d2f3e0c94f6cb5f5f7c` and `b19c96bbab3ca685e523fbdd20150dd267e98780`.

## First-run defect corrected

Run 36302765345 stopped at the provider-census guard, before downloading images. The source dataset legitimately contains additional suffixed identities, so requiring its whole population to equal the 78-target catalogue population was incorrect. The corrected code keeps the same pinned provider blobs, selects only the frozen exact target numbers, and then checks the entire selected set's independent identity digest. Missing targets, changed names, duplicate numbers and mismatched IDs still block acquisition.

Provider-only records retained as out-of-scope evidence, not ingested or mapped onto base numbers:

- sm35: 10a Entei-GX; 68a Ultra Ball; 77a Zoroark-GX.
- sm75: 40a Altaria; 60a Fiery Flint.

This scoped-subset rule supersedes the original tools README's overly broad whole-provider-census wording. The target denominator remains 348, not 353.

## Source and staging gate

All 348 successful downloads used the actual image URLs recorded in the pinned PokemonTCG datasets. TCGdex was attempted first, but did not supply the selected image files. The selected source lane is `pokemon_tcg_api_review_only`.

A current read of canonical staging `lmwfhvexfcoyeuoyrlco` returned `ingest.sources.code = pokemon_tcg_api`, `licence_status = under_review`, `active = true`. The existing mirror script's allowed provider list does not include that lane. Therefore these files are not publication eligible, and no registry flag, provider allowlist, rights field or kill switch was modified. Reconcile existing applicable source-approval evidence through the established process before creating public catalogue assets; do not relabel these files as TCGdex or mark a source approved to make an importer pass.

The original attached manifest had blank finish fields on these four groups. Live catalogue reads confirmed normal/normal for the two Sun & Moon groups and holo/holo for the two gallery/vault groups. The handoff was corrected, not the database. Files remain printing-front references; `exact_finish_verified` is false. Do not treat a generic card-front image as proof of a physical finish.

## Next bounded ingestion action

Reuse the acquired images and per-card receipts; do not repeat internet discovery or re-download the 348 originals. Read `receipts.json`, `source_data/`, and the handoff's `ingestion_manifest.json` / CSV. Confirm the archive and image hashes before use.

Resolve staging IDs from the current exact game/language/set/collector/variant identity. First/last samples from all four sets were independently resolved in staging, but all 348 still need a fresh complete binding export. Production UUID references are not a permission to transplant IDs. Recheck current working images and preserve them.

After the source gate is legitimately resolved, use the existing Stackr asset pipeline and storage adapter. Produce its native card-grid/search-result/detail-page derivatives (240/96/720 widths), keep SHA-256 provenance and deduplication, and attach printing-level fronts unless exact variant use is evidenced. Save before/after and rollback receipts; verify staging API identity, image delivery and decoding. Hand production promotion to the existing release owner. Installed app rendering remains a separate acceptance step.

The acquisition branch has no database or storage credentials; its workflow cannot ingest, publish or deploy. No main, pricing, ownership, metadata, source permissions, existing workers, production data, native release or device state was changed. The two protected Supreme Victors cases were untouched. Do not run broad catalogue imports or restart paused reporting automations.

## Remaining Queue 1 scope

- 120 Pitch Black / PBL targets: original source dataset me5 identified, not acquired by this run; finish metadata remains unresolved.
- 88 numbered MEP promos: source resolution and acquisition remain.
- 1 mep/Museum record: exact promo identity remains on hold.
- 131 B2a Paldean Wonders records: held outside physical ingestion because this is Pocket scope; records were not deleted or silently reclassified.

Thus 348 of the 557 non-Pocket candidates have acquired review files, with 209 not yet acquired. All 557 remain unproved at the published/app layer. Do not subtract 348 from the live missing-image deficit until approved assets are actually ingested and verified through the application-facing API.
