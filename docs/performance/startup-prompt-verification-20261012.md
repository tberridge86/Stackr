# Startup prompt verification — 12 October 2026

The owner asked for verification of the already performed immediate/deferred/lazy
startup work. This is an audit of application source
`5eb3dff53226a202743c5494eef63618ab3d3e13` in draft PR337, whose application base
is `0188361a1b1e278ea180f9eec5ec487af52ca8cd`. The Windows checkout was initially
behind at `c7ccb3d`; it was fast-forwarded to the existing reviewed implementation
before conclusions were drawn. No duplicate startup rewrite, dependency change,
database mutation, deployment, native build or publication occurred in this audit.

## Prompt matched to the existing app

| Requested work | Current implementation | Verdict and limit |
| --- | --- | --- |
| Immediate essential work | Native splash control, lightweight diagnostics, auth/profile restoration and haptic preference. Auth/profile mount while bundled fonts load. | Implemented. Identity/routing recovery and account fences remain essential; deferring them would risk changing access or the selected destination. |
| Deferred optional work | Latest-features UI and push services wait until the opening overlay leaves and interactions settle. Push registration waits another second and retries at most twice; Home secondary reads follow its interaction/defer path. | Implemented. Actual service/Home runtime checks pass for cancellation, retry and account changes. Async/delayed JavaScript is not a new native background thread. |
| Lazy initialization | App shell, feature announcements, notification/device modules and card-inspection viewer are evaluated when requested. | Implemented. Lazy evaluation does not prove a smaller native binary or faster physical launch. |
| I/O and cached first content | AsyncStorage/network calls are asynchronous. Home starts cached and fresh work independently; slow storage cannot hold a fresh result and late cache cannot overwrite current data. | Implemented. Actual Home hooks cover ten scenarios, including pending/failed valuation, stale account results and cache/live ordering. The test uses mocked transport/native modules and a state probe. |
| System splash and navigation | Existing Expo native splash configuration provides the opening still. Native splash hides on root layout. A committed, laid-out destination or retry state can dismiss the video early. Preview, reduced motion and recovery deadlines remain. | Implemented. No new SplashActivity or alternate routing architecture. Native splash/first-frame behaviour still needs a signed-device run. |
| Native initializers and dependencies | Expo prebuild/config plugins generate the native app; no checked-in Application/AppDelegate implementation was found to rewrite. On iOS, StripeAppProvider.native.tsx mounts the native StripeProvider with the shell; the generic fallback is a Fragment. | Native Stripe initialization remains a profiling candidate, not a confirmed launch blocker. Native library/initializer costs cannot be measured from this Windows audit. |
| Profiling | Bounded device-local JS phase marks exist for root mount/layout, shell layout, navigation readiness and overlay removal. | Prepared, not physically measured. Their origin is after JavaScript starts; they do not cover OS process creation or native pre-JS work. Xcode Instruments App Launch remains required for iPhone proof. |

The established implementation follows the requested three buckets. The audit
does not certify that startup speed is solved: measured launch-to-first-frame,
launch-to-interactive, first correct content and settled artwork remain separate.

## Checks actually performed in this audit

- Re-ran `npm run test:startup-loading`: routing/timeouts, profile state, deferred
  service/ready-signal runtime checks and ten actual Home-hook scenarios pass.
- Re-ran `npm run test:startup-video`: original video hash, motion, layout handoff,
  ready-screen early dismissal, font error/deadline and cleanup checks pass.
- Refreshed PR337 at runtime head `5eb3dff`: ten hosted checks succeeded, none
  failed or pending; full-platform release and canary evidence were skipped.
  Skips are not passes or physical-device acceptance.
- Two independent source audits covered provider/async state and import/native
  configuration. No blocking startup-speed fault was confirmed by these checks.
  Their performance findings below remain unmeasured optimization opportunities.

## Residual performance opportunities

CollectionProvider still reaches binder/catalogue code through static imports
when the lazy shell is first evaluated. That import path is confirmed, but its
time and frame impact are unmeasured. Native StripeProvider also mounts with the
shell, and its initialization cost needs a native trace. Collection/Trade issue legitimate
ownership/account reads after commit; Achievement and query-cache restoration
can add work. Trace these together before changing eligibility or access fences.
Do not label asynchronous requests synchronous main-thread I/O or classify an
import path as a measured P1 startup failure.

Fonts still load through the existing runtime aliases with a bounded fallback.
Expo's build-time font embedding is a possible later optimization if the trace
shows material font cost; preserve actual iOS/Android names and Stackr typography
before changing that configuration. No speculative Metro-wide inline-require
change, native SDK removal or provider-delay redesign was made.

## Separate confirmed release blocker: achievement account race

The current AchievementProvider has a pre-existing account-boundary fault,
separate from startup speed. An actual provider/consumer renderer fixture begins
a delayed Account A achievement/coin read, switches to Account B, publishes B's
22 coins and unlock, then resolves A's old read. The current component replaces
the display with A's 11 coins/unlock. The expected stale-response assertion fails:

```text
Late Account A coin response must not replace Account B.
11 !== 22
```

The independent audit and coordinator each ran that reproduction. These are
synthetic accounts/values, not actual owner records or a tested server-side coin
mutation. The global achievement notifier also passes unlocks without account
provenance, so adding only a superficial late-read guard would not close its
separate toast/enqueue path. Track the finding as
`ACHIEVEMENT-ACCOUNT-BOUNDARY-001`, P1, reproduced and unrepaired. Initial render
masking, A/B/ABA generations, current-only notifications, sign-out and unmount
must be verified together while preserving reward and coin rules.

This audit does not change achievement code or claim the race is repaired.
Production-readiness and live approval remain blocked by known unresolved
high-priority defects. The signed-device CoroCoro acceptance is also still open.

## Required next evidence

1. Prepare and independently review the separate achievement/account repair with
   actual component and notifier/service tests. Preserve reward semantics and
   current legitimate reads; do not infer a startup speedup from that repair.
2. Deliver the exact reviewed native candidate only after concrete approval,
   then compare it with the prior build on the same iPhone 15 Pro over mobile data.
3. Capture native launch-to-first-frame and interactive/content/artwork milestones
   for retained signed-in cache, empty cache, slow/offline network, signed-out and
   deep-link starts, with warm controls. A ten-run diagnostic is not p95 acceptance;
   retain the agreed 100-observation conditions before any p95 claim. Optimize only
   demonstrated costly modules/operations. Do not clear real owner collection data.

References: [React Native 0.81 JavaScript loading](https://reactnative.dev/docs/0.81/optimizing-javascript-loading),
[Expo SDK54 fonts](https://docs.expo.dev/versions/v54.0.0/sdk/font/),
[Apple launch profiling](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time),
and [Supabase auth-event handling](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
