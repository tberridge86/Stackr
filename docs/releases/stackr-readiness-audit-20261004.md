# Stackr release readiness — 4 October 2026

**Decision: hold the next TestFlight.** The requested loading changes are implemented and validated locally. The pricing and foreign-card work has exposed concrete coverage and acceptance gaps; passing code checks does not establish a complete price guide or complete English descriptions.

## Loading

The release candidate bundles the unchanged `D:\stackr-loading-screen-exact.mp4` as `assets/startup/stackr-loading-screen-exact.mp4`. Its SHA-256 is `14b82efa2bdf8bbf98debde5e0138f2a3b419e32e011e7d0d91faf0a57ab697c`, matching the exported iOS asset. The 5.534-second clip plays once, muted and uncropped. A frame from that clip supplies the static native launch screen and Reduce Motion fallback. Playback, font loading and startup each have bounded recovery.

Tracked app, component and feature loading views now use a single ring or a simple bar. Unused startup artwork/motion helpers and the loading-placeholder styles made obsolete by this change were removed. Regular card effects are unchanged. Startup/auth/profile, motion, completion, timeout and cleanup checks pass; the iOS Metro/Hermes export passes. A signed native binary and installed-device playback remain unverified. `expo-video` requires a new binary with a compatible runtime/version; this change must not be sent as an OTA to the existing binary.

## Pricing and retrieval

Whole TCGCSV provider groups are imported independently of ownership. Product and price files are retained even when a group lacks a safe catalogue mapping. Service-only durable maps, reviewed repairs, feed revisions, request pacing, retry dates and resumable checkpoints preserve progress. The phone implementation persists prices by account/server/language/mode and displays the previous usable quote while refreshing. General estimates retain their source/date/stale label and remain separate from exact condition/finish/graded valuation and holdings.

Staging project `lmwfhvexfcoyeuoyrlco` has nine applied, ledger-matched migrations: `20261003224016`, `20261003224031`, `20261003224558`, `20261003225316`, `20261003225832`, `20261003231006`, `20261003232812`, `20261003234257`, and `20261003234442`. Production project `oakdbbzdqwurpjnoqhmu` has received none of these migrations, imports or deployments.

The first live 100-reference read timed out at 45 seconds. Profiling found repeated wide catalogue serialization in a lateral lookup, followed by a whole-catalogue scan inside the published-card view. The final reader bounds actual variants before joining publication metadata and retains all draft, deprecation, language and identity checks. A real service-role PostgREST request returned all 100 sampled English prices in 2,775 ms on its first request and 108 ms on repeat; Japanese returned all 100 in 747 ms and 116 ms. The indexed five-variant publication branch took 55.105 ms with 94 shared buffer hits and no reads, versus the earlier view branch's 3,008 ms and 21,315 hits. These are staging measurements, not guaranteed cold-cache, phone or whole-catalogue latency. No timed-out price read was disguised as an empty result.

The full staging sweep retained all 679 product files and all 679 price files for provider build `2026-10-03T20:05:38+0000`: 220 English and 459 Japanese groups. It ended with 200 complete groups, 479 unmapped groups, no pending/running/failed groups and 46,950 open repairs. There are 9,937 English and 6,720 Japanese priced variants, with zero stale quotes at the audit. That is 16,657/74,672 published variants (22.31%), or 16,657/45,739 supported variants (36.42%). Unsupported languages/finishes remain in the full denominator; mapped cards with missing provider quotes are separately counted. See [the measured coverage and freshness receipt](pricing-readiness-20261004.json).

Ten English set aliases were reviewed against exact card names and collector numbers before their audited repair. Japanese sets now require unique matching native set codes; products require a unique provider number and canonical printing. English name translation is never Japanese identity evidence. Duplicate or changed identities quarantine old automatic quotes. The canary priced 103/103 cards; 113 safe Japanese groups were requeued and processed from retained feeds. Live interruption/resume restored the existing sweep without redownloading those files. Full coverage still fails, and unmapped groups require reviewed identity evidence.

The guarded workflow supports a daily guide sweep and hourly resume. The manual lane now runs after dependency installation. It obtains a dated [ECB reference conversion](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) when a complete explicit FX observation is absent, so a static conversion cannot silently become stale. Its deadline, size, source-date and cross-rate fixtures pass; a live ECB read returned the 2 October observation, USD→GBP `0.757532293986637`. The new schedule is not enabled or deployed.

eBay OAuth and a bounded Browse request passed using the existing Railway worker credentials at `2026-10-03T22:58:29.813Z`. Tokens are now isolated per adapter configuration and concurrent requests coalesce; OAuth and Browse have deadlines. This verifies active-listing access. It does not establish completed-sales coverage or deployment of the candidate adapter.

Cardmarket's public daily files were validated once. The raw payloads were not retained; staging feed revisions, reviewed mappings and stored prices remain zero. Its separate staging schema and general-only fallback pass fixture/RLS tests, but the backup serves no real card. A retained daily import and an audited printing mapping population remain required. See `../cardmarket-backup-readiness-20261003.md`.

## Foreign text and artwork

Foreign image selection is isolated by language and exact printing. It cannot borrow shared English artwork or apply English edition overlays. Explanatory text now requires an authoritative matched counterpart or reviewed translation tag; unsupported descriptions remain translation pending. The ingestion evidence does not yet demonstrate those tags were assigned after an exact counterpart match for every published foreign card. Complete English-description coverage therefore remains unproven.

A real production Japanese asset-manifest request returned one matching card in 2,141 ms, then 207 ms with a cache hit. The referenced approved native JPEG returned HTTP 200 and its expected 868×1212 dimensions. The bounded database manifest path took 245.261 ms initially and 12.506 ms on repeat. This verifies one asset path, not all five languages, image expiry, device rendering or offline behaviour. Korean still lacks the reviewed native-art policy and retained-art evidence required for a complete language claim. See `../artwork-foreign-readiness-20261003.md` and `live-retrieval-readiness-20261003.json`.

## Checks, security and cleanup

TypeScript, backend typecheck, lint (zero errors, nine existing warnings), gateway tests (46/46), API contract coverage (41/41), startup, bulk-price/PGlite across all nine migrations, price-cache, provider planner, database deadline, ECB FX, eBay, Cardmarket, foreign presentation and native-image boundary checks pass. Secret scanning passes for repository files and the final 712-file iOS export. Only an iOS JavaScript/Hermes export was performed; no new EAS binary, OTA, Apple upload or TestFlight was created.

[Draft PR312](https://github.com/tberridge86/Stackr/pull/312) preserves the isolated release source. Its initial CI run exposed two obsolete test contracts: the deployment test allowed only the earlier scheduler clocks, and the set-filter VM fixture lacked the new `pricedCards` overlay input. They were corrected while retaining all prior assertions, adding disabled-guide/owner-scheduler isolation cases and verifying stale general-price metadata survives filtering. Deployment tooling and the complete card-first/home/binder/personal-loading checks pass locally. The full Windows deployment-test wrapper rejects raw CRLF checkout bytes in its immutable source-hash baseline; that same baseline passes in Linux CI. The verifier and approved hashes were left unchanged. Current GitHub check results remain visible on the PR; skipped release/device canaries do not count as acceptance evidence.

After staging DDL, Supabase advisors reported no new price/Cardmarket security findings. Inspecting the individual grouped findings exposed two missing general-price foreign-key indexes; the final forward migration adds them, and the advisor readback confirms no uncovered foreign keys in the new price tables. New unused-index notices are informational on new/empty tables. Existing advisories remain: ten authenticated security-definer function warnings and disabled leaked-password protection, alongside older RLS/performance notices. Review these using the [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The root production-dependency audit reported 54 findings: 34 high, 19 moderate and one low, with no critical findings. Many are inherited Expo/React Native build-tool dependencies. Reachability and compatible remediation remain a security review gate; automatic major SDK downgrades/upgrades were not applied. This report does not claim a clean dependency audit.

The release branch is isolated from the existing, heavily modified primary checkout. User edits and the separate existing PR are preserved. Provider payload caches, credential-loading wrappers and local exports remain ignored; credentials are absent from the staged files. Cleanup removed only verified-unused loading implementation files, without deleting catalogue/artwork/model data.

Automatic approval review rejected recursive deletion of an older ignored local export with the stated reason `blocked by policy`. That export was retained outside the release; no approval bypass or unrelated deletion was performed.

## Release conditions still unmet

1. Repair the 479 unmapped provider groups and remaining card mappings, missing quotes and provider-unsupported languages/finishes; deploy and prove recurring freshness against the measured denominator.
2. Import the Cardmarket daily guide into staging and prove the reviewed general-only backup serves real cards.
3. Audit foreign English counterpart/translation ingestion and Korean native artwork provenance.
4. Complete signed-in staging and installed-device cold/warm/offline/expiry/error acceptance across the supported language cohort.
5. Resolve or document the dependency/security review, then stage the backend/gateway deployment, production data rollout and native binary/runtime change with their required checks.

Until those conditions pass, retain the existing TestFlight build and keep the new production migrations, guide schedule, backend/gateway deployment and Apple upload on hold. The retained [Apple receipt](evidence/testflight51-20261003/apple-build51-availability.json) records version 1.0.4 (51) as VALID, APPROVED and available to both tester groups at 07:30:40 UTC on 3 October. This task uploaded no replacement build.
