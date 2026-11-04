# Independent collection experience review — 4 November 2026

No remaining implementation blocker was found after the reviewed identity corrections. This review covers the binder checklist/progress/retrieval changes, Home/navigation, and the Japanese and English anniversary-logo fallbacks against shipped source `665523719b1d637ec4c06fbcbfd209e565a4a01f`. It is a source and focused-runtime review, not a deployment or installed-device acceptance receipt.

## Binder findings

The actual detail-screen selector now retains every Japanese printing in both standard and master modes. Actual set totals take precedence over printed totals. Master mode expands only canonical catalogue finish identities; provider price keys no longer create collection slots. Saved-only rows remain visible but do not manufacture canonical completion, and unavailable master facts leave the denominator unknown and hide the progress bar.

The library publishes saved ownership before optional master catalogue retrieval. It groups background reads by set/language, runs at most three workers, and guards late publication with the existing account/request generation. The shared `summaryCounts` value prevents the price phase from overwriting later master progress. Collection-only ownership contributes without multiplying quantities into unique-printing counts.

An earlier review found a reproducible false-completion bug: a saved row for canonical printing 1 with stale `api_card_id` pointing to printing 2 inherited printing 2's finishes. The two-printing fixture returned 4/4 instead of 2/4. The final `lib/binderProgress.ts` uses the chosen canonical identity and trusted provider aliases, excludes contradictory canonical UUID aliases, and the exact added regression returns 2/4. Exact canonical identities also survive stale opaque API aliases; repeated collector numbers remain ambiguous without an exact identity.

The reviewed slow-read path is `BinderDetailScreen` access check → `fetchStackrCardsForSet(..., { includeAssets: false, allowPageProgress: true })` → shared canonical facts reader → validated terminal cache → `continueBinderCatalogueRead` → one retained-view reload per account/binder epoch. Metadata lookup remains bounded to 7 seconds. Valid page identity/version/variant progress renews an 8-second idle allowance within a 60-second network ceiling. Foreground callers retain their 7-second budget; leaving one caller does not abort another consumer. Partial, mixed, invalid, repeated-cursor or timed-out results cannot enter the complete cache. The continuation starts after binder access is established, uses an explicit language or known prefix, rejects obsolete requests, and does not clear the visible cards during its reload.

## Home, navigation and logo findings

`features/home/CoreHomeScreen.tsx` retains the account/epoch and request guards. It hides previous-account state during transitions and unverified authentication. `lib/coreHomeData.ts` still validates account ownership, keeps the six-row preview separate from the complete binder-library cache, bounds the private query to six rows, and whitelists only the additional saved artwork identity fields. Optional disk/artwork work does not gate the compact private reads.

`lib/coreHomePresentation.ts` uses the validated stored GBP estimate and its priced/total-unit coverage. Unavailable prices render no monetary zero; valid empty and genuinely priced zero-valued collections remain distinguishable. Partial coverage remains explicit, and the copy states that price dates are unavailable. The Home change does not introduce a provider refresh or claim current sold-market values. Home binder previews explicitly disable binder completion bars because six saved previews cannot establish their completion.

Discover is reachable from Home and Collection. `explore` remains a hidden child route (`href: null`); the primary shell remains Home, Collection and Search. Scan, Market and other capability restrictions remain in place.

The new Japanese bundled-logo alias maps only canonical set `88e351b5-8191-5ef4-854b-2978046cda53` to the existing `m6a` asset. Tests cover a renamed binder with only the canonical identity, explicit non-Japanese languages, the separate English UUID and a near-miss UUID.

Subsequent exact asset-manifest reads, recorded by the coordinating agents in `docs/releases/build64-anniversary-logo-read-20261104.json`, establish approved published logos for both Japanese M6a and English 30C (`258cb8e5-c769-540d-9e3c-40d4ed4dafdb`). Each request returned one approved asset and a terminal cursor. Both records report the same content SHA and 738 × 402 dimensions, with separate immutable delivery URLs and publication identities. The root agent additionally reported opening and visually inspecting the English URL; this reviewer made no new live call or independent image-byte claim. The absence of URL fields in the metadata-only set response never established missing published artwork. The demonstrated issue is retrieval/fallback coverage: those exact identities were absent from the generated client registry, while the recorded manifest calls took approximately 18.3 seconds against a two-second optional asset allowance.

`lib/publishedSetLogoFallbacks.ts` now supplies the two exact recorded URLs only in production, using canonical UUIDs or explicit language/code identity. It preserves edition-specific publication records despite identical reported pixels, rejects an unknown canonical UUID with a stale anniversary code, and keeps the English Classic edition separate. Review reproduced a prefix bypass: an unrecognized foreign prefix made a UUID appear noncanonical and let code fallback bypass the language guard. The final correction recognizes the complete existing `pokemonSetIdentity` domain prefix set, including compact and Singapore Chinese aliases, plus English/Japanese regional forms. It rejects a conflicting explicit language before stripping the prefix and checking canonical identity. An independent 97-case in-memory matrix passes, covering both editions, production/staging, absent language on codes, wrong-language UUIDs, all 18 foreign domain prefixes with and without explicit language, unknown canonical UUIDs, Classic, and an English regional positive. The prefix blocker is resolved.

The Home fixture-render test covers the 320-pixel artwork shelf bound and brand source. Root separately reported React Native Web fixture screenshots that exposed, then corrected, logo overflow and wordmark contrast under a synthetic dark stress fixture. The actual `ThemeProvider` explicitly supplies `lightTheme`, `isDark: false`, and a no-op theme toggle: dark mode is not an enabled product feature. Those screenshots were not independently inspected in this review; fixture rendering does not establish installed-phone appearance.

## Verification

The following checks were run independently during the review and passed. The final small identity, page-validation and continuation edits were also re-read. Global typecheck/lint remain the root agent's separate checks.

| Command | Evidence |
| --- | --- |
| `node --import tsx scripts/test-binder-progress.ts` | Checklist modes, exact/ambiguous ownership, stale canonical UUID regression, finish slots and set order |
| `node --import tsx scripts/test-binder-first-paint.mjs` | 16 executable retrieval cases, including shared three-page continuation, caller abort, stalled page and absolute ceiling |
| `node --import tsx scripts/test-binder-catalogue-continuation.ts` | Retained rows, one reload, obsolete/empty/failed-read rejection |
| `node --import tsx scripts/test-binder-library-progress-runtime.ts` | Actual library runtime, 1,702-row ownership pagination, price timeout/retry and account isolation |
| `node --import tsx scripts/test-master-set-denominator.ts` | Canonical finishes only |
| `node --import tsx scripts/test-binder-catalogue-presentation.ts` | Catalogue totals and saved presentation preservation |
| `node scripts/test-core-home-presentation.mjs` | Actual Home render, estimate coverage, artwork identity, navigation, 320-pixel geometry and account transitions |
| `node scripts/test-core-app-scope.mjs` | Actual route/tab protection and core-mode source suppression |
| `node scripts/test-core-home-data.mjs` | 20 account/cache/independent-read scenarios and 47 Home/Binder core-mode scenarios |
| `node --import tsx scripts/test-japanese-set-logo-runtime-lookup.ts` | Exact Japanese anniversary fallback and language/identity exclusions |
| Targeted in-memory compilation of `publishedSetLogoFallbacks.ts` | Final 97 identity/environment/prefix cases pass, including the reproduced compact/SG contradictions; no network or source mutation |
| Scoped `git diff --check` | Passed; Git emitted its existing LF/CRLF working-copy notice |

## CI fixture follow-up

The final fixture corrections were independently reviewed against the actual origin, API adapter, ownership paginator and export verifier. No blocker or removed substantive failure assertion was found. These changes repair test fixtures and release-content expectations; they do not change production catalogue, ownership or pricing behavior.

`scripts/test-ui-pagination.ts` now pages raw variant rows and calls the actual backend `groupCardRows` before handing each HTTP-shaped printing page to the complete reader. This matches `backend/lib/fastSetCards.js`: the origin slices raw variants before grouping, and a printing split across pages must have a default among that page's variants. The test retains all 320 pages, 2,000 printings and 16,000 finish identities, adds an eight-finishes-per-printing check, and rejects a malformed raw default even if normalization could repair it. Invalid limits and empty, mixed-version and duplicate species windows remain covered.

`scripts/test-binder-library-value-recovery.ts` now executes the actual ownership paginator and validates canonical pages through `loadCompleteSetPages`, instead of supplying the removed legacy card-table master path. Its simulated database supports legitimate account-scoped ownership reads without an additional `in` filter. The existing 503/429, 401/403 precedence, genuine no-quote, shared-price-query, timeout, supersession, repeated/foreign-page and account-ABA assertions remain. New cases preserve all ownership beyond a 17-row server cap, require an unknown initial master denominator, fail a later canonical page explicitly, retain prices when optional catalogue hydration fails, reject late account/request results, and verify both price-before-master and master-before-price cache settlement.

`scripts/test-set-artwork-identity-reassignment.ts` now loads and injects the actual `enrichSavedStackrCardArtwork` function and its display-name merge dependency into the serialized saved-view scenarios. This matches the existing `attachBinderCatalogueArtwork` runtime call. The assertions for approved exact reassignment, invalid identity/version/finish or denied artwork, optional-read failures, immutable source facts, quantities, notes, prices and distinct private captured photos remain intact.

The export-content policy replaces the removed minimal Home headline with four strings present in the restored `CoreHomeScreen`: collection value, stored-price coverage, Discover caption and the empty-binder instruction. Common recovery/account guards, exact supported Home entry, boolean capability agreement, actual bundle-byte requirement and the 74-asset missing/tampered verification logic remain intact. The new negative fixture explicitly rejects the previous minimal Home bundle. This is an updated positive expectation with retained negative controls, not an export bypass.

| Independently executed follow-up | Outcome |
| --- | --- |
| `node --import tsx scripts/test-ui-pagination.ts` | Passed |
| `node --import tsx scripts/test-binder-library-value-recovery.ts` | Passed |
| `node --import tsx scripts/test-set-artwork-identity-reassignment.ts` | Passed with the synthetic cohort |
| Actual `verifyRecoveryUiContent` and the policy/phrase portion of `test-mobile-recovery-content.mjs`, executed in memory | Passed, including previous-minimal-Home rejection and all required-phrase negatives |

The full local 74-asset phase was not executed by this reviewer. Root's earlier run reached missing source asset fixtures after the policy assertions; root subsequently reported all four Home release-suite tests passed after loading six exact existing loading/mascot assets, without image edits. The reviewer did not repeat that completed suite or perform bulk asset hydration. Actual CI export/asset-byte verification remains a separate release result.

The final additional fixture review also passed. `scripts/test-binder-reopen.mjs` imports the actual continuation and progress helpers, supplies the continuation epoch ref and public-reader dependency, and checks the requested canonical set, language, facts-only and progressive-read options. Its existing ownership assertions now execute the screen's actual `progressEntries` selector with `countBinderProgressSlots`, replacing extraction of the removed loop. This prevents missing VM bindings from falsely aborting the fresh-load branch; no ownership, account, preview, temporal or SQLite assertion was removed. The coordinating coding agent reported the final binder-retrieval suite passed, including all 56 reopen/account/SQLite scenarios.

The final `requireGroupedCard` fixture helper in `scripts/test-ui-pagination.ts` asserts non-null origin summaries and the allowed `null`/`printing`/`concept` English provenance at runtime. Copying the readonly supplement source-card IDs into an array preserves their values and satisfies the client DTO type without casting away a malformed shape. The raw-default rejection and complete 16,000-variant/2,000-printing assertions remain. Final focused pagination/typecheck results are owned by the coordinating agent; this reviewer re-read these final diffs and did not repeat completed checks. The review report is frozen after this follow-up, with no remaining implementation blocker identified.

## Remaining issues and limits

- The bounded live GET receipt is `docs/releases/build64-set-reads-20261104.json`. Storm had all 113 printings and Abyss Eye all 118 through terminal cursors. This supports catalogue presence; it is not phone rendering or universal catalogue-coverage proof.
- Storm numbers 077–113 were all published as `mega_hyper_rare` in that observation. Restoring those slots does not establish correct AR/SAR taxonomy. No rarity data was invented or changed by this repair.
- Both Japanese M6a and English 30C have approved published logos according to the later exact manifest receipt. Their new client fallbacks address the observed retrieval/registry gap, with the prefix identity correction independently verified above. The separate bundled simplified-Chinese UUID/code negative metadata reads do not establish another edition's image availability; no Chinese logo repair or cross-language substitution is claimed.
- The observed Abyss facts journey took 17,559 milliseconds across three HTTP requests. The progressive reader addresses that class of multi-page timing, but its new behavior has only fixture/runtime evidence here. A page exceeding the idle allowance or a read exceeding the hard ceiling still fails explicitly.
- Installed-device cold/warm retrieval, native light-theme layout and final release delivery remain separate acceptance work. The dark fixture was stress testing only. The root-reported latest ten high-definition artwork candidates remain held for fringe defects; this review grants no artwork quality or replacement sign-off.

This reviewer changed only this report and the separately assigned live-read receipt. No live mutation, provider refresh, deployment or additional agent was started for this review.
