# Stackr TestFlight 51 — 3 October 2026

**Available in TestFlight.** At 07:30:40 UTC (08:30 UK time) on 3 October, independent Apple readback confirmed Stackr 1.0.4 (51) VALID, beta APPROVED and internal/external IN_BETA_TESTING, with both existing groups bound. Physical phone acceptance remains pending.

[Sanitized evidence index](evidence/testflight51-20261003/index.json). File hashes in the index preserve the receipt bytes; raw credentials, signed download links and private build logs are excluded.

The owner requested another TestFlight release on 3 October. This is normal production Stackr for the existing Team (Expo) and Stackr Beta Testers groups, not a public App Store release. No OTA, account permission change, catalogue mutation, price write or holding change is part of this release.

## Included changes

- [PR298](https://github.com/tberridge86/Stackr/pull/298): the larger card showcase, tilt-driven lighting and shadow, bounded soft foil-sweep haptics, separate motion/light controls and transparent card-edge correction. Saved preferences, Reduce Motion and background/close cancellation remain in control. The lighting is a generic simulation for known foil finishes; physical-card-specific material maps are not included. Draft PR300 remains separate.
- Merged retrieval work through PR299 and PR301. The [production API repair](retrieval-repair-20261002.md) already returns the correct Japanese padded-number cards and SVAM GRA, and the M5 #002 sizes/cache-header repairs are already published. This client build does not redeploy the API or artwork.
- Build49 startup, retry, search, bounded thumbnail preloading and existing account/printing/language/finish protections remain included.

## Exact release identities

| Item | Verified value |
| --- | --- |
| Source | 650cbad73340ba74453c7c1ec757bbcdd91364e1 |
| EAS build | f883f337-b258-4209-940f-536193e3f526 |
| Version / build / runtime | 1.0.4 / 51 / 1.0.4 |
| Profile / channel / bundle | production / production / com.tommo86.Stackr |
| Build completion | 3 October 2026, 07:18:58 UTC |
| Fingerprint | c986831e881058454d219cce9272ea3634cd01fd |
| Signed IPA | 368,240,324 bytes |
| IPA SHA256 | c9ee459084ea0cedc928ddc04a5ac16f03bf6a0fc7eb969ee263363e73319c49 |
| Signing identity | K82N877J3F.com.tommo86.Stackr |
| Submission | 5fff33af-c64b-4ed6-b51b-82bfd557664d |
| Submission completion | FINISHED, 3 October 2026, 07:26:24 UTC; no terminal error |
| Apple app | 6772118450 |
| Apple build / beta review | 46ef52b6-61ea-4e05-9363-ba4e0de86629 |

The downloaded IPA independently matches bundle, version, build, runtime, channel and provisioning team. Its embedded update manifest does not expose the Git source; source attestation comes from the exact EAS build record and guarded request, not an invented embedded-source claim.

## Build number and delivery route

Build49 remains the preceding delivered release. Number 50 was reserved by Expo, then its credential-service GraphQL request failed before any source upload/build creation. The subsequent EAS inventory contained no newer build, and Apple reported no 1.0.4 (50). That failed request is retained. The counter was not reset; one new request created build51, and one submission selected its exact ID.

Normal protected [review run 37104862525](https://github.com/tberridge86/Stackr/actions/runs/37104862525) received owner-authorized approval for the exact source and production profile. It stopped before EAS dispatch because GitHub still has no EXPO_TOKEN. The existing authenticated local EAS route used for build49 then delivered the build request; credentials and protection rules were not changed. No competing GitHub build remained queued/running.

PR298's exact head 19a58c946cd038c98cb9e4d631c0440346e5ade7 passed all eight applicable GitHub checks; the separate full-platform release-candidate gate was skipped. After merging the showcase with current main, all 11 card-inspection scripts and full TypeScript checking passed. The production runtime preflight passed. Native dependency/configuration files are unchanged from build49. Read-only channel checks found the production channel active with no OTA update groups.

## Remaining acceptance

Apple processing, beta review and both tester-group availability are confirmed in the [final independent readback](evidence/testflight51-20261003/apple-build51-availability.json). Exact tester notes were verified, the existing external group was attached, and one beta review request was approved. The prior build49 remains available.

Actual phone acceptance is separate: install build51, check card opening, Japanese searches, binder artwork, tilt in portrait/landscape, haptics off, Reduce Motion and background/reopen behavior. Record phone/iOS/network and first/repeat timings. Check signed-in Home/binder/card values for the same holdings; Apple availability does not validate prices or physical-device performance.

This release does not close the 2,908 remaining artwork cases, 94 missing checklists, SV4a 40-card gap, set-logo and metadata exceptions, or general pricing/valuation gaps. Native97 remains held. Cached API diagnostics are fast, but some uncached requests still exceed 0.5 seconds; phone loading and physical holo fidelity remain unmeasured.

Rollback reference: keep the existing build49 available. No rollback or OTA is performed by this delivery.
