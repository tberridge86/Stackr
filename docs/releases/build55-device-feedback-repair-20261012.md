# Build 55 device-feedback repair candidate

The owner reported a CoroCoro exit when opening its catalogue link from Discover,
a misplaced/flashing startup logo, delayed or missing artwork, slow cold
retrieval, missing Traditional Chinese marks, and a request for direct language
flags. The 30th mark subsequently appeared; that report is a delivery delay,
not proof that its source image is missing. The owner says Pokédex now works,
but remains slow on cold start.

**Delivery state:** local repairs tested and independently reviewed; not merged,
deployed, published, or verified on the phone. The exact installed build and
whether the exit reaches the iPhone Home Screen remain unconfirmed. Build 55 is
available to internal TestFlight testers; the owner report is presumed to concern
that release, not an attested installed-build receipt.

Base application source is `0188361a1b1e278ea180f9eec5ec487af52ca8cd`.
The repair branch is `agent/release/tif-build55-device-repairs-20261012`.
Existing architecture, navigation, exact printing/finish/language, pricing,
ownership, privacy, persistence and release gates remain in place.

## Confirmed findings and bounded adjustments

| Existing element / specific issue | Small adjustment | Verification and remaining limit |
| --- | --- | --- |
| CoroCoro cover reads `window.location.hostname` whenever `window` exists. React Native sets `window = global` without a browser `location`; the initial library cover throws. | Read a hostname only on web, with optional `location`. | Actual cover/native-like `window: {}` reproduction fails before the repair and passes afterwards. Actual library, Monthly and issue-detail mounts pass. Physical termination/fix proof remains open. |
| Preferred set reader treats omitted `includeAssets` as false, while `fetchAllSets` caches that call in its artwork lane. Published remote logos can therefore never be requested. | Return facts early only for explicit `includeAssets: false`. | Actual adapter/manifest functions reproduce zero manifest calls before repair, then four existing asset-type lanes after repair; exact logo merge and preserved usable mark pass. |
| Discover waits for optional marks before exposing sets; separate language calls can repeat global manifests. | Publish each language's facts immediately; share one existing all-language artwork reader and merge images only by set ID and language. | Actual Explore renderer proves useful facts while artwork is deferred, one shared reader across all five languages, ignored obsolete loads, and retained marks when enrichment has no replacement. Phone speed remains unmeasured. |
| Discover logo failure is a sticky boolean. A previous URL error can hide a later valid mark. | Track the failed URL and key the native image by its URL. | Actual renderer invokes the old error after refresh and verifies the current logo remains visible; a current URL failure uses the honest fallback. |
| Flags are hidden in the filter sheet; Korean has no loaded group. Selecting another language can use groups hidden by the previous filter. | Add the existing five language flags and All/reset visibly; load/group Korean; expand the selected language from its searched facts and preserve route language. | Actual screen switches through all five flags and checks only the corresponding rows, plus Japanese ID/language navigation. Existing filter/search/expand controls remain. Physical VoiceOver/large-text review is open. |
| Set/card facts without images can appear as unavailable while canonical artwork is still pending. Cached metadata-only Card Detail never tries that canonical recovery. | Show `Loading artwork…` during the existing optional read. Cached Card Detail invokes existing canonical enrichment and strict image-only merge, with per-route abort/late guards. | Complete Set/Card TSX tests prove pending, exact arrival, exhaustion, and stale account/route suppression. Existing strict printing/language/finish merge suite passes. No alternate printing or invented art is used. |
| Native launch shows the completed logo before the video begins unformed; native/player frames differ. | Use a full-resolution still extracted from the approved video's first frame for native launch, retain the completed poster for reduced motion, and gate the same centred 320px player on layout/first-frame readiness. | Original MP4 SHA-256 is unchanged. The installed Expo plugin generates a centred 320×320 image view. Motion, completion, timeout, auth routing and cleanup checks pass. Native compilation and phone handoff remain unverified. |
| Pokédex waits indefinitely for a persisted-cache read before requesting its first public page. | Reuse the existing optional-read helper with the established 25ms disk budget; abort the handoff on unmount. | Actual complete screen test fails with a stalled cache before repair, then starts remote facts after the controlled deadline, shows 151 rows, ignores late disk data, retains fast complete cache, and persists only validated complete results. This is not a measured 25ms phone result or p95. |

## Artwork and logo reconciliation

The local production-profile iOS Metro/Hermes export completed on
2026-10-12T07:31:17.484Z. It contains 718 asset-table entries. A byte comparison
confirms **130/130 referenced Simplified Chinese logo files and 6/6 referenced
Traditional Chinese files** are in that export, unchanged. Both mapped 30th
references remain in source. This is local bundle evidence; the signed Apple
archive and installed phone have not been inspected for this cohort.

The public Traditional Chinese population is **83 sets**. The complete public
set-logo manifest has **47 approved rows with delivery URLs**; **36 sets have no
public logo metadata**. These are metadata observations, not decoded-image,
resolution, rights, or phone-rendering acceptance. The six local marks are among
the 47 public rows and cannot establish coverage for all 83 sets. Exact missing
identities and bounded source reconciliation are in
`docs/audits/20261012/traditional-chinese-logo-gap-register.md`.

A single cold desktop manifest read took 2440.5ms, beyond the existing optional
2s deadline; a later desktop read took 285.6ms. The deadline remains in place.
This leaves a cold-delivery risk to test, not an established phone root cause or
p95 claim. No per-set retry loop, new provider, speculative logo, source borrowing,
catalogue mutation or paid service was introduced.

CoroCoro retains 26 exact supplied covers for 34 documented issue slots. The
remaining eight keep the explicit no-cover placeholder; no issue/card association
was changed to mask a missing image.

## Validation

- Typecheck passes. Scoped lint has zero errors and five pre-existing array-style
  warnings in untouched adapter declarations.
- Mobile-recovery checks, including the new actual screen/default-option cases,
  pass. Startup routing and Pokédex release checks pass.
- Set/Card exact-artwork and account-boundary checks pass in the helper handoff.
- Server-delivery, personal-loading and integration checks pass. The historical
  Build-48 fixture was updated to include Korean and defer the shared artwork read;
  its previous missing-setter failure was a fixture mismatch, not a phone result.
  Hosted exact-head checks remain separate from local checks.
- Independent review accepted the repaired source scope with no P1/P2 finding.
  The source-crash reproduction does not close the owner-reported physical crash.
- Local iOS export passes; this is neither native Xcode compilation nor a new
  signed build/TestFlight submission. Expo's release-build splash verification
  guidance applies: <https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/>.

## Next release and phone acceptance

Approval is required for the concrete reviewed merge/native publication. The
native splash change requires a new signed build; an OTA alone is insufficient.
Keep normal production profile/channel and existing recognition/commerce gates.
Use the existing backend source receipt and compatibility/delivery gate; this
candidate changes no backend files or database/catalogue data. Main-branch service
deployments may still follow the existing configured watchers after an approved
merge. No unrelated staged configuration is included.

On the matching next build, record iPhone 15 Pro/mobile-data results for:

1. Fresh launch: stable centred intro, completion, reduced motion and no trap.
2. Discover → CoroCoro → Monthly → May 2001 → card details → back, and a placeholder
   issue. A deliberate external **Source** link is a separate browser handoff.
3. Every language flag, especially switching directly between two languages;
   the six local TC controls, a published non-local TC mark, and an absent-metadata
   control; both identified 30th references.
4. Cold and warm set/card/Pokédex: first useful facts, settled artwork and genuine
   unavailable art, route/account switches, retry and offline recovery.

The reported physical CoroCoro failure remains P1 until that journey passes on
the matching installed candidate. Catalogue-wide artwork/resolution, 100-observation
latency cohorts, scanner trials and operational observation windows remain open.
Do not mark Stackr production-ready or promote it publicly from local tests alone.
If a new fault appears, stop further promotion and prepare a bounded follow-up;
do not silently publish an OTA or call the previous faulty CoroCoro build known-good.

## Cold-start follow-through requested 12 October

The same PR now includes the owner's immediate/deferred/lazy startup request.
See [the focused startup receipt](../performance/cold-start-20261012.md) for
font/auth parallelism, ready-screen intro handoff, deferred services, coalesced
Home loading, account/cache guards, tests and the pending device measurements.
Earlier hosted check results in this receipt apply to the earlier candidate head;
they must not be reused as the new head's CI evidence. The intro asset remains
unchanged but may yield to a ready destination before playback ends.
