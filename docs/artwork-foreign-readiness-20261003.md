# Foreign-language artwork and English-display readiness — 3 October 2026

## Evidence boundary

This record covers clean release-source and fixture evidence. It does not prove deployed backend data, provider storage, or installed-phone behaviour.

The release catalogue scope is English (`en`), Japanese (`ja`), Simplified Chinese (`zh-cn`), Traditional Chinese (`zh-tw`), and Korean (`ko`). French, Spanish, Italian, Brazilian Portuguese, German, Indonesian, and Thai are live-provider capabilities outside this release catalogue population; no full coverage is claimed for them.

The Japanese logo review artifact in the clean release checkout hashes to `0352029e6d78fd5a093a5e7ff9cfb016057febadc66bc9d61470504312a8ff52`, matching the runtime policy. The differing hash previously seen in the dirty primary checkout was an uncommitted local artifact, not release-source evidence. No review hash or approval record was changed.

## Source behaviour verified

- `EditionAwareCardImage` uses only the supplied catalogue rendition or an explicitly tagged local edition variant. It does not use the contained disabled edition-image route or construct a substitute artwork URL.
- Card detail passes catalogue language to image selection. Image cache keys include language; a foreign card cannot borrow shared art or receive English edition/shadowless overlays.
- Foreign detail reads have an eight-second client deadline, coalesce same-language in-flight work, and cache by exact `language:cardId`. TCGdex API and catalogue-client reads use the same bounded deadline.
- English explanatory content, including rules, attacks, flavour, and related details, is shown only with `authoritative_matched_counterpart` or `reviewed_translation` provenance. Latin script by itself is withheld. Native identity remains separate; unreviewed content must display as translation pending.

## Local checks

The following checks passed against the clean release source:

- `npm run test:native-language-display` passed. Its release artifact hash matches the Japanese logo hash above.
- `scripts/test-edition-aware-image-selection.ts` verifies that foreign cards cannot borrow shared artwork or receive English overlays, and that the contained route is absent.
- `scripts/test-foreign-pokemon-cache.ts` verifies same-language in-flight coalescing, language-isolated caching, and explicit invalidation through a mocked API.
- `scripts/test-foreign-card-presentation.ts` verifies a reviewed translation renders and an unproven Latin-script field is withheld.
- `npm run test:tcgdex-controlled-card-reference` verifies the controlled, memory-only TCGdex reference boundary.

These are source and fixture checks. They do not verify a live provider response, retained native image, deployed backend record, native URL expiry, cold/warm performance, or visual output on a phone.

## Unmet release evidence

Korean lacks an equivalent reviewed controlled-reference policy and a verified stored-art route in this source. Native Korean artwork therefore remains a blocker for a complete five-language artwork claim.

The client accepts provenance tags, but source evidence does not show that ingestion assigns them only after an exact native-language/set/card/variant counterpart match or a recorded reviewed translation. A complete English-description claim requires an auditable record for each displayed foreign card: native identity, source, exact English counterpart or review ID, and translation provenance. Without it, the explanatory fields remain translation pending.

Installed-device acceptance is still unmeasured. It must cover the actual release build and deployed backend, including all five languages, cold and warm image loads, offline/cache behaviour, artwork identity, English provenance display, URL expiry, and representative set/card details. Browser or fixture success does not substitute for that cohort.

## 4 October deployed and native evidence

Production and staging passed all 36 full server smoke checks, including published language catalogue routes, Japanese exact search, assets and pagination. A sampled production Japanese asset returned native 868×1212 JPEG data and reused its cache. These bounded samples do not prove complete artwork coverage or handset visual acceptance.

The finished signed iOS 1.0.5 (52) binary passed bundle, runtime and exact startup-video verification. Six foreign presentation/cache/reference/localisation fixtures passed. Authoritative English descriptions and Korean exact-artwork coverage remain incomplete; absent evidence continues to produce translation-pending or unavailable states. See `releases/beta-gate-receipt-20261004.json` and `releases/testflight52-native-artifact-verification-20261004.json`.
