# Traditional Chinese high-resolution logos — 16 October 2026

The owner requested completion of the logo work and inclusion in the next app
release. This change bundles all 36 logos from the original missing-logo register,
using the existing exact canonical set UUID and `zh-tw` language. The six previously
selected Traditional Chinese marks and their manifest are preserved.

## Artwork and app behaviour

The existing Traditional Chinese resolver adds 36 static WebP requires. Discover,
set detail, card detail, Home and binder consumers already use this resolver; these
assets travel with the app without a network image request. The existing language
guard and exact-ID matching stay unchanged.

Both Platform CI and the existing reviewed iOS release workflow run the new
36-logo regression before proceeding. The iOS workflow already pins its source to
the reviewed main SHA, so a subsequent build from this integrated source includes
the actual image binaries rather than a separate download or an offline queue.

The added lossless WebPs are 1,743–2,172 pixels on the longest side and total
22,779,418 bytes. Thirty-five are AI-enhanced derivatives, not official
high-resolution originals. Pokémon GO / S10b uses an official high-resolution
original converted losslessly to WebP. Source inputs and the built-in image editor
prompts remain in the owner's local source packs. The selection records the owner's
in-app identification request; it does not fabricate a new upstream licence grant.

## S11 and SP5 reconciliation

The earlier image preparation held these two records because their provider native
titles conflict with the printed codes. Current provider member data resolves the
logo identity without changing catalogue metadata:

- S11 includes Venonat, Venomoth and Sunflora-family Lost Abyss cards, has 100 cards
  and a 29 July 2022 release date. The official S11 mark is 迷途深淵 / Lost Abyss.
  The provider's 三連音爆 title is a separate known metadata issue.
- SP5 contains Greninja V-UNION, Mewtwo V-UNION, Zacian V-UNION and Professor Burnet.
  The official SP5 page describes these same products/cards and supplies the
  V-UNION mark used here. The provider's 強大 title is separately incorrect.
- The two fifth-anniversary marks remain preserved in the owner pack. They have
  no verified catalogue ID and are not assigned to SP5 or bundled by this change.

[Identity evidence](evidence/traditional-chinese-logo-identities-20261016.json)
retains source URLs, response hashes, dates and sampled members. The public Stackr
API returned 403 during this session; that read was not bypassed or counted as a
successful production check. No database names, membership, prices, accounts,
permissions, backend or public API assets are changed.

## Verification and delivery

Passed: app typecheck; lint (zero errors, eight existing warnings); 36-logo runtime,
identity/language and file-hash regression; historical six-mark regression; existing
preferred/published set artwork checks; and the iOS release-workflow regression.
All 36 WebPs decode, retain transparency and have no opaque pixels at canvas edges.

The production-profile iOS export completed with 754 asset entries. Every one of the 36
new logos is present in its asset manifest and matches the source bytes exactly.
The initial export failed to resolve this isolated worktree's shared dependencies;
a temporary local Metro dependency-root adapter fixed the validation setup. The
tracked Metro configuration was then restored byte-for-byte. Expo also reported
the absent Android google-services file; iOS export completed successfully.
[Validation receipt](evidence/traditional-chinese-logo-validation-20261016.json)
records the exported asset paths and hashes.

Source integration does not establish that a signed app or installed phone has the
images. No native build, OTA publication or App Store submission is dispatched here.

## Rollback

Revert this focused change to restore the six-mark resolver and remove the added
36-file cohort. Previous files are unchanged; no data rollback is required.
