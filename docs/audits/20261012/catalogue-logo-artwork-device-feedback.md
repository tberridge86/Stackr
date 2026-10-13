# Catalogue logo and artwork device-feedback audit — 12 October 2026

## Scope and evidence boundary

This is a bounded source audit after the owner's phone feedback: artwork initially
missing before appearing later, partially populated sets, no visible Traditional
Chinese set logos, and concern that 30th-set logos were not delivered. It does
not assert the phone's installed build number; the owner has not yet confirmed
that it was Build 55.

The reviewed checkout is `1356d4cc90f199f287db1c284440fdb5d627250f`. Its parent
source delivery receipt binds iOS 1.0.6 (55) to
`0188361a1b1e278ea180f9eec5ec487af52ca8cd`, with a finished native archive and
TestFlight availability, but explicitly records `installedDeviceVerified: false`.
That receipt has no logo-asset inventory or phone rendering observation. It proves
an available Build 55, not that the reported phone was running it or that any logo
was rendered there.

No provider, database, deployment, release, OTA, asset, or application source was
changed in this audit.

## Logo inventory and runtime route

### Traditional Chinese (`zh-tw`)

The checked-in local pack contains exactly six owner-selected, hash-bound marks:
SCA, SCB, SCC, SCD, S8a, and SN. Their exact canonical IDs and SHA-256 values are
in `assets/rev2/12-traditional-chinese-set-logo/manifest.json`; all six files are
required by `lib/traditionalChineseSetLogos.ts` only after a `zh-tw`/`zh-hant`
language check and exact set-ID match.

`lib/localSetArtwork.ts` calls that resolver for the Explore, Binder, set detail,
card detail, search, and home consumers. Explore calls the shared resolver before
the remote logo/symbol route. Therefore the six selected identities are bundled
and source-reachable. This is not a complete Traditional Chinese logo catalogue:
all other `zh-tw` identities have no bundled local mark in this resolver. The
historical selection receipt says the same thing explicitly: it "adds six
Traditional Chinese marks" and does not establish complete artwork coverage.

Status: **six source-bound/bundled/runtime-reachable identities; total supported
Traditional-Chinese set population, server asset availability, and phone rendering
are unmeasured in this pass.** A report that no Traditional Chinese logos appeared
is consistent with visiting sets outside those six; it can also be a delivery or
route issue for one of the six and needs a named-set Build-55 check.

### Simplified Chinese (`zh-cn`) and the 30th records

The checked-in Simplified Chinese resolver requires 130 literal local PNG assets
from `assets/rev2/12-chinese-set-logos/logos`. It only resolves an exact canonical
ID, approved `zh-cn` language alias, and, when supplied, matching set code. It
cannot borrow a mark by name, language, or mismatching code.

`docs/releases/chinese-logo-recovery-20260929.json` records the later exact
mapping recovery. It maps:

| Cohort | Source/runtime state | User-visible evidence gap |
| --- | --- | --- |
| `30thc` / 30th Celebration | Bundled and mapped to `cce4cfb8-6a87-567f-96a0-0884827a1396` in `lib/simplifiedChineseSetLogos.ts`; the PNG is present and hash-bound. | The recovery receipt records it as unpublished with zero printings, so no normal in-app list/detail journey is proved. |
| `promo-30th-p` / 30th Celebration Promos | Bundled and mapped to `b6d885e6-40de-4e3d-808d-fc2294af8ad4`; the recovery receipt records 18 published printings. | Server publication at the present date and Build-55/iPhone rendering were not checked here. |
| `30thD` | No verified source artwork. The checked-in Simplified-Chinese pack test explicitly retains this as missing. | No safe mapping or replacement is available. |

The older 134-file manifest still says its original `30thc` record was unresolved;
the later recovery receipt and generated resolver are the relevant additive mapping
evidence. That historical manifest cannot be used as proof of native delivery.

Status: **the regenerated/recovered Chinese logo files are source-bundled and
resolver-tested; Build-55 archive contents, server publication now, and phone
display are not proved by this audit.**

## Artwork that fills in later and partially populated sets

The current adapter deliberately takes a facts-first route. With `includeAssets:
false`, `lib/stackrDomainAdapter.ts` obtains complete, single-version canonical
set facts through `loadCompleteSetPages`; that loader rejects mixed catalogue
versions, repeated cursors, incomplete counts, and invalid cards. The optional
`readPreferredSetArtwork` route then requests bounded `includeAssets: true` pages
and calls `mergePreferredSetArtwork`.

That merge copies **only** an image where set ID, language, catalogue version,
collector number, variant ID, canonical ID, and image-variant ID all agree. It
does not replace facts, selected/default finish, ownership, price, language, or
catalogue version. It can therefore produce the observed sequence: complete card
facts first, then images appear as optional enrichment finishes. The code does
not establish whether an individual asset was available on the reported device.

The existing focused regression passes the two-page/default-variant case, retains
both finish images from split/repeated printing rows, rejects wrong language,
version, set, collector number and canonical IDs, and stops further pages after
cancellation. The adapter's full-set facts completion contract is also present in
source. This audit found no confirmed map/merge defect suitable for a local helper
change. The root-owned facts-first detail hydration work is compatible with these
identity safeguards; it must preserve the strict image-only merge.

## Checks run

- `node --import tsx scripts/test-simplified-chinese-set-logo-pack.mjs` — passed:
  130 exact Simplified Chinese mappings, preserved source bytes; seven original
  images remain unmapped and `30thD` has no verified source.
- `node --import tsx scripts/test-traditional-chinese-set-logo-review.ts` — passed:
  six exact Traditional Chinese identities and reviewed bytes.
- `node --import tsx scripts/test-preferred-set-artwork.ts` — passed: progressive
  artwork pages retain finish/edition/version identity and cancel safely.

No device, full native-bundle, current public-API, or server database read was
performed. The prior Build-55 receipt is delivery metadata, not a logo cohort
acceptance test.

## Safe next verification

1. Confirm the phone is using TestFlight 1.0.6 (55), then record the exact set ID,
   language, route, and whether the user saw a blank tile, neutral fallback, or a
   remote-logo failure. Test the six Traditional-Chinese IDs separately from a
   non-pack control.
2. Test `promo-30th-p` separately from `30thc`: the former is the published
   mapped cohort in the dated recovery record; the latter has zero recorded
   printings. Do not fabricate a `30thD` mark.
3. Keep facts-first presentation and optional image enrichment, but measure first
   content, full artwork settlement, failed artwork count, and retries on the
   actual phone before making a performance or completeness claim.

## Follow-through after the owner clarified delayed 30th rendering

The owner subsequently reported that the 30th mark did appear, after an initial
delay. It is therefore classified as a delayed presentation event, not missing
30th source artwork. The Explore set card had a concrete client-side cause for a
stale neutral fallback: its `logoFailed` boolean remained true after an initial
remote URL failed, even if later asset enrichment supplied a different URL. The
small Explore repair scopes the error to its URL and keys the native image by
that URL, so a late old error cannot hide a new valid mark. It also
publishes canonical factual set rows before the optional asset response and merges
only `images` for an exact ID-and-language match, retaining the first response's
catalogue identity.

The same bounded repair gives the existing visible language row an accessible
flag-only control for All/English/Japanese/Simplified Chinese/Traditional
Chinese/Korean, and gives Korean its own state, group, heading and route language
instead of falling through the Traditional-Chinese display branch. It does not
expand Traditional-Chinese logo coverage or substitute a 30thD asset.

The focused source/runtime checks pass, but native p95, Build-55 archive asset
membership and installed-phone behaviour remain unmeasured.

The coordinator's final actual-adapter test also found that omitted
`includeAssets` skipped optional logos despite an artwork cache lane. Its one-line
default correction, one shared all-language enrichment read, and first-tap flag
grouping correction are recorded in
`docs/releases/build55-device-feedback-repair-20261012.md`. The current local
production-profile iOS export byte-matches 130 Simplified Chinese logo files and
all six Traditional Chinese files; the signed/installed Build-55 cohort remains
unverified. The fresh public TC audit separately records 47/83 approved metadata
rows and 36 absent rows. Historical source-only statements above do not substitute
for those later checks or physical rendering proof.
