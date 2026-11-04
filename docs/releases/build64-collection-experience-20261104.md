# Build 64 collection experience repair

Prepared 4 November 2026 against shipped source `665523719b1d637ec4c06fbcbfd209e565a4a01f` in isolated branch `fix/build64-collection-experience-20261104`. Implemented and locally tested; not merged, published or accepted on an installed phone at preparation time.

## User-visible changes

| Reported problem | Repair and evidence |
| --- | --- |
| Home lost values and branding | Restore the bundled Stackr wordmark, purple value panel, stored GBP estimate with coverage, collection counts, visual Search/Discover/Pokédex navigation and six saved binder artwork previews. Account/cache boundaries remain intact. |
| Discover Sets inaccessible | Allow the existing Discover child route and restore its Collection shortcut. Main navigation is Home, Collection and Search; Pokédex and Discover remain accessible children. |
| Storm Emeralda and Abyss Eye omit big hits | Remove the Japanese printed-total/secret-card exclusion. Standard and master modes include every printing; master expands canonical finishes. Public facts contained Storm 113 and Abyss 118 printings, including 37 beyond each printed total. |
| Slow sets remain incomplete | Keep foreground deadlines; shared background facts may continue while validated pages progress, with an 8-second idle allowance and 60-second network ceiling. Only validated terminal results cache. Detail reloads once per binder/account epoch, retaining visible cards. Metadata phases remain bounded to 7 seconds. |
| Binder search order | Sort release dates newest first, with deterministic ties and undated releases last. |
| Binder progress missing or wrong | Union collection ownership with saved binder ownership, retain set/language boundaries, reject contradictory canonical aliases, and count only canonical finish slots. Background master reads are grouped with at most three active workers. Unknown master totals remain explicitly unknown. |
| 30th Celebration logo missing | Add the exact already-approved English 30C and Japanese M6a published URLs as production fallbacks, bypassing a slow optional manifest read. Japanese also retains its existing bundled mark when remote delivery is unavailable. Codes require their matching language; canonical identities remain authoritative. Chinese and Classic editions are not substituted. |

The Home estimate is the existing stored raw-card estimate, not a newly refreshed market valuation. Missing prices are not represented as a zero total, partial coverage is visible, and price-date freshness is explicitly unavailable. Home previews do not fabricate binder-completion bars from their limited rows; actual completion belongs to Collection and Binder Detail.

## Validation

- `npm run typecheck`: passed after restoring matching installed dependencies into the isolated checkout. The first attempt identified missing local dependencies/fixture files, which were restored without changing package manifests or adding declaration stubs.
- `npm run lint`: passed, zero errors; eight warnings in untouched files.
- Targeted ESLint on changed Home, Binder Detail and library files: zero errors; 20 warnings. These cover existing duplicate imports, legacy unused helpers/array syntax and the deliberately retained session-epoch hook dependency.
- `node scripts/test-core-home-presentation.mjs`: passed; actual mounted component, unavailable/partial/empty/zero values, navigation, account transitions and 320-pixel artwork width.
- `node scripts/test-core-home-data.mjs`: passed, 20 actual-module account/cache/read cases and 47 Home/Binder core-mode scenarios.
- `node scripts/test-core-app-scope.mjs`: passed, actual route/tab protection and disabled-source suppression.
- `node --import tsx scripts/test-japanese-set-logo-runtime-lookup.ts`: passed, exact identity and cross-language exclusions.
- `node --import tsx scripts/test-published-set-logo-fallbacks.ts`: passed, production-only anniversary URLs, exact identity/language/prefix controls and existing registry/delivery behavior. Independent review also passed 97 focused anniversary cases after closing a foreign-prefix/code-fallback ambiguity. Final typecheck passed after this correction.
- Binder regressions passed: `test-binder-progress.ts`, `test-binder-catalogue-continuation.ts`, `test-binder-first-paint.mjs` (16 cases), `test-binder-library-progress-runtime.ts` (including 1,702-row ownership pagination), `test-binder-catalogue-presentation.ts`, `test-master-set-denominator.ts`, `test-master-set-ownership.ts`, and `test-binder-foreign-set-picker.ts`.
- `git diff --check`: passed.
- Independent source/runtime review: [review receipt](build64-collection-experience-review-20261104.md). Review caught a stale UUID ownership-alias bug; its regression now returns 2/4 instead of false 4/4 completion.
- Browser fixture: actual CoreHomeScreen, BinderArtwork, typography, brand and selected artwork rendered through React Native Web at 320, 390 and 430 pixels. Sample values and transport/native wrappers were substituted. Visual inspection caught the small-phone logo shelf overflowing its card; responsive sizing corrected it. Search, Discover, Pokédex and Account press handlers produced their expected routes. A synthetic dark-theme stress view was inspected; the production ThemeProvider remains light-only. This is not native or real-account acceptance.

## Remaining work

The first PR CI run on `5f28c2dd42557c3472782452146ae846f4475860` exposed outdated test fixtures in the bounded-page and deferred-master paths, plus an iOS bundle assertion for the removed minimal Home headline. The follow-up retains production guards: raw HTTP pages now use the actual origin grouping contract in the test, canonical master counts settle independently of prices, and the export gate requires the restored Home content while explicitly rejecting the previous minimal Home. Saved-artwork and binder-reopen harnesses also receive their actual runtime dependencies. Independent review covers these corrections; the next CI result is recorded on PR #465.

The four pagination tests, saved-artwork reassignment, full `test:feedback-recovery`, full `test:binder-retrieval` (including 56 reopen/account/SQLite scenarios), and all four Home release tests passed locally after the fixture corrections. The export policy and required-phrase negative cases passed independently. The local full export/74-asset test was not completed in the sparse checkout, and is not counted as passed here; CI retains the actual production iOS export and exact asset-byte checks.

1. Storm collector numbers 077–113 were all labelled Mega Hyper Rare by the public catalogue. All slots now remain visible, but AR/SAR labels require authoritative per-card metadata evidence and a separately approved catalogue correction. No rarity assignments were guessed.
2. The user's exact anniversary binder language was not available. A final check of the actual asset endpoint corrected the earlier metadata-only inference: both English 30C and Japanese M6a have approved published logos. Their roughly 18-second manifest reads exceeded the optional two-second asset budget, and both were missing from the client fallback registry. The exact production fallbacks now cover both. See [anniversary asset receipt](build64-anniversary-logo-read-20261104.json). The bundled simplified-Chinese anniversary identity still returned 404 in the bounded metadata read; it has not been conflated with either edition.
3. The latest local enhancement folder contained ten actual PNG candidates despite a stale checkpoint claiming zero accepted. Metadata showed 1054×1492 for Celebi and 1122×1402 for the other nine, with alpha channels. Arceus, Celebi and Gardevoir were visually inspected and showed exterior fringe/debris. They were not accepted as clean HD replacements or substituted into the app. Existing assets and all candidates remain intact. Next artwork action is one-by-one edge cleanup and inspection, preserving the source designs and genuine alpha.
4. Cold/warm retrieval and ownership/progress need acceptance on the installed iPhone build. Backend page latency remains separate: the observed Abyss request sequence took 17,559 ms. The continuation tests do not establish a faster server or a sub-100ms app.

Bounded live GET facts, set IDs, page counts, versions and timestamps are in [set read receipt](build64-set-reads-20261104.json). No catalogue mutation, schema change, provider price refresh, production job, release workflow, or live publication was performed.

## Delivery and rollback

Review and merge this focused branch, then use the existing release workflow with an explicitly approved native publication. Verify Home values/branding, Discover/Pokédex entry, newest-first picker order, Japanese anniversary logo, full Storm/Abyss checklists and progress on the phone. Do not close installed-device issues solely on these source checks.

Rollback is a code revert of this change set and a normal release. No database/data rollback or artwork replacement rollback is required.
