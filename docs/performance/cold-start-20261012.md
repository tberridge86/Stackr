# Stackr cold-start follow-through — 12 October 2026

Parent: PR #337, `c7ccb3ddbd6c87485767b41d1831ed60ff13c1a7`.
Main inspected: `0188361a1b1e278ea180f9eec5ec487af52ca8cd`.
The owner asked Tif to execute immediate/deferred/lazy startup work. This pass
extends the existing candidate in an isolated Linux checkout; it does not change
the owner's Windows worktrees. Build 55's receipt is prior release evidence,
not evidence that these changes are on the phone.

## Source findings and changes

| Bucket | Work and reason |
| --- | --- |
| Immediate | Keep native splash control, fetch diagnostics, haptic preference and essential auth/profile checks. Auth/Profile now mount while bundled fonts load, removing the former fonts → provider mount → auth dependency. Profile remains dependent on settled authentication. |
| Deferred | Latest-features UI and push registration begin after navigation/recovery has committed, the overlay has left, and initial interactions settle. Push registration has one account-scoped effect, a one-second initial deferral and at most two retries (5s/10s) for transient failures. Home secondary notification, chase, activity and Minty reads follow interactions plus the existing 180ms delay. |
| Lazy | The navigation/provider shell is evaluated when needed using React.lazy; the optional modal and notification service modules are evaluated when deferred work becomes eligible. Card inspection already lazy-loads its renderer and remains unchanged. |
| Cached/fresh content | Focus and session events converge on one Home bootstrap per account/focus. Cache reads coalesce; fresh reads proceed without waiting for disk restoration. Account generations reject stale work, and live/cache precedence preserves current data. Pricing provenance, GBP and history contracts remain intact. |

The approved intro MP4, preview and Reduce Motion behavior remain. A committed,
laid-out destination or retry UI can now dismiss the overlay before playback
ends. Video completion, font error/deadline and the hard media deadline retain
recovery routes. A destination shell is not evidence that remote cards or images
have finished loading.

No JavaScript task has been relabelled a background thread: promises and delayed
callbacks schedule work, but synchronous computation still runs on the JS thread.
No broad Metro inline-require change, dependency upgrade, data migration or
unmeasured native initializer rewrite is included. The checkout uses Expo
prebuild/config plugins, rather than checked-in Android Application/AppDelegate
files. Existing native splash configuration remains the reviewed PR #337 version.
No crash reporter is disabled or deferred; diagnostics remain registered early.

## Local validation

- `npm run test:startup-loading`: routing/timeouts/profile state plus actual
  startup-service and Home-hook runtime checks. Both new scripts are wired into
  the existing CI entrypoint.
- `npm run test:startup-video`: approved media handoff, motion, cleanup, typography,
  ready-screen early dismissal, font failure and hard deadline.
- Commerce release lock, Home release integration, live-price refresh and #304
  pricing/history regression scripts.
- TypeScript, scoped lint and `git diff --check`.
- Production-profile iOS Metro/Hermes export. This is a bundle export, not native
  Xcode compilation, installation or App Store submission.

The runtime tests mock network/native dependencies. The Home test executes the
actual screen hooks, loaders and effects with its final visual JSX replaced by a
state probe. Neither test is physical rendering or end-to-end phone evidence.
Independent review caught missing notification retries and a cache/live ordering
edge case. Both corrections are included, and final independent review has no
remaining blocking findings. Home has ten runtime scenarios, including delayed
cache with pending/failed fresh valuation. Scoped lint has zero errors and two
inherited Home duplicate-import warnings. The personal-loading suite and all
13 card-first UI tests also pass.

Final exported Hermes bundle: `entry-223a2e590a61e25b326a10035efdac90.hbc`; SHA-256
`930d23d7b7565a214abc7078a4ede7bc10a4f5711739dad22d021cca7c379784`.

## Device measurement still required

`getStartupObservation()` in `lib/performance.ts` returns a bounded, device-local
set of monotonic JS phase timestamps: root mount/layout, shell layout, navigation
readiness and overlay removal. It sends nothing remotely and records no account,
query or card identifiers. Its origin is the first JS startup mark; it cannot
measure OS process creation or the pre-JS/native launch interval.

On the signed candidate, record source SHA, native version/build, served OTA,
device/OS, network and cache state. Use Xcode Instruments App Launch for iOS and
Android Macrobenchmark/Profiler for a generated release Android build. Capture
OS launch-to-first-frame, launch-to-interactive-shell, first correct cached/live
Home content, and image settlement separately. Inspect JS/native stalls and
request counts; do not substitute an endpoint latency for phone startup.

Use the same device/build settings for parent and candidate. Start with 10 cold
process launches per condition (retained signed-in cache, empty cache, slow/offline
network), plus warm controls and signed-out/deep-link starts. Report failures and
sample counts; a 10-launch diagnostic is not population p95 acceptance. Check
Reduce Motion, expired session, profile retry, account switch, foreground return,
notification retry and an immediate first Search/Binder/Pokédex interaction.
Never clear shared production caches or remove real collection data to benchmark.

**Delivery:** implemented and locally tested; merge, signed-build publication and
installed-device verification remain pending. No seconds-saved, cold p95 or overall
completion percentage is claimed. Existing PR #337 native splash changes still
require a new signed build; an OTA alone cannot deliver the complete candidate.

## Rollback and references

Revert this follow-through commit to recover PR #337's prior behavior; there is
no database/config migration to undo. Keep the original #337 artwork and CoroCoro
repairs. Release coordination owns final approved merge/native delivery.

- React Native: https://reactnative.dev/docs/optimizing-javascript-loading
- Expo SDK 54 fonts: https://docs.expo.dev/versions/v54.0.0/sdk/font/
- Expo splash screen: https://docs.expo.dev/versions/latest/sdk/splash-screen/
- Supabase auth callbacks: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
