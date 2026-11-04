# Independent collection experience review — 4 November 2026

No remaining implementation blocker was found in the reviewed working-tree changes. This review covers the binder checklist/progress/retrieval changes and the subsequent Home, navigation and Japanese anniversary-logo changes against shipped source `665523719b1d637ec4c06fbcbfd209e565a4a01f`. It is a source and focused-runtime review, not a deployment or installed-device acceptance receipt.

## Binder findings

The actual detail-screen selector now retains every Japanese printing in both standard and master modes. Actual set totals take precedence over printed totals. Master mode expands only canonical catalogue finish identities; provider price keys no longer create collection slots. Saved-only rows remain visible but do not manufacture canonical completion, and unavailable master facts leave the denominator unknown and hide the progress bar.

The library publishes saved ownership before optional master catalogue retrieval. It groups background reads by set/language, runs at most three workers, and guards late publication with the existing account/request generation. The shared `summaryCounts` value prevents the price phase from overwriting later master progress. Collection-only ownership contributes without multiplying quantities into unique-printing counts.

An earlier review found a reproducible false-completion bug: a saved row for canonical printing 1 with stale `api_card_id` pointing to printing 2 inherited printing 2's finishes. The two-printing fixture returned 4/4 instead of 2/4. The final `lib/binderProgress.ts` uses the chosen canonical identity and trusted provider aliases, excludes contradictory canonical UUID aliases, and the exact added regression returns 2/4. Exact canonical identities also survive stale opaque API aliases; repeated collector numbers remain ambiguous without an exact identity.

The reviewed slow-read path is `BinderDetailScreen` access check → `fetchStackrCardsForSet(..., { includeAssets: false, allowPageProgress: true })` → shared canonical facts reader → validated terminal cache → `continueBinderCatalogueRead` → one retained-view reload per account/binder epoch. Metadata lookup remains bounded to 7 seconds. Valid page identity/version/variant progress renews an 8-second idle allowance within a 60-second network ceiling. Foreground callers retain their 7-second budget; leaving one caller does not abort another consumer. Partial, mixed, invalid, repeated-cursor or timed-out results cannot enter the complete cache. The continuation starts after binder access is established, uses an explicit language or known prefix, rejects obsolete requests, and does not clear the visible cards during its reload.

## Home, navigation and logo findings

`features/home/CoreHomeScreen.tsx` retains the account/epoch and request guards. It hides previous-account state during transitions and unverified authentication. `lib/coreHomeData.ts` still validates account ownership, keeps the six-row preview separate from the complete binder-library cache, bounds the private query to six rows, and whitelists only the additional saved artwork identity fields. Optional disk/artwork work does not gate the compact private reads.

`lib/coreHomePresentation.ts` uses the validated stored GBP estimate and its priced/total-unit coverage. Unavailable prices render no monetary zero; valid empty and genuinely priced zero-valued collections remain distinguishable. Partial coverage remains explicit, and the copy states that price dates are unavailable. The Home change does not introduce a provider refresh or claim current sold-market values. Home binder previews explicitly disable binder completion bars because six saved previews cannot establish their completion.

Discover is reachable from Home and Collection. `explore` remains a hidden child route (`href: null`); the primary shell remains Home, Collection and Search. Scan, Market and other capability restrictions remain in place.

The new Japanese logo alias maps only canonical set `88e351b5-8191-5ef4-854b-2978046cda53` to the existing `m6a` asset. Tests cover a renamed binder with only the canonical identity, explicit non-Japanese languages, the separate English UUID and a near-miss UUID. No English or Chinese anniversary edition is repaired by name association.

The Home fixture-render test covers the 320-pixel artwork shelf bound and brand source. Root separately reported React Native Web fixture screenshots that exposed, then corrected, logo overflow and dark-mode wordmark contrast. Those screenshots were not independently inspected in this review; fixture rendering does not establish installed-phone appearance.

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
| Scoped `git diff --check` | Passed; Git emitted its existing LF/CRLF working-copy notice |

## Remaining issues and limits

- The bounded live GET receipt is `docs/releases/build64-set-reads-20261104.json`. Storm had all 113 printings and Abyss Eye all 118 through terminal cursors. This supports catalogue presence; it is not phone rendering or universal catalogue-coverage proof.
- Storm numbers 077–113 were all published as `mega_hyper_rare` in that observation. Restoring those slots does not establish correct AR/SAR taxonomy. No rarity data was invented or changed by this repair.
- Japanese M6a and English 30C metadata returned no asset/logo/image URL fields. The bundled simplified-Chinese anniversary UUID returned 404, and its exact code returned an empty terminal result. English/Chinese anniversary-logo gaps remain separate from the exact Japanese fallback.
- The observed Abyss facts journey took 17,559 milliseconds across three HTTP requests. The progressive reader addresses that class of multi-page timing, but its new behavior has only fixture/runtime evidence here. A page exceeding the idle allowance or a read exceeding the hard ceiling still fails explicitly.
- Installed-device cold/warm retrieval, native light/dark layout and final release delivery remain separate acceptance work. The root-reported latest ten high-definition artwork candidates remain held for fringe defects; this review grants no artwork quality or replacement sign-off.

This reviewer changed only this report and the separately assigned live-read receipt. No live mutation, provider refresh, deployment or additional agent was started for this review.
