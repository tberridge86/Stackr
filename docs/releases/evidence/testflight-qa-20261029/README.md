# Authenticated TestFlight service QA — 29 October 2026

Corrected candidate: `9849656a85dcf9016fdf8fcfe1d2037cbe9237d9`, tree
`271271c4a885e690013ccdd094ca0bdeee58b13f`, PR #446.
The fourteen pinned application reader modules are unchanged from reviewed
`334cf9e80423130716b5c67860872124f1fc0386`.

## Corrected service result

[Corrected receipt](home-authenticated-corrected.json), observed
2026-10-29T18:58:47.709Z through 2026-10-29T18:59:00.374Z:

- Designated-account sign-in and verified identity succeeded.
- All 56 HTTP responses were 200, including all eight prepared-valuation GETs.
- Eight serial/concurrent cold, immediate-warm, force-facts and local-invalidation
  scenarios completed. Every recorded data stream exhausted through an empty page.
- Cold serial/concurrent facts were exactly equal. Prepared collection revisions
  matched each requested revision and matched between the paired cold reads.

| Captured population | Result |
| --- | --- |
| Collection facts | 18 binders; 472 saved placements; 309 owned rows; 342 owned quantities |
| Saved placement languages | 429 en; 42 ja; 1 zh-cn |
| Prepared summary coverage | 391 total units; 371 priced; 20 unpriced |
| Prepared price provenance | 180 exact-priced; 191 general estimates; all 371 priced units stale |

Prepared responses had an available summary (`state=ready`) with
`freshness=partial` and `earlyEligible=false`. This is not a complete or fresh
valuation. The facts and valuation totals above describe their separately
reported populations; this service experiment does not reconcile their denominators.

## Preserved initial failure and correction

[Initial receipt](home-authenticated-initial-device-header-failure.json) used
source `334cf9e80423130716b5c67860872124f1fc0386`. Collection facts succeeded,
but all eight prepared GETs returned HTTP 400. A separate authenticated diagnostic
identified `invalid_device_id`, request
`9afd1d91-257d-4da2-b12a-cc34d15edaf8`.

The harness injected an empty device ID. The deployed and candidate gateway both
require `X-Stackr-Device-Id` containing 8–128 safe characters for authenticated
routes; both already contain the valuation route. The application supplies its
normal stored device identity. The two-file tooling correction supplies one
transient random UUID per measurement run. Offline regression checks enforce the
gateway contract, reuse across scenarios, separation between runs and receipt
redaction. The old empty-getter negative control failed; the restored focused
suite and syntax checks passed. Independent scoped review found no blocker.

## Limits and release meaning

These are desktop HTTPS service observations from one designated account and one
paired sample, with client-memory cache conditions. They establish neither phone
rendering nor real account switching, holding/binder edits, offline navigation,
price correctness across the catalogue, or faster Home loading. No speed
improvement is claimed.

The harness permits only sign-in and named GETs. It makes no price-refresh POST or
holding write; the acknowledged prepared GET may update existing generation
metadata. Receipts contain counts, hashes, statuses and timings, without raw
credentials, tokens, private row identities or notes.

This evidence does not establish a merge, service deployment, signed native build,
submission, tester availability or installed-phone acceptance. Continue the
existing scoped release sequence and retain partial/stale/unpriced states.
