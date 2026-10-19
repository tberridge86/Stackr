# SVP1 native title replacement — 19 October 2026

The bundled Traditional Chinese SVP1 title now selects the exact reviewed
1440×270 native crop instead of the previous generated derivative. The original
PNG preserves the native glyph contours and complete white border. Its metallic
grey background remains visible. This is a source-fidelity improvement, with no
claim of a measured sharpness gain or an official high-resolution master.

Only SVP1 (`34e5af6e-66d0-4fea-98ce-b1fa1ec1d1dd`, `zh-tw`, `ex特別組合`) changes.
The other 35 additions, six historical marks and native pack-art fallbacks retain
their selections. The selected origin counts are now 34 generated derivatives,
one official source original and one official source crop.

## Exact source and permission

- Source: <https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2023/04/tw_news_SVP1_SV2bundle_PKG_0316.png>.
- Unmodified 2020×2841 source SHA-256:
  `28335c48835c4f47a8b58554394b65b5a7ba813a85c8ddbd645733d5812ee6cc`.
- Integer crop: left 300, top 2440, width 1440, height 270. The exact bundled PNG
  is SHA-256 `2f2acbc19616479cc93d22b4923f33a45b05c9debc82c30d94dfa3b9e3f5045d`
  (382,199 bytes). No resizing, sharpening, generation or alpha removal occurred.
- Whole-source decoded RGBA row-stride copying independently matched every crop
  pixel; decoded crop SHA-256:
  `22058b67b0ca61322bebb94a7e9005dbc0cc0aa542431ce23e2a6958939e4844`.
- The exact32 owner receipt
  `7f07676cd46768956726c15619b74cc1c25d422f9d95ea52d04fddf3ee9a63d1`
  explicitly covers saving, displaying and cropping these exact sources. The
  [focused rights review](../../catalogue/rights-reviews/svp1-native-title-owner-exact32.2026-10-19.json)
  retains the exact question, answer, source binding and original receipt pins.
  It makes no new upstream licensor claim or blanket provider activation.
- Independent local qualification was frozen in handoff
  `92052a311c4abf590d63b521b735a2216d08c25c7a5c0c0ed725652a0d677726`.
  Full source, crop, rights and rollback lineage is retained in
  [provenance](../../assets/rev2/12-traditional-chinese-set-logo/logos-native-source-20261019/provenance.json).

The old prepared-reference hash/transform bridge remains unproved. The new exact
source-to-crop chain does not assert that older bridge. SVC and SVD remain held
because matched-size review did not establish genuinely better originals.

## Delivery state

This change selects bundled app bytes locally. It does not publish an API asset,
dispatch a native build or establish installed-phone acceptance.

Ordinary public reads at 18:33 UTC on 19 October returned the exact SVP1 set
identity/title and an empty set-logo manifest with `nextCursor: null`. The
corrected set response SHA-256 is
`ca223a9e8b7d9f2ce33575fd96013ed4f1f0aea343419839e1fb4e5ed5dbbcae`;
the manifest response is
`ae23caa6c00dc32af6bb653cbdd9a9b9d17b2f95cf2d517c70ed99e70a304722`.
The earlier 400 came from a diagnostic helper's unsupported language query
parameter and remains retained; it was not an app defect.

Public `assets: []` does not prove canonical prior-link absence or a published
catalogue version. A private, non-executable exact-one publication intent is in
`D:/Stackr-organization/evidence/consolidation-20261018/svp1-native-title-replacement-preparation-20261019/`.
The coordinator's four-read canonical preflight passed independent review and
received explicit owner approval. All four exact production calls ran once:
canonical identity/published membership, candidate keys and controlled storage
metadata succeeded; the complete effective logo-link query reached its unchanged
five-second statement limit. Its prior-link state remains unknown. The timeout
was retained without retrying the query or raising the limit. The intent contains
no executable publication builder.

The production diagnostic receipt is
`4176fe2a04592944ac37e188d968156ed94ed976c520de05f8be754c9a696442`.
A scoped equivalent successor for the failed read passed local PostgreSQL
comparisons and independent review. Its separately approved single production
call also timed out at the unchanged five-second limit. That approval is consumed;
receipt `6d18e31cc460fdb70d8e164c44d7fe89d1f43bd80bd523065944b927eaabd653`.
No runtime improvement or complete prior-link state was obtained. Saved index
definitions and an older public-logo plan do not establish this timeout's cause.
A nonexecuting plan check for the exact failed query has been prepared and
independently reviewed; it needs its own approval before execution.

Publication-qualified batch: empty. Catalogue writes, uploads and publication:
zero. Actual API/app image verification and phone acceptance remain outstanding.
TestFlight remains held.

## Validation and rollback

Passed: `npm run test:traditional-chinese-hires-logos`, including the extended
42-mark/native-SVP1/three-pack regression and the historical six-mark review.
The existing regression checks the exact PNG binding,
native dimensions, immutable hashes, source/crop provenance, focused permission
scope, retained rollback file and existing identity/language boundaries. It keeps
the previous path rule for the other 35 additions. Typecheck, lint and independent
review passed before source integration in main `43d7a91b868ea4337c6967813a521ba46747a434`.
All eight applicable checks passed on that merged revision; delivery receipt
`3c4dc88431d0e9b8dfb7efe936f2166ffb662d137147ab97e0f9b20de412f5c0`.
No full native build was dispatched by this work.

The first local run passed the new SVP1 assertions and then exposed two existing
nested pack permission receipts converted from LF to CRLF by checkout. Both
working files exactly matched that transform of their committed blobs; no
content edits existed. Only those two files were restored to their exact HEAD
bytes, preserving their recorded hashes. Narrow LF attributes now protect that
existing receipt folder and the new byte-hashed SVP1 provenance file. Expected
hashes were not changed. The failed result and before/after byte proof remain
in the private preparation receipt.

The prior `logos-hires-20261016/svp1.webp` remains unchanged and tracked with
SHA-256 `3f9e60d5c6e6225a60c6ac8d0b1bc75794860b101318e3ed3a9cd82b0574272f`.
To roll back locally, restore only SVP1's previous static require and manifest
entry from the provenance rollback receipt, then recompute selected origin
counts. Preserve unrelated later changes and both immutable image files. This
local rollback does not imply any remote catalogue rollback.
