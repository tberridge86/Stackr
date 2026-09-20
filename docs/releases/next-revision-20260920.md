# Next normal Stackr revision — 20 September 2026

The owner requested that the recurring TestFlight checker be removed and all
completed changes be pushed together to the next revision. The checker
`finish-stackr-1-0-4-testflight` was deleted; no replacement monitor is active.

## Combined source

The integration starts from reviewed main
`37817f2cb83b026206d5c6e4602bd44d69f690bd` (PR216). It includes the general-price
client plus the Settings, Help/Legal, card-inspection, artwork and pricing work
already integrated through PR210, PR214 and PR215. Original dirty `D:/Stackr-1`
was preserved.

This revision isolates the completed loading-screen design from the later local
design task: shared vector brand artwork, card assembly/wordmark animation,
responsive sizing and the dedicated preview. The app shell mounts behind a
bounded launch overlay; existing font fallback, sign-in routing, Home retry/error
handling, providers and runtime configuration remain in place. The overlay must
dismiss even if the animation completion callback is lost. Reduced Motion and
screen-reader isolation are part of the affected checks.

No new native dependency, backend contract, catalogue mutation or database
migration is required by this loading integration. The new client retains normal
production channel and runtime `1.0.4`.

## Pricing already live on the server

PR216's backend, gateway and prepared valuations are deployed. The independently
verified generation at 15:26:49 UTC prices **266 of 366 copies**: 166 exact and
100 labelled general estimates. **GBP 217.62 is the priced subtotal**, with
100 copies still unknown. All 266 values retain their older-provider estimate
classification. All 16 binders and 49 checked summary components reconcile.

Four bounded batches saved 81 positive base quotes; 12 distinct candidates had
no quote or provider mapping, and no refresh failed. General estimates are
maintained by the existing owner worker at 30 identities every six hours.
Prepared app reads and preparation remain enabled. Catalogue-wide sweeping,
expanded provider capacity and the prepared refresh queue remain disabled.
Build 46 retains its exact outer summary; general totals need the new client.

## Release capacity and exact native identity

A fresh read-only EAS account query at 16:32 UTC reports the existing account on
the Free plan, with **15 of 15 iOS builds used**. The cycle resets on
**1 October 2026**. No financial account change has been made.

The preceding request for 1.0.4 (47) was rejected by that quota after source
upload. No build 47 exists remotely, but its build number was consumed. The latest
accepted normal native artifact is build 46, EAS
`a92675d2-fec1-4977-a72b-d623f69dd577`, source
`d5965bb5a824f49aa8a75cd2c70316b47b09b8ef`.

Once capacity is available, reconcile the remote inventory and build-number
counter again before requesting the exact merged candidate. The next expected
number is **48 if the counter remains 47**. Do not reuse a failed request marker
or submit an unspecified latest build. Pair the exact EAS source receipt with
the signed IPA identity check before submitting to the existing TestFlight
groups. No App Store publication or OTA safeguard bypass is authorized here.

## Deliberate exclusions and open acceptance

- The separate standard-camera branch `8a0a14189a69c2217647a90f46b9f7092b0557d2`
  is temporary intake diagnostic code based on older build 45 source. It does not
  establish or implement a completed camera fix and is not included. Physical
  capture/save/reopen, background/resume and fresh-launch acceptance remain open.
- The newer design task did not provide an independently verified, committed
  fix for all enlarged-card background crops. Unrelated dirty image changes are
  not represented as completed by this loading integration.
- Remaining artwork sources, real-card foil fidelity, price coverage/freshness
  and owner-signed-in Home/Binder display remain unverified or incomplete.
- Existing build 46 Apple review and this new client are separate. Apple approval
  for build 46 cannot deliver the newer general-price or loading-screen client.

## Validation

Local checks passed: `npm run typecheck`, `npm run lint` (10 existing warnings,
zero errors), `npm run test:ux-service-release`, `npm run test:startup-loading`,
`npm run test:mobile-runtime-config`, changed-file ESLint and `git diff --check`.
Independent review checked native SVG/dependency compatibility, loading bounds,
reduced-motion recovery, screen-reader isolation and the hard dismissal deadline.
The root lifecycle regression test covers normal completion, a missing animation
callback, unmount cleanup and the dedicated preview route. Recovery screens keep
their existing retry actions and a static brand when `busy` is false.

The matching pull request records exact-source CI and the merged source. The
separate full-platform release-candidate assessment is not invoked by standard
PR CI. A merged candidate is not a delivered native app or physical-phone
acceptance. Build capacity remains the concrete native delivery blocker.
