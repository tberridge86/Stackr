# Owner testing: card reuse, haptics and detail images

This client update is compatible with TestFlight **1.0.3 (27)** and owner runtime `1.0.3-owner-recognition-v1`. It uses the existing production API and captured artwork recovered in [the production bridge](api-production-bridge-20260908.md).

- Home and other card-reference readers share concurrent resolutions and reuse successful results for 45 seconds. Each API client has a maximum of 256 entries; reference case, language and selected set remain distinct. Empty results and errors are retried, and explicit catalogue refresh invalidates cached and in-flight work.
- The mounted collector/seller tab bar and binder long-press detail action use the existing preference-aware haptic helper. No native dependency or runtime change is introduced.
- Binder detail displays its stored image immediately. When it lacks a separate full-size image, it requests the exact canonical variant already attached to the row and verifies variant and language before upgrading. It does not search by name or substitute a printing's sibling finish. A failed upgraded image retains the original same-card image, without overriding edition-specific art.

The server correction in PR #153 resolves exact name-plus-set matches before the broad collector-number fallback. After deployment, `Pinsir sv08.5` returned two exact matches, Abyss Eye returned 118 variants with 70 images, and CP1's logo manifest returned its stored public image. Cold samples took 1.8–3.3 seconds. Subsequent edge-cache responses took 145–322 ms and were marked stale-while-revalidate. This is not a guarantee of sub-half-second cold loading.

Focused cache tests cover sharing, client/language/set/case isolation, expiry, failure/empty retries, invalidation during in-flight work and eviction. Binder presentation checks cover variant/language guards, haptics and same-card image fallback. Full app typecheck, lint and CI are required before the owner update is published; the final release receipt records the served update and bundle verification.

Captured catalogue membership and recovered art are preserved. Missing images, unverified Chinese artwork, incomplete translations and limited exact-identity pricing coverage remain documented in the production bridge. The update does not retrain recognition or enable commerce fulfilment.
