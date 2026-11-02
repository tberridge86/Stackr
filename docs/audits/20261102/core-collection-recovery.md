# Home, Search and Binders recovery — 2 November 2026

## Owner outcome and baseline

The owner reported the installed app as unsuccessful on the phone: loading remained poor, cards remained untranslated, and images were missing. The exact installed build and OTA revision are unverified. Build 63 was produced by a separate EAS production build, uploaded to Apple and observed as Testing in Team (Expo) on 1 November. The GitHub verify-only workflow was separate from that build. This confirms historical availability, not the exact binary/OTA installed on the owner's phone; see [the observed release receipt](build63-observed-availability.json). The primary navigation scope is **Home, Search and Binders**. The owner subsequently clarified that **Pokédex remains part of Binders**, including Pokémon detail.

This candidate starts from exact main `832eba78ad8bbdd8dea1d358b811f2c11bc3f013`, whose package metadata is 1.0.6 (63). The native release receipt separately identifies that source for Build 63; package metadata alone does not establish delivery or installation. It is prepared in an isolated source workspace, preserving the original checkout's unrelated edits.

## Reduced running app

- One reviewed source switch, `lib/appCapabilities.ts`, defines the core release. Only Home, Search and Binders appear in primary navigation.
- Root Stack and Tabs use Expo Router Protected routes. The regression checks every current filesystem route: scanner, market, social, seller, pricing tools and experimental routes are inaccessible, including direct navigation. The follow-up restores the hidden Binder Pokédex route and Pokémon detail. Card/set viewing, binder editing and essential account/help/legal paths remain.
- The shell no longer mounts the trade, collection-discovery, achievement, payments, push-registration or latest-feature services. Seller mode cannot restore those tabs from a saved preference.
- Core navigation starts while fonts and authentication verify. The video cover does not mount. ProfileProvider keeps a stable tree but performs no background profile read outside account setup. Core Home starts no private read for a pending/failed account. Normal Binder access requires verification; the existing scoped, unexpired saved-session path is explicitly read-only.
- Card inspection opens a small canonical card/image view in the core release, with no market, price, grading or motion-renderer work. Facts can render before optional artwork settles, and changed-card requests cannot publish stale data.
- Account sign-out retains local-device scope and checks the current account. Existing ownership writes and their saved-price snapshot accounting remain; this candidate does not claim zero price-related I/O during every save operation.

## Retrieval and presentation repairs

Home uses existing shared query/cache infrastructure for a compact collection summary and a six-name binder preview. These reads publish independently. Two simultaneous Home subscribers deduplicate to one compact RPC and one bounded binder query in the actual-module fixture. The partial six-row preview never occupies the full binder-library cache key.

Binder rows publish before optional custom-cover storage. Core library/detail loading does not start optional prepared valuation, per-card quote, showcase, achievement or started-binder prefetch work. Manual additions, quantity/ownership changes and removal remain.

Search exposes Cards and Sets. A card search does not start set, product, profile, listing or listing-stat lookups; a set search does not start a card search. The existing 120-card screen request budget is retained for compatibility. The shared canonical adapter/client caps the actual request at 50; lowering the screen budget to 36 would reduce first-page coverage while continuation is unavailable. Price/grading controls are absent while those reads are off. Existing artwork batching, language and exact-variant identity rules remain.

A reproduced display defect is repaired: fresh Japanese Varoom maps to reviewed English, but the saved-binder merge previously refreshed its picture while retaining a stale translation-pending title. The merge now carries approved aliases for the exact same printing/variant/language/native identity, including name-only refresh when artwork is missing. Quantity, finish, private facts, existing reviewed English and nonserializable provider overlays are preserved.

The six bounded live Japanese Pikachu/Varoom API samples already supplied verified English names and approved image records. Their payloads are retained in this report folder. This is not universal catalogue coverage or downloaded-image-byte verification. Missing or ambiguous identity/artwork remains explicit; no licence, translation or card edition is invented.

## Validation and limits

- `npm run test:core-collection`: actual rendered root/shell/tabs, provider-request suppression, local sign-out, card races; seven actual ProfileProvider gate cases;42 Home/Binder cases; captured-API saved-alias regression.
- Existing saved artwork, binder value recovery and renderer progress suites pass. The latter includes1,702-row pagination, optional deadline/retry and account isolation.
- Existing standalone startup-loading, startup-phases and Home startup-runtime checks pass.
- Local `npm run typecheck` and `npm run lint -- --no-cache` passed before the workspace disconnected (lint reported eight existing warnings). Later first-page coverage and fixture edits are verified by exact-head CI in the PR, not assumed local or phone passes.
- The existing navigation and Search fixtures explicitly select the relevant mode. All 16 native/gender/number/accent/grade/UUID query cases execute in both legacy All and core Cards, preserving selected language and exact variant identity.
- Independent specialists reviewed the runtime changes and actual-module tests. Their reports are [Home/Binder performance](core-home-performance.md) and [artwork/translation delivery](artwork-translation-delivery.md).
- The original live sample reported `search_pagination_unavailable`. The [retrieval follow-up](binder-pokedex-retrieval.md) applied two focused production Search migrations and preserves the reviewed SELECT and service-only invoker grants. The final API deadline repair is merged but deployment approval was declined, so live continuation is not yet accepted.
- Cold/warm phone timing, actual image rendering, gestures and installed-account journeys remain unverified for this candidate. The installed app has not changed merely because source was repaired. No new native release is claimed. The subsequent production database changes and staged API deployment are documented in the [follow-up](binder-pokedex-retrieval.md).

The earlier species/binder artwork evidence packets, Japanese identity/quality holds and real daily-history prerequisites remain separately tracked in the shared queue. Disabled features are paused; their data is preserved.

## Release handoff refresh — 2 November 2026, 14:05 UTC

PR #454 merged documentation-only commit `83339f09b04370bf37109a0220b7bf26dc1fb30a`; it changed no app code, migration or runtime configuration. GitHub's Git commit API reports the same tree `6e1a4969fc7139663fd13b40b66f1c480f12c547` for tested app head `25640b5bd2daaefa3fd30557d69aacb1a97745ed` and merged app commit `8f955ba37229632a5c0199d3549ff6011efdfd2e`.

Workspace, executor, GitHub read/write, Railway read and Supabase read access are available. The remaining connection limit is narrower: the GitHub connector has no workflow-dispatch operation, and the cloud browser available to this release-owner run is signed out. No unauthenticated dispatch or competing release was attempted.

The next existing-lane native action must read the exact current `main` SHA immediately before dispatch and use that same value as `expected_main_sha`, because `build-owner-ios-release.yml` requires the dispatched workflow SHA to equal the input. A fixed SHA in versioned release documentation is self-invalidating: merging the documentation changes `main`. PR #455's merge commit `63d7b443f835e1cc0e3edbcd52cd510fefa3842e` is retained as the last observation, not as a future dispatch input.

- `expected_main_sha=<exact current main read from GitHub immediately before dispatch>`
- `expected_backend_sha=a7bbec03d302d272737d83d0c5a85fc479e85ff5` **only after the staged API deployment is approved and its live source is verified**
- `verify_only=false`
- `build_profile=production`

The last observed production API remains Railway deployment `c40b25c1-b1a3-49d1-aed2-df0fc0852228`, whose public health response attested backend source `0bf2e6022264`, environment `production` and Supabase project `oakdbbzdqwurpjnoqhmu`. Native build, OTA, TestFlight availability and installed-phone acceptance for this core candidate remain unverified.



## Binder Pokédex and retrieval follow-up — 2 November 2026

Pokédex remains reachable from Binders; Home, Search and Binders remain the three primary tabs. PRs [#457](https://github.com/tberridge86/Stackr/pull/457) and [#458](https://github.com/tberridge86/Stackr/pull/458) merged the client fixes, exact native-name index, parameter-aware execution and bounded cold-translation budget. Final tested head `a7bbec03d302d272737d83d0c5a85fc479e85ff5` and merge `3729e40a3b6975b49c86fea3c4df5a083483c2ba` have the same tree. The final ten applicable CI checks pass; the path-gated release-candidate job is skipped.

**Native release remains paused.** The production API source pin is staged in Railway patch `6760f37e-07d2-4f20-b1d5-42d41ffee8b0`, but the deployment tool returned “the user did not approve this action” and no deployment ran. The last successful API deployment/source remains `c40b25c1-b1a3-49d1-aed2-df0fc0852228` / `0bf2e60222644682d600deb7cc0e94862fd2a71a`. The existing server can still reject continuation at 450 ms. Approve the staged source, verify its health attestation and consecutive live Japanese pages, then use the existing native lane with a freshly read current main SHA. Do not count a staged change, source merge or database fix as a native delivery or phone pass.

See [the follow-up report](binder-pokedex-retrieval.md) and [bounded evidence](binder-pokedex-retrieval-evidence.json). All 49 existing repair issue objects remain preserved; unresolved artwork and identity holds are not closed by this change.
