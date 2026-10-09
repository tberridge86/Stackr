# Mobile release recovery, 9 October 2026

The owner's iPhone is recorded by Apple as installed on `1.0.6 (54)`. The reported missing changes are a release-content problem. The premium opening, card-to-sleeve-to-top-loader animation and clickable CoroCoro library were omitted from the source assembled for build 54, although the work existed in the original desktop checkout. Agent implementation was not reconciled with the actual release candidate. The release should not have been represented as completing the owner's full scope.

The same recovery candidate now includes the [server/API delivery correction](server-mobile-delivery-20261009.md): a first-party versioned Pokédex index, server English names/search, bounded server provisional prices, published-version/cache fixes, and a gate that verifies deployed API content before a native build. That receipt supersedes the earlier export and legacy-cache notes below. The later mobile cache key accepts only a validated complete 1,350-entry published list.

## Candidate contents

The recovery branch is `codex/recover-missing-mobile-work-20261009`, based on main `e3bfacc83265090b94cbb2431495069cd8722757`. The original dirty checkout is preserved. This candidate contains no new dependencies and no server, database, catalogue or price-provider mutation.

- **Opening and in-page loading:** Restore the requested premium video/poster, configure the native splash with that poster, and replace 52 existing native-ring loading callsites with the shared card/sleeve/top-loader indicator. Playback and animation respect system Reduce Motion, pause/clean up appropriately, and retain startup failure deadlines. Loader layers use the native animation driver and do not hold up interaction scheduling.
- **CoroCoro:** Add the reachable Discover magazine library, publication and issue navigation, issue card pockets, and exact card/set links. Resolve 26 already-tracked owner-supplied covers locally on production iOS, rather than through a development-only localhost path. The archive contains 34 documented issues and 54 card references. Only the two previously curated Mew editions have exact Stackr card mappings; other references remain explicitly pending. A null remote lookup no longer erases available curated card facts. No duplicate cover pack is added.
- **Set price reads:** Decorate raw-card browse results immediately with the existing labelled provisional fallback, while reading saved quotes for the visible incremental set grid and one nearby page. The initial window is 28 cards, not the entire set. Keep already-read quotes in the current card list, purge old-list rows, and isolate accounts. This is a request-efficiency improvement, not a provider refresh or complete market-price backfill.
- **Haptics and card motion:** Add the existing preference-aware Test touch feedback action to Settings. Fix compact and detail inspection surfaces to obey the saved Reduce card motion setting, including pending/failed preference reads. Existing long-press inspection, restrained gyro and reviewed-material foil feedback remain. Native dispatch does not prove that feedback was physically felt.

- **Main Pokédex:** Publish the first 151 factual entries before awaiting the remaining bounded page. Keep partial data out of memory/disk caches; validate response shape, counts and the full deduplicated merge before persisting. Keep a previously complete cache visible during refresh failures. Show honest loading-more/partial retry states, guard stale requests, and retain the expected progress denominator while the list is partial.
- **Set search:** Rank results from facts-only set reads without enumerating the global set-artwork manifests first. Approved/local result-logo fallbacks remain. This removes a concrete blocking chain; it is not a measured instant-search guarantee.

## Evidence and delivery limits

Focused recovery checks cover startup and loader lifecycle, actual bundled cover files, exact issue associations/navigation, price-window behavior/quote retention/account isolation, and saved card-motion preference behavior. The main Pokédex runtime fixture exercises the production orchestration with deferred fetches: usable first page before continuation, no partial cache writes, full merge/retry, preserved complete cache after failure, malformed/truncated rejection, and unmount/superseded response guards. `verify-mobile-recovery-bundle.mjs` verifies both recovery UI strings in exported iOS code and byte-identical premium/loader/cover assets in its manifest. This catches local-only content omissions before a native upload.

An exported iOS bundle is not a signed native archive or physical-device acceptance. No replacement TestFlight build or upload is recorded by this document. Do not treat build 54 as containing this branch.

Final local validation on the frozen application source:

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors and eight pre-existing warnings.
- `npm run test:mobile-recovery`: passed, including the main Pokédex runtime fixture.
- Shared card-first UI checks: all 13 passed after updating the fixture's shared-loader dependency and priced visible-list binding. All five follow-up checks passed, including execution of the actual filter/window/priced-row presentation chain and toolbar busy-state behavior.
- Relevant Home release, binder catalogue and personal-loading groups: passed.
- `git diff --check`: passed.
- Production-environment iOS export: passed, 3,362 modules; this is packaging time, not an app-loading measurement. The existing absent ignored Android `google-services.json` produced a config warning but did not prevent the iOS export.
- `node scripts/verify-mobile-recovery-bundle.mjs .tmp/mobile-recovery-final-20261009`: passed; recovery UI content and 33 byte-identical assets verified.

The reviewed export's iOS bundle is `entry-a62d5039041c74330b20f8d8b16b0d2b.hbc`, 11,568,411 bytes, SHA-256 `76e743f3892bf6bf563517234da2cb75bdca1ff0123a1699eadea27114f2b664`. Generated bundle files remain local; source, tests and this receipt form the review candidate.

The configured independent Stackr reviewer found no actionable task-caused correctness or account-boundary defects against the stated baseline. Its separate hardening note is retained: existing Pokédex v1 disk arrays have no completeness metadata, so their historical completeness is not independently attested. New remote writes are fully validated; this candidate preserves the existing legacy-cache read contract for continuity. Native/device acceptance remains outstanding.

## Work still open

- Provider-backed, calibrated price coverage across the full catalogue. The existing rarity/era fallback is low confidence and not completed-sale evidence or a current provider market quote. No current full-catalogue coverage percentage is asserted.
- Measured cold/warm launch, search, set-card and Pokédex behavior on actual iPhone hardware. Removing blocking work does not establish universal instantaneous loading.
- Eight documented magazine issues without supplied covers, unresolved exact card mappings and missing card artwork. Unavailable content is shown honestly.
- Remaining HD artwork and source-backed English display/description gaps, including the previously documented incorrectly named Trainer card. The new candidate integrates existing approved English-name records on the server; production publication and remaining canonical corrections are not established by local tests.
- Physical haptic, card tilt, image quality and accessibility acceptance on the uploaded replacement build.

Scheduled work remains removed as requested. Completing local agent tasks does not automatically create a native release.
