# Stackr October 1 release queue

**Current checkpoint, 29 September:** reviewed source changes are merged; stored metadata delivery through the Stackr API is live and verified. The 7,911-front artwork run is in progress. The October 1 normal TestFlight continuation is scheduled for 09:00 UK time; no new native build or public App Store release has been made. Remaining source/checklist exceptions, pricing-server delivery and physical-device verification remain open.

Owner request, 29 September: queue and push the completed metadata, artwork, set-name and associated fixes together for the next release on 1 October 2026. Continue the normal production-profile TestFlight audience; do not dispatch the workflow's default owner-recognition profile. Public App Store release is not part of this request.

## Included source and data

The release starts from main `ed80419c7ee5d05926c899d6d98a76df91e1ebdd`, including merged PRs #210 through #247 and their intervening fixes. Native delivery must use the final reviewed merged main revision, not build 46's source or an older frozen workflow selection.

| Area | Included state | Delivery evidence still required |
|---|---|---|
| Signed-off metadata and set names | Original workbook, canonical reference mappings, source intake and production promotion evidence are now in this release branch. All 677 canonical set/product operations still exist in production; 675 match their recorded metadata, and the two anniversary totals were subsequently filled by the reviewed 480-card publication. | Read representative public set identities again at release. Do not rerun the historical import SQL. |
| Existing published set corrections | Production import changed 283 English display names, 70 native names, 63 precise dates, 12 printed totals and 121 numbered totals while preserving operational IDs/codes. | Confirm those API names in the new app. |
| New set records | All 102 new canonical sets remain present; 8 now have published cards, including the English/Japanese anniversary and Japanese Storm Emeralda sets. | The other 94 have zero canonical cards and remain explicitly unpublished. Their checklist sourcing/publication is incomplete; do not create empty completion claims. |
| Recovered artwork | Exact approved plan: 7,911 fronts and 23,733 derivatives, SHA-256 `20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd`. The owner approved publication and the 4,926 official Taiwanese fronts on 29 September. | Successful protected publication receipt and public API readback. The 4,250 source/identity exceptions remain outside this plan. |
| Earlier catalogue/artwork repairs | Main includes Queue 1, MEP, Pocket, Pitch Black and the 480 Storm/anniversary publications, plus set-list and card-detail printing-front readers. | Retain exact published identities and check representative reads. |
| Set logos | Main already contains the Chinese logo pack, the SoulSilver/Lost Link corrected PNGs and their runtime mappings. The corresponding historical drafts #203/#204 are not missing integrations. | Run existing logo identity/bundling checks; verify installed rendering. Unassigned/missing logos stay explicitly unresolved. |
| Master Set, inspection, haptics and motion | Main already integrates the corrective release from #210, including the Master Set artwork/quantity and inspection work. #241 preserves saved Reduce Motion and allows search results before optional images finish loading. | Physical-device haptics, gyro, camera, background/resume and finish-specific appearance remain device checks. The verified foil-mask registry is not universal card coverage. |
| Pricing and retrieval | Main includes the existing general-price implementation, valuation fixes, selected-set search, mixed-language folder matching, Pitch Black identity repairs and growing-history refresh fix. | Confirm actual deployed backend/worker revisions and fresh owner totals; native compilation alone does not deploy workers or refresh prices. |

## Production rehearsal finding and bounded correction

Artwork run [36531511671](https://github.com/tberridge86/Stackr/actions/runs/36531511671) verified all 31,581 distinct archived objects, then rehearsed all 7,911 assets and links successfully in staging and rolled back. Production rehearsal stopped with `Asset insertion conflict`. The receipt confirms zero uploads and no publication; the production transaction rolled back.

Production has `assets_storage_object_uidx`, a unique active-asset storage-key index. Staging has only a non-unique storage-key index. Legitimate identical Energy fronts on distinct deck printings therefore conflict in production when original paths use only their image hash. The correction gives each original an immutable path containing both the canonical printing ID and image hash; derivatives remain shared by hash. No database index, asset, source policy, card identity, image byte or approval scope changes. The upload plan has 31,590 distinct storage objects for the same 31,644 image references. Tests assert uniqueness for all 7,911 originals and unchanged shared derivative identities.

The protected artwork lane must re-run the full staging and production rollback rehearsals before any upload or catalogue publication. Existing assets are preserved; approval does not authorize replacing conflicting artwork.

## 29 September delivery update

PR #248 merged as `5c019b9d16816d7a702435b1df77d7c0927be2cc` after all ten applicable checks passed; the wider release-candidate gate was skipped. The corrected artwork run [36533384149](https://github.com/tberridge86/Stackr/actions/runs/36533384149) verified all 31,590 planned storage objects and successfully rehearsed all 7,911 assets/links in both staging and production, then rolled back both. It uploaded and verified 112 files before two storage POST requests received HTTP 429 `DatabaseError` responses (`08P01`). No catalogue asset/link publication occurred. The focused follow-up uses the existing bounded exponential-backoff policy for immutable uploads; permission/permanent errors still fail, duplicate responses require later byte verification, and existing files are never overwritten.


PR #249 merged as `f9688c6ff90fdc73f5aca8c3e7e1d21263d1d670` after eight applicable checks passed. Its focused publisher suite passed 19 tests. Protected artwork run [36535188734](https://github.com/tberridge86/Stackr/actions/runs/36535188734) is using that exact revision and the unchanged approved cohort. At this checkpoint it is still running; do not treat the dispatch as a successful publication receipt.

Public API set-name checks passed for all four representative languages. Chinese/Japanese logo checks passed, as did the curated CoroCoro catalogue and all 81 supplied magazine-cover integrity, issue/language and presentation-surface checks. These are source/API checks, not phone rendering evidence.

A one-off follow-up named `Stackr October 1 release` is active for 1 October at 09:00 Europe/London, attached to this chat. It continues the reviewed production-profile TestFlight sequence after rechecking capacity and delivery dependencies; it is not the previously removed recurring TestFlight checker.

The live backend still reports source `37817f2cb83b`, deployment `09193c47-1428-4c6b-8dd1-6442d1172093`. The two pricing workers have no verified healthy replacement; their new main-triggered deployments are skipped. The last explicit upload rejection on 27 September reported an expired Railway trial. The owner has been asked whether access is restored; no paid-plan change has been made. Backend/worker promotion and actual recurring refresh remain required before claiming those server fixes delivered.

The original production metadata evidence is also retained in [an exact-byte ZIP](../../reports/catalogue/metadata-signoff/2026-09-27-production/original-verified-evidence.zip), with its [checksum receipt](../../reports/catalogue/metadata-signoff/2026-09-27-production/original-verified-evidence.json). All ten original file hashes match the original import manifest independently of Git text line-ending normalization.

## Public API acceptance found during final review

The [29 September API acceptance check](october-1-api-acceptance-20260929.md) matched all 480 Storm/anniversary identities and artwork references. It also found that production omits saved illustrator/type/subtype details from the published-card view. The focused `card_details` release has now succeeded in run 36540251921: 57,436 printings retain their existing rows and match stored details, all 480 imported cards match metadata/artwork through the public set API, and 12/12 card-detail reads passed after normal cache revalidation. This confirms delivery of stored fields, not universal field completeness. Two letter-only Energy collector searches remain classified exceptions. Repeat API requests were fast in the bounded sample, but first requests did not all meet 0.5 seconds; no universal speed or phone claim is made.

## Build and release sequence

1. Merge the reviewed release queue after applicable CI. Record its exact main SHA and successful artwork receipt.
2. On 1 October, recheck Expo capacity and actual existing build inventory before consuming a build. The last measured allowance was 15/15 used, resetting 1 October at 00:00 UTC. A fresh 29 September read-only check confirms the remote counter is 47 and the latest completed production artifact is still build 46. Auto-increment therefore currently implies build 48; recheck before dispatch. See the [native inventory receipt](october-1-native-inventory-20260929.json).
3. Use `.github/workflows/build-owner-ios-release.yml` with `build_profile=production` and the exact reviewed `expected_main_sha`. Preserve normal production channel/runtime and existing release guards. No paid-plan change, owner-recognition substitution or OTA bypass.
4. Verify the completed EAS artifact's source, profile, bundle identifier, runtime and signed build number. Submit that exact artifact to Apple app `6772118450` through the existing normal TestFlight submission process, then verify the existing `Team (Expo)` and `Stackr Beta Testers` groups. The established delivery path is documented in [the normal TestFlight handoff](normal-testflight-45-handoff-20260919.md). Do not use `scripts/submit-owner-recognition-ios.mjs`, which asserts the separate owner runtime. Build, submission, Apple processing and tester availability are separate states.
5. Record Apple processing and availability separately from installation. On the phone check set names/logos, representative EN/JA/SC/TW card images, collection values, search, card inspection, haptics, gyro, reduced motion and camera save/reopen. Do not call sub-0.5-second native loading or complete pricing verified without measurements.

## Evidence and explicit exceptions

- [Metadata production promotion](../stackr-api/metadata-production-promotion-2026-09-27.md), original workbook and rollback evidence under `reports/catalogue/metadata-signoff/`.
- [Fresh metadata readback](october-1-metadata-readback-20260929.json): 677 existing operations, 675 unchanged and two reviewed anniversary totals filled later.
- [All 102 new set statuses](october-1-new-metadata-set-status-20260929.json): 8 published, 94 with no card checklist.
- [Artwork approval packet](artwork7911-approval-ready-20260928.md) and [4,250 artwork exceptions](artwork4250-exceptions-20260928.json.gz). The preparation packet's pending-approval wording is historical; the current approval record is true.
- Aura Seeker remains unresolved; provisional/date-precision exceptions and two source-only teaching programmes remain documented.
- Historical cleanup PR #219 is not required for this release and is not silently merged. Do not replay stale scanner, inspector or Master Set branches over newer main changes.
- No new native artifact has been built or submitted by this queue preparation. Installed build 46 cannot demonstrate the newer client fixes.

## Current artwork delivery run

Run 36535188734 was stopped before catalogue publication because its measured upload pace exceeded its original 180-minute window. Its receipt preserves 2,223 verified files and zero published assets/links. Run [36540630666](https://github.com/tberridge86/Stackr/actions/runs/36540630666) resumes the same approved cohort with six transfers and 360 minutes, re-verifying stored files before reuse. Require its successful final publication receipt and public readback before native release; a running job is not delivered artwork. See the [live API acceptance receipt](october-1-api-acceptance-20260929.md).
