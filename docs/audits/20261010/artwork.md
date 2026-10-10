# Independent artwork audit — 10 October 2026

The bounded audit found a reproducible client rejection of three live, approved
same-artwork references (ART-001), and a CoroCoro cover path that bypasses the
existing source disable switch and issue denylist (ART-002). Existing public
artwork remains readable. No new image acquisition, catalogue update,
publication, deployment or phone test was performed.

## Scope and evidence states

- Maintained checkout: `D:/Stackr-release-recovery-20261009`, branch
  `codex/specialist-audits-backend-repair-20261010`, inspected HEAD
  `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`. Other agents' current changes were
  inspected and preserved. This agent owns only this report.
- Fresh public observations: 2026-10-10 22:22–22:24 UTC,
  `https://api.stackrtcg.com/v1`, production storage project
  `oakdbbzdqwurpjnoqhmu`. Requests were bounded and sequential; image bytes were
  decoded in memory without local mirroring. No credentials were used.
- Backend revision `9fae8fac7e8a` and deployment
  `7070a53d-6b09-41e7-9e06-ee3fcb7b8212` are supported by
  [the live promotion receipt](../../releases/daily-pricing-live-promotion-20261010.md).
  This audit freshly checked catalogue/image responses, not Railway deployment
  status. An initial `/health` request at the gateway returned 400 invalid_path;
  it was not treated as a backend-health failure or successful health attestation.
- Signed build 54 uses source `bf3d7a233aa7d30dda99b61ccd51533ae85eed90`, per
  [the build receipt](../../releases/testflight54-delivery-20261008.md).
  Current CoroCoro archive/loader source and the later local unsigned export are
  separate from that binary. Installed-phone rendering is unmeasured here.
- Read instructions: `AGENTS.md`, `.codex/AUDIT_PROTOCOL.md`,
  `docs/agents/README.md`, `docs/agents/catalogue.md`, and this role's assignment
  in `assignment-plan.json`.
- Read current source: `backend/lib/assetPipeline.js`, `assetRepository.js`,
  `cataloguePublicAssetPolicy.js`, relevant `stackrApiV1.js` mappings,
  `components/EditionAwareCardImage.tsx`, `StackrImage.tsx`,
  `CorocoroIssueCover.tsx`, `lib/cardArtworkPresentation.ts`, `editionImages.ts`,
  `cardArtworkImages.ts`, `stackrDomainAdapter.ts`, `tcgdexControlledCardReference.ts`,
  `corocoroIssueArchive.ts`, `corocoroSuppliedCovers.ts`, `corocoroCoverReferences.ts`,
  `magazineSetCovers.ts`, `app/card/[id].tsx`, `app/corocoro.tsx`, and named binder
  image call sites. Read the asset-delivery/IP contracts, source registry,
  magazine rights review and named publication receipts; did not scan catalogue
  or artwork trees.

## Current API-to-image path

The app reads versioned card DTOs and bounded printing-specific asset manifests.
`stackrDomainAdapter.ts:617` keeps embedded and manifest assets associated with
the printing and explicit image/same-artwork variant IDs, then calls
`resolveCardArtwork`. Its result supplies legacy `images.small`, `images.large`
and presentation candidates. The selector checks approved permission, asset
type, available status and supplied game/set/card scope; ordinary finish sharing
is labelled `shared`, rather than exact finish photography.

The chosen grid rendition is `card-grid` (normally width 240); enlarged detail
uses `detail-page` (target width 720) ahead of original and thumbnail fallbacks.
`EditionAwareCardImage` uses supplied or tagged local edition artwork, includes
language in its cache key, requests no legacy edition endpoint, and disables
shared fallback/English edition overlays for foreign cards. English overlays
remain presentation effects; they cannot prove a photographed first edition or
shadowless printing. Card detail and binder enlargement pass `sourceSize="large"`
with contain fit; binder grid passes `small`.

`StackrImage` chooses full before thumbnail when preserving detail, uses the
thumbnail as a placeholder, disables Expo downscaling for inspection, and uses
URI/rendition-specific cache entries. Its card-shaped frame centres a 63:88
silhouette and clips to rounded edges. This is display geometry, not proof that
the original source includes every edge or was cropped correctly. Each remote
candidate is retried once, then the vetted candidate list advances and ends at
an explicit placeholder. The existing component test confirms late old-source
errors do not poison a corrected source. A render retry does not improve source
resolution or turn an invalid image into original artwork.

## Fresh bounded records and files

Three samples come from the immutable
`docs/releases/captured-artwork-recovery-plan-20260910.json` receipt. Each card
and printing-scoped manifest returned HTTP 200 with one approved asset and
`nextCursor=null`. Exact language/set/collector/finish and explicit shared
pointer still match that receipt.

| Printing/sample | Selected variant | Referenced asset / source variant | Current evidence |
| --- | --- | --- | --- |
| EN Ascended Heroes `me02.5`, Totodile 041, normal | `00021ece-533f-4306-9333-4afb1b01718d` | `2f9c4fef-4a0e-4658-bf46-a7cdf0f43561` / `c7533e4d-e321-49c1-af78-ec243af9ad4b` | API explicit same-artwork reference; 3 files verified; client selector returns missing |
| JA Pokémon Card 151 `SV2a`, ポニータ 077, reverse_holo | `005437d6-291e-445d-9b2b-55d6495453a9` | `2fd1345c-3c5b-424d-8d7b-e80ba77eb812` / `cfb57e38-baa2-46a9-841f-7e8c27ef68ac` | API explicit same-artwork reference; 3 files verified; client selector returns missing |
| TC Terastal Fest ex `SV8a`, 爬地翅 087, reverse_holo | `003d0144-829b-42a9-812f-14c3b94c0341` | `b752738a-d697-490e-ac81-e539152099df` / `a65fb996-40e7-44b7-b26e-f264adc8cd30` | API explicit same-artwork reference; 3 files verified; client selector returns missing |

All nine original/grid/detail images returned 200, correct JPEG/WebP MIME,
decoded completely and matched both DTO/receipt SHA-256 and dimensions.
Original/detail: 600×825; grid: 240×330. HTTP cache header was
`public, max-age=31536000`; the DTO additionally records `immutable`.
Their approved existing-original URLs are:

- [EN original](https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/ad/9e/ad9ea1ba3217f20ce943d8be9c65ecb2774319b02290a3d9fb1c6f6bc93573fc/original.jpg), SHA-256 `ad9ea1ba3217f20ce943d8be9c65ecb2774319b02290a3d9fb1c6f6bc93573fc`.
- [JA original](https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/ab/e8/abe82917371c156f55e5f8918b75241913bdab48a06899fc79672799cb672d72/original.jpg), SHA-256 `abe82917371c156f55e5f8918b75241913bdab48a06899fc79672799cb672d72`.
- [TC original](https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/bd/17/bd179bc88d0edbc4c6a1340cf3ad0f5318d7aecfe94389358525c4833b475f72/original.jpg), SHA-256 `bd179bc88d0edbc4c6a1340cf3ad0f5318d7aecfe94389358525c4833b475f72`.

Two additional named publication controls were read, without expanding to their
whole cohorts:

| Historical approved batch control | Fresh current card/manifest/file evidence |
| --- | --- |
| `residual146`, printing `02eaba5e-1bbb-4f14-9fd4-489715fa6d8c`, EN SVP 219, normal | Card and manifest 200; `tcgplayer_card_artwork`, permission approved; decoded original 711×1000 JPEG; SHA-256 `50660730b573949cc255532ab6764bb49f93d636e8e0894bf3bcf1c52d34e333` matches DTO. Variant still says `scan_acquisition_required` despite printing artwork. |
| `korean232`, printing `001fc80e-05c1-44d8-a120-d3a1fac170cf`, KO SV4M 045, holo | Card and manifest 200; `pokemon_card_kr_official`, permission approved; decoded original 512×714 PNG; SHA-256 `e288a476001ca3b19daf4271fa4906ee311f31e52469d288b17e10c57f0f1b33` matches DTO. Variant still says `missing` despite printing artwork. |

Receipt `assets[].id` is the internal row UUID; current public asset IDs use
`artwork-recovered-20260928:<printing>:<hash>`. Those different identifier
domains were not treated as missing publication. The live native-image status
and image-presence discrepancy is a backend metadata reconciliation handoff,
not evidence that the readable original is a photographed exact physical finish.

Measured here: 5/5 named card reads and 5/5 scoped manifests usable, 11/11 fetched
files decoded/hash-matched. Only the three captured references were passed
through the actual client selector: 0/3 selected. SC was not freshly sampled;
whole-language/current catalogue coverage remains unmeasured. Older Korean
readiness limitations do not override the freshly readable Korean control.

## Reproducible findings and smallest repairs

### ART-001 — high — explicit approved sibling image is rejected

`lib/cardArtworkPresentation.ts:48–57` looks for the source variant in
`card.variants`, rejects absent sources at line 51, and only afterwards computes
`selected.sameArtworkAsVariantId === asset.variantId`. All three live responses
contain only the selected variant, while its approved image points to the
explicitly referenced sibling. Each actual response therefore produces
`{kind:'missing', assetId:null, candidates:[]}`. The downstream adapter consumes
this result, losing working small/large images before `StackrImage` can retry.

Reproduction, with no writes:

```powershell
node --import tsx -e 'const {resolveCardArtwork}=require("./lib/cardArtworkPresentation.ts"); (async()=>{const j=await(await fetch("https://api.stackrtcg.com/v1/cards/005437d6-291e-445d-9b2b-55d6495453a9")).json(); const c=j.data.card; console.log(resolveCardArtwork(c,c.variants.flatMap(v=>v.image?[v.image]:[])));})();'
```

Proposed owner: coding/artwork follow-up assigned by root. Honor the
backend-approved explicit same-artwork pointer before requiring a sibling DTO,
with matching native-image status/image pointer and existing permission,
identity and special-variant controls; preserve `shared` presentation. Do not
broaden implicit sharing or relabel the asset as exact physical-finish artwork.
Recommended exclusive regression file: `scripts/test-master-set-artwork.ts`;
its current fixtures retain both normal/reverse siblings and omit this DTO
shape. Add absent-sibling approved-pointer positives and missing/incompatible
pointer, non-approved, cross-printing/set/game and special-variant negatives.
Then run focused artwork/adapter tests and required app typecheck/lint.
Actual-device verification remains a release-owner step.

### ART-002 — medium — archive supplied covers ignore recorded removal controls

`lib/corocoroSuppliedCovers.ts` directly returns one of 26 bundled cover requires
unless an optional caller supplies `sourceEnabled:false`.
`components/CorocoroIssueCover.tsx:12` supplies no context.
The existing rights review requires source-wide and per-issue disablement;
`magazineSetCovers.ts:200–239` enforces it for set covers, but the archive bypasses
that resolver. Fresh local reproduction with a Node PNG require shim showed:

| Control | Existing set-cover resolver | CoroCoro archive resolver |
| --- | --- | --- |
| `EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS=true` | null | still returns `monthly:2001-05` source |
| `EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST=corocoro-comic-2001-05` | null | still returns `monthly:2001-05` source |

The separate `EXPO_PUBLIC_COROCORO_COVER_REFERENCES_ENABLED` flag is passed only
to the discovered-reference presentation; it does not gate the supplied cover.
Proposed owner: artwork/coding sequential follow-up. Reuse the existing exact
magazine policy for the supplied resolver and verify source/per-issue controls,
publication conflicts and placeholder behavior through the actual cover
component. Do not invent a broader source licence or overwrite the supplied
pack. Extend `scripts/test-corocoro-mobile-delivery.ts` under exclusive ownership.

## Resolution review before sharper-original discovery

The named audit script, delivery-boundary module and acquisition-authority
registry are absent from the maintained checkout. Their originals are untracked
local work in `D:/Stackr-1`; they were read-only inspected, not copied or modified:
`scripts/artwork-quality-audit.ts`, `backend/lib/artworkDeliveryBoundary.js`, and
`catalogue/catalogue-asset-acquisition-authority-registry.json`.

The original audit function was run on an in-memory three-row manifest of the
captured originals above, before source discovery. Existing API/receipt identity
and approval flags apply to those existing assets only. Result: 3 reviewed,
3 `below_hd_resolution`, 0 aspect-suspect, 0 missing dimensions; all
`replacementEligible:false`. Its HD threshold is 720×1008. Aspect is a review
signal, not crop-quality proof. No crop correction, upscaling or generated art
was used. Two current cover headers were separately checked: February 1997
445×647 and May 2001 446×649; the latter was visually inspected as the supplied
magazine cover. Magazine dimensions were not judged against card thresholds.

Current TCGdex metadata discovery then returned exact IDs/names/set/local
numbers on all three following approved metadata routes at 22:22:58–59 UTC:

| Candidate source record | Exact evidence | Approval / better-original result |
| --- | --- | --- |
| [EN me02.5-041](https://api.tcgdex.net/v2/en/cards/me02.5-041) | Totodile, 041, Ascended Heroes; image base `https://assets.tcgdex.net/en/me/me02.5/041` | Metadata 200. No newly cleared HD acquisition or genuine sharper original established. |
| [JA SV2a-077](https://api.tcgdex.net/v2/ja/cards/SV2a-077) | ポニータ, 077, ポケモンカード151; image base `https://assets.tcgdex.net/ja/SV/SV2a/077` | Metadata 200; normal/reverse flags do not prove a separately photographed reverse pattern. HD replacement unresolved. |
| [TC SV8a-087](https://api.tcgdex.net/v2/zh-tw/cards/SV8a-087) | 爬地翅, 087, 太晶慶典ex; image base `https://assets.tcgdex.net/zh-tw/SV/SV8a/087` | Metadata 200; normal/reverse flags do not prove exact physical finish. HD replacement unresolved. |

The web reader could not open these API URLs; bounded direct HTTP metadata
requests succeeded. No candidate image bytes were fetched from TCGdex.
`catalogue/source-rights-registry.json` approves TCGdex metadata with attribution,
while new original storage/display/derivative capabilities remain conditional.
The controlled client reference contract is low.webp, memory-only, issued from
an exact live/TTL record, limited to JA/SC/TC with switches and attribution; it
does not authorize high-resolution persistence. Existing approved immutable
assets retain their own historical approvals. The original untracked registry
binds an exact historical 5,118-candidate hash/page authority, not these three
new replacement tasks. Public accessibility or a plausible `high.webp` URL
does not establish new rights, authority, dimensions or better quality.

## Acquisition capability and CoroCoro gaps

The inspected current mirroring script first tries approved identical-source
reuse, requires approved database permission/rights, constrains provider/language
and redirect hosts, and targets only staging. It accepts bounded asset IDs,
defaults to 100 candidates/2 workers and clamps concurrency at 6, with three
source attempts and three transient-database attempts. A staging execution
creates objects and catalogue associations and is a live mutation, rather than
audit-only work. The source catch block at
`scripts/mirror-approved-catalogue-assets.mjs:313–319` retries errors other than
404/410, including deterministic non-transient HTTP/oversize/redirect failures;
a future acquisition-tool repair should classify those failures before retrying.
This behavior was source-inspected, not exercised against providers here.
Stored-asset derivative repair clamps concurrency to 4 and needs approved rights
and permission. `assetPipeline.js` preserves immutable content-addressed objects,
hashes/attribution and uses `withoutEnlargement:true` for 240/96/720 derivatives.
No pipeline can manufacture detail absent from a low-resolution original.

The [146-front](../../releases/artwork146-completion-20260930.md) and
[232-front](../../releases/artwork232-completion-20261001.md) receipts establish
historical published/verified cohorts with rollback rehearsal and preserved
object evidence. They are distinct from downloaded, held-name and pending
publication candidates. Those historical counts were not presented as a fresh
census or full 75k HD coverage.

CoroCoro source tests establish 34 documented publication/month issues,
36 distribution records and 54 card references. The current archive bundles
26 of those 34 covers; 8 remain explicit placeholders:
`monthly:2022-02`, `ichiban:2021-03`, `monthly:2014-03`, `monthly:2003-06`,
`monthly:2003-05`, `monthly:2003-02`, `monthly:2002-01`, `bessatsu:2000-08`.
These counts are this small archive, not all CoroCoro issues. The original
owner-supplied pack contains 81 covers for set identification; its broader file
count does not imply 81 mapped archive issues or new card memberships.
The exact February 1997 and May 2001 Mew links work in fixtures; later Shining
Mew and other publications cannot borrow them. Remote source/issue links remain
metadata evidence. Local-web attachment preview is not production native
acquisition. No additional archive artwork was promoted.

Actionable work outside verified acquisition capability:

1. Root assigns and integrates ART-001/ART-002 repairs; release owner verifies
   the repaired selector with these exact responses and publishes the matching
   native/update source before claiming phone delivery.
2. For the three 600×825 HD review candidates, first search approved identical
   source/storage records within a pinned identity batch. A new replacement
   requires a genuinely sharper original, exact language/set/collector/edition/
   physical-variant evidence, source-specific storage/display/derivative scope,
   acquisition authority, review time, hashes and rollback receipt. None was
   established by this audit. No outreach message is authorized or sent.
3. For the eight named cover gaps, obtain an exact issue cover supplied under
   the existing review scope or complete a source-specific rights/authority
   review; preserve publication/month conflicts and neutral placeholders.
   Discovered publisher/community pages alone cannot clear image delivery.
4. Backend owner reconciles printing-art presence against native-image status
   for the EN SVP 219 and KO SV4M 045 controls before changing canonical status.
5. Release owner conducts actual iPhone cold/warm image loads, zoom/detail,
   cache/offline recovery, source removal and issue navigation on the published
   source. Current source, API/file success and local export are insufficient.

## Checks actually run

All eight narrowly selected existing checks passed:
`npm run test:asset-pipeline`, and direct existing tests
`test-card-artwork-images.ts`, `test-edition-aware-image-selection.ts`,
`test-stackr-image-recovery.ts`, `test-stackr-image-candidates.ts`,
`test-corocoro-issue-archive.ts`, `test-corocoro-mobile-delivery.ts`,
`test-printing-asset-manifest.mjs`. Asset-pipeline temporary objects were confined
to `D:/Stackr-recovery-artifacts-20261009/runtime-temp`; tests use local/mock
storage and no live import. Passing fixtures do not cover ART-001's absent
sibling DTO or ART-002's real environment switches.

The live-response/client selector reproduction, eleven decode/hash comparisons,
three-row quality audit and two source-removal-control reproductions ran
separately as described above. No runtime code changed, so root app/backend/
gateway build checks were not rerun for this documentation-only contribution.
No commit, push, child agent, external message, catalogue write or live job was
performed. The original dirty checkout and shared repair queue remain preserved.
