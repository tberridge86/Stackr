# Binder image and catalogue recovery — 5 September 2026

Status: implementation and release candidate verification; **not a complete catalogue or a deployment claim**.

## Demonstrated failures and repairs

- The supplied VSTAR Universe screenshot shows Japanese `VSTARユニバース`, an S12a logo, 83 owned cards, an unknown total, and blank tiles. This is evidence from the user's existing binder, not an authenticated reproduction in the connected browser.
- The live TCGdex Japanese S12a response supplies image bases under `/ja/S/S12a/001`. Both Stackr guards previously required `/ja/cards/...`. Commit `969e60d` accepts the safe series namespace actually supplied by an exact provider record. Language, set/card/collector identity, source/provenance, HTTPS host, low rendition, runtime issuance, denylist, attribution, and removal controls remain enforced. A HEAD request to the exact issued Japanese S12a/001 low rendition returned HTTP 200 and `image/webp`; no image binary was downloaded or mirrored.
- Read-time binder set identity resolves canonical UUIDs case-insensitively and distinguishes Japanese and Traditional Chinese S12a using recorded language, exact identifiers, and native names. Ambiguous identities remain explicit; they do not default to English.
- Saved rows are matched through confirmed set aliases and unique card/collector identities. An unmatched or temporarily unavailable catalogue no longer removes saved cards from the returned view. Saved IDs, quantities, notes, and memberships are not rewritten. Ambiguous rows remain available for review rather than being silently merged.
- The binder uses resolved set totals, not the number of owned rows. Japanese regular-card mode and full/master mode retain distinct denominators. Missing nested images can fall back to the same saved card's usable image. Unissued historical provider pointers are retained in storage but are not treated as newly issued image references.
- Empty set/card results are not retained as populated catalogue cache entries. Explicit refresh clears binder/card/reference read caches. Incomplete catalogue matching has a visible retry message and cannot award a completion achievement.
- Shared English/Japanese/Simplified/Traditional selectors and flags remain in place. English uses the existing UK-front/US-behind component. Native names remain primary with English supplements; no replacement artwork was generated.

## Read-only evidence and coverage limits

Earlier public production reads on 5 September returned Japanese S12a (UUID `d6a23ad9-7d3d-482c-a477-304584a335e3`) with 258 card records and Traditional Chinese S12a (`eed3fcbd-fd4c-4b7f-9b75-a68e15d61476`) with 250. The Japanese provider declares 172 regular cards and 258 including extras. These are different release populations, not interchangeable editions.

Later bounded production probes at 19:23:55–19:24:04 UTC returned HTTP 504 for those named Japanese/Traditional Chinese endpoints and one Simplified Chinese endpoint. A sampled English endpoint returned HTTP 200 with zero records. A follow-up set-list sweep at 19:24:15–19:24:17 UTC returned HTTP 503 for all four requested languages. These observations do not establish that every set is empty. The full public catalogue scan was paused, and the release owner was notified.

The local hash-checked baseline uses the **14 August provider inventory** and **3 September canonical evidence**, not a current production snapshot:

| Language | Dated provider sets | Combined dated evidence sets | Full card denominator |
| --- | ---: | ---: | --- |
| English | 218 | 223 | Unknown for 5 sets |
| Japanese | 177 | 383 | Unknown for 206 sets |
| Simplified Chinese | 56 | 185 | Unknown for 129 sets |
| Traditional Chinese | 98 | 98 | 8,980 provider-declared cards |

Canonical evidence in this baseline contains variant identities, not a distinct-card population. Observed card counts and image-load completeness therefore remain **unknown**, including for Traditional Chinese. The dated reconciliation has one unmatched/unrepresented provider set, Simplified Chinese `csv1c` (nine provider-declared cards); this is an audit exception, not authority to insert a duplicate.

Tools added:

- `scripts/audit-four-language-catalogue-coverage.ts`: field-level coverage with explicit unknown populations and identity conflicts.
- `scripts/collect-four-language-coverage-baseline.ts`: hash-verifies the named dated evidence before comparing it.
- `scripts/collect-public-catalogue-coverage.ts`: read-only paginated current API inspection, bounded concurrency/retries, distinct-card counts, metadata gaps, and verifiable request evidence. Descriptor/pointer presence never becomes a successful image-load claim. Missing set-mark fields in the API remain unknown rather than being reported as missing assets.

## Verification and release gate

Passing checks include API HTTPS/UUID regressions, API v1 integration, gateway (24 tests), backend (24 tests), language flags, native-language display, foreign-card presentation, controlled reference images, binder image non-persistence, set-mark policy, CJK audit tests, collection pricing UI/API, seller routing/access, and new binder identity/presentation and coverage regressions. Standard lint reported no errors and ten existing app/component warnings; wider touched-file lint also reported existing warnings, not errors.

Final post-edit app typecheck and backend typecheck passed. The production-targeted web export passed with 92 routes. Local output: `D:/Stackr-1/.tmp/cjk-binder-build-20260905-production`. Entry bundle: `entry-7b18cced3ab8c99f82449cff5aba070f.js`, SHA-256 `59314c64a790ea27e961a2c59b20205f5f9a69d9a91e4670ed9f87ad51180480`. The exported configuration contains production app/environment values, and the bundle includes the new saved-card matcher and both refresh-cache functions. This is build verification, not an authenticated UI test or deployment.

The connected Codex browser remains at the login screen. The user is signed into a separate browser in the screenshot. Existing/new-binder visual verification, including actually seeing loaded native-language cards and checking owned quantities, remains outstanding. Do not report this as passed from API responses or source assertions.

## Remaining work

1. Restore reliable production set/card reads and run the current public coverage collection.
2. Verify the repaired build in an authenticated existing binder and representative new binders in all four languages.
3. Continue source-backed set/card/mark gap filling using the current per-set report. Confirm the dated `csv1c` exception before adding anything.
4. Expand the existing two metadata-only original CoroCoro entries and other magazine/event/regional promo coverage with exact source evidence. Their full image and historical-release coverage has not been verified by this repair.
5. Complete native image-delivery checks and independent release-population denominators. Do not infer universal coverage from the database or a single provider snapshot.

No production/staging catalogue, Supabase, storage, ownership, or price-refresh mutation was performed. Work remains under `docs/stackrtcg-ip-operating-boundary.md` and the existing recorded source reviews. No source permission was fabricated or broadened.
