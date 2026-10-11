# TRANSLATION-MARNIE-001 canonical correction follow-through

This remains an active P1 release blocker. No canonical write, runtime regeneration, publication or deployment was performed in this pass. The existing exact correction proposal is `docs/audits/20261010/marnie-alias-correction.json`; official evidence references support English display name Marnie while preserving the Traditional Chinese printed identity.

## Current bounded readback

Independent read-only production catalogue inspection at **2026-10-11T15:40:20.589116Z** confirms all **12** proposed printings remain published Traditional Chinese (`zh-tw`) Trainers with native title `瑪俐` and English display `Pikachu`. They have **13** active variants because one target has normal and reverse-holo finishes. Those variants have **13** stale active English display aliases (`Pikachu`/`pikachu`) and **13** native aliases that must remain unchanged. No collector/user data was read. The immutable normalized before-image is `marnie-before-image.receipt.json`: canonical `JSON.stringify(parsedReceipt)` SHA-256 `1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677`. The original scratch-file byte hash is `de9b049a40f474a3bb1f0f6612ed622c1102b6573891485b9bd6a4da73938a38`; use the canonical JSON hash across Git line-ending conversions.

Current alias confidence 0.85 and null `source_updated_at` do not prove source evidence. The exposed catalogue schema has no correction-provenance field. The current published version alone does not provide a strict revision guard. A reviewed official/evidence receipt, before-images, target-specific timestamps and mobile-syncable change history are needed for a trustworthy correction and rollback.

## Why a runtime-only edit is insufficient

The generated owner-approved map contains exactly one `zh-tw/瑪俐 → Pikachu` group for the 12 proposed IDs. Genuine `zh-tw/皮卡丘 → Pikachu` is separate and must remain valid. The detail/translation resolver consumes the wrong exact map; regular API search can first use stale stored English aliases before translation fallback. Merely changing the map would leave Marnie in a Pikachu search.

The original runtime generator and accepted input are named files in the very dirty `D:/Stackr-1` checkout and are untracked there. They were inspected read-only and left untouched. The generator declares its input already approved/applied; generating an unapplied correction while retaining that assertion would misstate delivery. The lean recovery candidate deliberately excludes mobile generated mirrors and uses backend naming results.

## Smallest coordinated repair, still pending

1. Prepare a hash-bound corrected input/receipt for exactly the 12 printing IDs; preserve every other approved record and identity. Resolve the canonical provenance/publication lane before generation.
2. Under separately approved live-write authority, recheck and capture locked current before-images; require exact printing/native/language/set/number/category, current English value, no deprecation/correction and target-specific `updated_at` values. Require exactly 12 printings and the reviewed 13 variants/name-row IDs. Abort on any drift.
3. Change only the 12 printing English displays and 13 corresponding English aliases to Marnie. Preserve the native aliases, variants, finish, artwork, prices, publication membership and all private account records. Write the established audit/change-log evidence and communicate the metadata correction through the existing publication mechanism; do not reuse a language/identity-deprecation migration as a metadata repair.
4. Regenerate the existing backend runtime from the reviewed corrected applied source; preserve original input and before-images for rollback. Check retained mirrors only where that release lane includes them.
5. Test all 12 exact detail/native/Marnie searches, absence from Pikachu searches, genuine Pikachu preservation, later canonical provenance priority and all unchanged identity/artwork/price fields. Independently review and approve matching publication/deployment, then read back the actual API and installed journeys.

Existing approved-name, translation-search and server-to-mobile fixture checks pass, but they do not contain this collision and cannot close it. The production readiness ledger must retain this failure until the coordinated correction is actually delivered and verified. This report is preparation and current evidence, not a request to authorize an unspecified database script.
