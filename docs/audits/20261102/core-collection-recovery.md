# Home, Search and Binders recovery — 2 November 2026

## Owner outcome and baseline

The owner reported the installed app as unsuccessful on the phone: loading remained poor, cards remained untranslated, and images were missing. The exact installed build and OTA revision are unverified. The preceding iOS workflow was verify-only and produced no Build 63, so the phone report cannot be attributed to Build 63. The current requested scope is **Home, Search and Binders only**.

This candidate starts from exact main `832eba78ad8bbdd8dea1d358b811f2c11bc3f013`, whose package metadata is 1.0.6 (63). That source version is not evidence of an uploaded or installed Build 63. It is prepared in an isolated source workspace, preserving the original checkout's unrelated edits.

## Reduced running app

- One reviewed source switch, `lib/appCapabilities.ts`, defines the core release. Only Home, Search and Binders appear in primary navigation.
- Root Stack and Tabs use Expo Router Protected routes. The regression checks every current filesystem route: scanner, market, social, seller, Pokédex, pricing tools and experimental routes are inaccessible, including direct navigation. Card/set viewing, binder editing and essential account/help/legal paths remain.
- The shell no longer mounts the trade, collection-discovery, achievement, payments, push-registration or latest-feature services. Seller mode cannot restore those tabs from a saved preference.
- Core navigation starts while fonts and authentication verify. The video cover does not mount. ProfileProvider keeps a stable tree but performs no background profile read outside account setup. Core Home starts no private read for a pending/failed account. Normal Binder access requires verification; the existing scoped, unexpired saved-session path is explicitly read-only.
- Card inspection opens a small canonical card/image view in the core release, with no market, price, grading or motion-renderer work. Facts can render before optional artwork settles, and changed-card requests cannot publish stale data.
- Account sign-out retains local-device scope and checks the current account. Existing ownership writes and their saved-price snapshot accounting remain; this candidate does not claim zero price-related I/O during every save operation.

## Retrieval and presentation repairs

Home uses existing shared query/cache infrastructure for a compact collection summary and a six-name binder preview. These reads publish independently. Two simultaneous Home subscribers deduplicate to one compact RPC and one bounded binder query in the actual-module fixture. The partial six-row preview never occupies the full binder-library cache key.

Binder rows publish before optional custom-cover storage. Core library/detail loading does not start optional prepared valuation, per-card quote, showcase, achievement or started-binder prefetch work. Manual additions, quantity/ownership changes and removal remain.

Search exposes Cards and Sets. A card search does not start set, product, profile, listing or listing-stat lookups; a set search does not start a card search. The initial card page is bounded to36. Price/grading controls are absent while those reads are off. Existing artwork batching, language and exact-variant identity rules remain.

A reproduced display defect is repaired: fresh Japanese Varoom maps to reviewed English, but the saved-binder merge previously refreshed its picture while retaining a stale translation-pending title. The merge now carries approved aliases for the exact same printing/variant/language/native identity, including name-only refresh when artwork is missing. Quantity, finish, private facts, existing reviewed English and nonserializable provider overlays are preserved.

The six bounded live Japanese Pikachu/Varoom API samples already supplied verified English names and approved image records. Their payloads are retained in this report folder. This is not universal catalogue coverage or downloaded-image-byte verification. Missing or ambiguous identity/artwork remains explicit; no licence, translation or card edition is invented.

## Validation and limits

- `npm run test:core-collection`: actual rendered root/shell/tabs, provider-request suppression, local sign-out, card races; seven actual ProfileProvider gate cases;42 Home/Binder cases; captured-API saved-alias regression.
- Existing saved artwork, binder value recovery and renderer progress suites pass. The latter includes1,702-row pagination, optional deadline/retry and account isolation.
- Existing standalone startup-loading, startup-phases and Home startup-runtime checks pass.
- TypeScript and lint have been run locally. Their final results and exact remote CI head belong in the PR/release receipt, not an assumed phone pass.
- Independent specialists reviewed the runtime changes and actual-module tests. Their reports are [Home/Binder performance](core-home-performance.md) and [artwork/translation delivery](artwork-translation-delivery.md).
- Live sampled search reports `search_pagination_unavailable`. The client retains an incomplete-results state. No production SQL/RLS change or fabricated complete-search claim is included.
- Cold/warm phone timing, actual image rendering, gestures and installed-account journeys remain unverified for this candidate. The installed app has not changed merely because source was repaired. No new native release or production mutation is claimed here.

The earlier species/binder artwork evidence packets, Japanese identity/quality holds and real daily-history prerequisites remain separately tracked in the shared queue. Disabled features are paused; their data is preserved.

