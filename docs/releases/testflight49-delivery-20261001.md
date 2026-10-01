# Normal TestFlight build 49 — delivery checkpoint

> **Delivery pending.** EAS has finished the final normal-production iOS build and its submission is queued. Apple processing, TestFlight availability, and phone acceptance remain pending. Read-only production-channel checks found no OTA update groups.

## Frozen source and review state

| Item | Verified state |
| --- | --- |
| Final merged source | `c6795069c57e32c7ea53f11326f9206379b48d1e` (identical final integrated tree) |
| Included feedback repairs | [PR #293](https://github.com/tberridge86/Stackr/pull/293), merged before the final source |
| Included image-delivery change | [PR #295](https://github.com/tberridge86/Stackr/pull/295), feature head `97f69d3f0528fb22f37b31f68b1dcf4bce815aa4` |
| Included holo polish | [PR #296](https://github.com/tberridge86/Stackr/pull/296), feature head `82d9352416bf0eabe3af12dc80b668b0f4753fd0` |
| Applicable CI | All 8 applicable checks passed. The existing release-candidate assessment was skipped under its invocation rules; it is not a pass. |
| Final production review attempt | [Run 36885846750](https://github.com/tberridge86/Stackr/actions/runs/36885846750) was approved, then stopped before EAS dispatch because `EXPO_TOKEN` was unavailable. No approval was bypassed and no credential was changed. |
| Current delivery lane | `feedback49-final` produced the exact finished EAS build and one queued submission recorded below. Apple and device evidence remain required before delivery is claimed. |

The earlier request from source `83394561744ac7d4031b029d8bfe13290ab4622f` created EAS build `03492deb-7227-48d0-8d07-cf597274c6ad`, then reached `CANCELED` before submission. At that checkpoint, official EAS and Apple checks found zero build-49 submissions and zero Apple build-49 records. The unused remote counter reservation was restored to build 48 before requesting the final build recorded below. No earlier candidate was uploaded to Apple.

## Accepted EAS build and queued submission

| Field | Verified state |
| --- | --- |
| EAS build | `c7ddf691-b730-481f-85de-f8a117d9a2c1` |
| Source | `c6795069c57e32c7ea53f11326f9206379b48d1e` |
| Platform, profile and channel | iOS, normal `production` profile and production channel |
| App version, runtime and build number | `1.0.4`, `1.0.4`, build `49` |
| Accepted / finished | Accepted 15:44:55 UTC; EAS `FINISHED` 15:53:51 UTC on 1 October 2026 |
| Fingerprint | `0472b48fd6b16074463050a95b682a6aebe6f069` |
| Downloaded IPA | 368,234,503 bytes; SHA-256 `2a04cd826133fe2e7c610667dd80aa9bc3ca28bea1e5767cc1780a0e75830a05` |
| Offline bundle/provisioning check | Bundle `com.tommo86.Stackr`; team `K82N877J3F` verified |
| Embedded update | `d47d7809-7632-4269-bf3d-6c9711e5fd38`; its manifest carries no source SHA, so source attribution remains the EAS receipt and exact source evidence |

The single submission is `3811f063-edfb-4f01-870e-1227fe49ba8f`, accepted at 15:57 UTC and still `IN_QUEUE` at 16:17:56 UTC. A separate Apple read at 16:09 found no build-49 record yet. The [sanitized upload checkpoint](testflight49-upload-checkpoint-20261001.json) preserves the exact build, archive, submission and channel checks; it is not Apple availability or tester-group proof. The existing `production-owner` submit profile contributes only Apple app `6772118450` and existing group metadata; the immutable normal-production build ID above is the selected archive.

Expo Doctor passed 17 of 18 checks. Its four patch-version advisories are unchanged from build 48; no dependency or lockfile change was made to suppress them. The sanitized result is retained with the final local build evidence at `outputs/releases/feedback49-final/expo-doctor-advisory.json`. One read-only `build:view` dry run failed once and recovered after a single retry; it did not create a duplicate native build or upload request.

## What this client changes

- Restores the original startup artwork and readiness behavior. Startup now stays static while Reduce Motion is pending, enabled, or unreadable; animations start only after the system reports that Reduce Motion is off.
- Shows canonical card search results without waiting indefinitely for optional image or provider enrichment, and keeps prior results when a later request becomes stale.
- Makes Discover report retryable source failures instead of presenting false empty results, while preserving independent language results.
- Makes one long press open card inspection consistently in ordinary, variant, showcase, and mixed-language binder cases. In the enlarged inspector, confirmed holo finishes gain a restrained tilt-bound directional sheen inside the existing mask, a modest generic-finish strength adjustment, a darker depth shadow, and one Rigid inspection-open haptic with a 250 ms cooldown. Exact masks take precedence; plain/unknown finishes remain uncoloured, and existing gyro, Reduce Motion, background cleanup, and haptic preferences remain in control. Exact foil geometry and physical feel still require phone testing.
- Applies shared card-shaped clipping to prevent white image corners in search, binder, detail, and inspection views.
- Preserves price errors for the existing retry UI instead of turning them into completed no-price results; it retains existing identity, currency, condition, finish, and account separation.
- Virtualizes the Cards search rail and warms only the visible printing-specific thumbnails plus a bounded look-ahead. Binder warming follows the visible grid window. It does not construct image URLs, substitute a language/finish, preload full-size artwork, or write catalogue, pricing, or ownership data.

[Feedback repair evidence and known limits](build48-shared-repairs-20261001.md), [image-preloading evidence](build49-preloading-20261001.md), and [holo polish evidence with synthetic before/after proof](build49-holo-polish-20261001.md) record the source-level scope and tests. The synthetic visual proof is not phone evidence.

## Measured desktop evidence and its limits

The preloading diagnostic sampled 40 cards across seven sets and four languages: 117 prepared images plus one external original. Repeated Windows desktop request medians were 37 ms for images, 65 ms for search, and 170 ms for card detail; the corresponding observed maxima were 64 ms, 3,184 ms, and 3,293 ms. Two initial 504 responses are retained in the diagnostic evidence.

A separate 70-request Windows desktop run read complete response bodies successfully, but its first request in a process was not a guaranteed cold server or CDN read. Neither exercise measures iPhone decoding, rendering, scrolling, memory, offline cache behavior, authenticated prices, startup timing, or the installed app. They do not establish a universal sub-0.5-second response target.

## Catalogue position carried into this build

The verified recovery publication totals are **9,253 fronts**, **27,759 derivative references**, and **36,945 stored objects**. **2,908** of the owner's original 4,201 artwork cases remain unresolved. These are recovery-batch figures, not the size of the complete production catalogue or proof that every card screen has rendered on a phone.

Native97 remains unpublished after its third protected run stopped on a public-object rate limit: 42 object checks, 41 verified or reused, 0 newly created, and 0 asset, link, metadata, ownership, or pricing writes. The first run's 114 immutable objects remain retained. A later isolated HTTP 200 read was deliberately not treated as permission to rerun. [Full third-failure evidence](native97-third-failure-evidence-20261001.json).

Separate outstanding work remains outside this client build:

- **94** set records still lack imported card checklists.
- Set-logo linking still needs the six Gym promo-pack links, Scarlet & Violet Energies, and a verified **30thD** logo/mapping.
- **SV4a** has a demonstrated 40-card data gap (numbers 127–146 and 148–167); changing client pagination cannot restore missing records.
- English names/descriptions remain incomplete for several legacy and Japanese datasets; presentation fallbacks are not authoritative English metadata.
- The last measured pricing exceptions were six unpriced copies and two provider-credential dependencies. Fresh provider coverage and signed-in Home/binder/card values remain unverified in this release task.
- Actual device acceptance remains required for artwork and logo rendering, Home/binder/card values, search, startup, haptics, gyro holo movement, Reduce Motion, camera capture, foreground/background behavior, and first/repeat timings.

See the [plain-English catalogue status](october-1-plain-english-status-20260929.md) for the current denominators and exception categories.

## Delivery verification

| Required evidence | Pending value |
| --- | --- |
| EAS build ID, platform, build number, app/runtime version, profile and channel | Finished: build `c7ddf691-b730-481f-85de-f8a117d9a2c1`; iOS normal production; `1.0.4` / `1.0.4` / 49 |
| Completed-build time, source attestation, fingerprint, IPA checksum and bundle inspection | Finished; recorded above |
| Apple upload/submission, processing, beta review and existing tester-group availability | One submission `IN_QUEUE`; Apple processing, review and group availability pending |
| Existing production OTA channel/branch and served-update check | Read-only checks confirm active production channel, production branch, and no update groups; no OTA was published |
| Exact CI/review links for the frozen source | PR #296 and its eight passed checks, plus the skipped release-candidate gate, are bound in the upload checkpoint; protected review run is linked above |
| Physical phone model, iOS version, installed build and acceptance observations | Pending |

## Phone acceptance checklist

1. Install the exact accepted TestFlight build and record the app version, build number, phone, iOS version, time, and network.
2. Force-close and open it five times, then do five normal opens. Check the restored startup artwork, usable Home state, and Reduce Motion behavior.
3. Search for Mew and open representative English, Japanese, Simplified Chinese, and Traditional Chinese cards. Check the search rail can scroll and tap without interfering with card long press.
4. Open a binder, scroll its grid, open a card and inspection, then check image corners, set logos, correct printing/language, and a mixed-language card.
5. Compare the same-account Home, binder, and card values, including quantities, condition, finish, currency, estimate/unavailable label, and a retry after a network interruption.
6. Test haptics, gyro holo movement, reduced motion, camera scan/capture, background/relaunch, and visible error/recovery states.
7. Save screenshots, any failures, and first/repeat timings. A successful install does not replace these observations.

## Rollback reference

The previous normal production TestFlight candidate is build 48, source `f8bf3a7c99ab1c5d4ef4420d558c4ba36d78678a`, app/runtime `1.0.4`, normal production profile/channel. It remains a reference only; no rollback, OTA, tester-group, or access-control change is made by this pending record.
