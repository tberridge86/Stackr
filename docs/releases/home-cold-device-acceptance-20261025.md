# Device acceptance — Home cold retrieval candidate, 25 October 2026

Status: PREPARED, NOT RUN. CI, local fixtures and web exports do not close these cases.

Record the installed app version/build, EAS build/update ID, source commit, runtime fingerprint, configured API host, backend/gateway revision receipts, database ledger, phone model/OS, network, account alias and collection counts before testing. Never put tokens or private card notes in release evidence.

Use two existing authorised test accounts with different holdings; include empty, small, large (>500 saved and owned rows) and EN/JA/SC/TC/KR cases. Establish expected complete counts independently. If suitable accounts or a device are unavailable, keep the associated case BLOCKED rather than inventing results.

Distinguish process-cold (force-quit/relaunch), facts-cache-cold (no valid in-memory facts snapshot), disk-preview-warm and immediate return within the 30-second facts TTL. Do not delete unsynchronised collection data to manufacture a cold run. Record five comparable samples for each measured condition; report individual samples and median, not unsupported percentiles.

| ID | Action | Required result and evidence | Status |
| --- | --- | --- | --- |
| H01 | Cold Home launch; then immediate return and return after TTL | Timestamp first useful holdings, first usable valuation, optional sections and complete settlement separately. Count auth/data/pricing/catalogue/image requests and bytes. Verify actual returned page cap; 11 large-fixture reads is conditional on cap500, not an acceptance assumption. | NOT RUN |
| H02 | Use empty, small, large and five-language collections | Complete saved and owned results, all unowned placements, quantities and printing identities match expected counts. Missing prices remain unavailable. No secret/high-rarity cards disappear. | NOT RUN |
| H03 | Switch chart range; pull to refresh; wait for normal stored-price poll | Range/history stays coherent; explicit refresh bypasses facts and binder-list reuse; no duplicate restart loop. Price/history requests stay independent of cached facts. | NOT RUN |
| H04 | Add/remove a test holding and binder, then restore the test change | Facts invalidate; old reads cannot overwrite the edit. Previous valuations retain their own quantities with a stale/updating warning until current evidence arrives. Record restored state. | NOT RUN |
| H05 | Start a slow load, navigate away and rapidly return | No obsolete edit timer, hidden scan continuation or stale result replaces the current screen. New content remains visible if an old disk write finishes later. | NOT RUN |
| H06 | Offline reopen, failed refresh, then restore connectivity and retry | Useful scoped cached content remains visible and labelled; failure is distinct from empty. Retry recovers without loops or disappearing content. Test memory-warm and disk-preview states separately. | NOT RUN |
| A01 | A → logout → B → A, including while reads/writes are pending | No A holdings, notes, images or totals appear in B. Expired/denied sessions do not authorise live reads. Same-account login cannot resurrect an old in-flight response. | NOT RUN |
| B01 | Open/reopen large standard and master binders; edit ownership | Counts, completion, pagination and price coverage remain complete. Validate supplied Storm Emeralda logo and Crown Zenith Galarian Gallery logo without merging checklist identities. | NOT RUN |
| S01 | Search Pikachu/Wartortle and multilingual set/card references; change query rapidly; fail/retry one source | Useful independent results remain visible; no late query replaces newer results; full continuation and honest partial/error states work. Artwork matches exact printing. | NOT RUN |
| P01 | Pokédex list/detail and species/forms; paginate, change ownership, fail/retry | Complete cards/forms and ownership; no borrowed language/finish identity; populated results retain recovery controls. | NOT RUN |
| I01 | Open representative legacy and R2 thumbnails, then enlarged inspection; test private media with the other account | Exact approved artwork survives both delivery paths; private media is not publicly retrievable or included in catalogue caches. Record missing or held artwork explicitly. | NOT RUN |
| R01 | Profile before/after the separately approved summary migration | Complete counts/coverage match baseline; user B's public binders are excluded for A; anonymous execution is denied. Missing-function compatibility and permission-denied behaviour remain distinct. | NOT RUN |

Attach redacted request receipts, source identities and short screen recordings to each case. Keep the original Build 60 repair register open until its corresponding phone behaviour is actually accepted. This checklist does not establish that haptics, Showcase lighting or earlier artwork holds are fixed on the phone.
