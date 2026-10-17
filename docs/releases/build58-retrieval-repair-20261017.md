# Build 58 retrieval repair

The owner confirms installed TestFlight 1.0.6 (58). Startup is quick, but binders report “Binder unavailable”, Mew returns sets rather than cards, and Home later stops loading. Earlier Celebi and exact set-card failures were independently reproduced through the production API.

## Reviewed source changes

- Search and single-card API responses retain successfully loaded card facts when optional artwork fails or exceeds 500 ms. The underlying SDK fetch/body read receives cancellation. Essential fact failures remain errors; exact printing, language, variant and artwork provenance rules remain.
- Search ignores late results and queued ownership/listing updates after settlement, replacement or account invalidation.
- Uncached Card Detail displays selected canonical facts before its optional image-manifest/provider pipeline completes, while later approved images retain their existing display-only provenance. Route/account guards reject late results. Actual runtime regressions and final independent review passed.
- Home's two local settings/artwork waits have the existing ten-second deadline. A stalled read offers an honest retry, preserves an eligible saved valuation and cannot publish late private data after sign-out. This locally reproduced gap is not established as the owner's phone incident cause.
- The exact Storm Emeralda Japanese M6 logo is bundled locally and resolves from the existing binder's canonical set ID. M5 and M6a remain separate.

The backend diff from the last verified production source `0188361a1b1e278ea180f9eec5ec487af52ca8cd` is limited to the optional-artwork repair in `backend/lib/stackrApiV1.js`. No database or catalogue change is included.

## Storm logo evidence

The owner explicitly confirmed that Bill's Archive permission covers downloading, bundling and displaying this exact logo. The [scoped permission record](../../catalogue/rights-reviews/billsarchive-m6-set-logo-owner-approved.2026-10-17.json) records that attestation without claiming an independently issued licence or wider source activation.

The unchanged source WebP is **640 × 170**, 16,610 bytes, transparent, visually inspected by the artwork specialist, integrator and independent reviewer. SHA-256: `ef4ea9578d26a3b9ed3aacc731a447014946e776bf3bdf438fa0306e58d70b50`. The source page's 1918 × 510 HTML dimensions are display sizing. The historical 223-logo manifest is unchanged; the exact additive M6 manifest raises runtime inventory to 224. The iOS bundle verifier now requires this exact asset alongside the existing recovery assets.

This is a native bundled logo repair; no API asset row was published. Native inclusion and physical rendering must be verified before claiming delivery. The earlier card-artwork programme and its remaining unresolved batches are not closed by this repair; no new card-image replacement batch is claimed here.

## Live evidence and limits

The approved read-only database diagnostic ran its four blocks once with READ ONLY/ROLLBACK and three-second statement limits. The tool exposed only each block's last SELECT. It returned a limited lock snapshot, 23 named indexes and two estimated plans, not measured execution times. A same-scope wrapper to recover discarded outputs failed once with a connection timeout and was not retried. No database write occurred.

At 09:32 UTC, Storm's facts-only route returned exactly 113 Japanese cards in 1,048 ms while Celebi still returned 504. Contemporaneous image-manifest timeouts support the optional-artwork diagnosis without exact request-ID correlation. Later logs still contain database/PostgREST timeouts. Current English 30th, Japanese 30th and Classic counts remain unverified; the source inventory alone does not prove their live availability. The owner's private Home/binder failure and card haptics remain unverified on a device.

## Controlled release handoff

PR [#406](https://github.com/tberridge86/Stackr/pull/406) is the repair candidate. Final review, checks and the frozen export receipt must be reconciled before requesting live approval. No new deployment, native build, submission, OTA, catalogue mutation or price job has been performed.

After matching owner approval: merge the reviewed candidate, deploy only the reviewed backend with existing production bindings, then verify actual Mew/Celebi card results, all four target set metadata/card responses and individual-card detail. Run the existing published-mobile delivery gate. Create the normal production TestFlight build only after the public journey checks pass; retain physical Home/binder/card/haptics acceptance as explicit follow-up. Preserve the previous backend deployment `0ec29984-7ac0-4cc6-93d9-4c26beb871d9`, TestFlight 58 and the earlier native rollback evidence. Do not reset or replay reserved build 57 with its unknown outcome.

Detailed evidence: [retrieval report](../performance/build58-set-card-retrieval-20261017.json) and [shared repair queue](../audits/20261010/repair-queue.json). The actual frozen export and new-head hosted checks are pending at this source freeze. Their receipts will be retained in the private repair evidence folder and referenced from the PR description after verification.

## Post-release observation and request cancellation follow-up

PR #406 was approved and merged as `ccccc9ef48b2c501650ea3496a4af2c7ebc902c2`. The server deployment and runtime attestation passed, but the post-deployment catalogue verification failed. The required owner journey check reached the expected server and Mew Search returned HTTP 504; later probes were skipped. These results leave live retrieval unresolved. No new native build, TestFlight submission or OTA was published.

The separately approved Postgres snapshot was attempted once and returned a connection timeout with no diagnostic rows; statement execution is unknown. A separately approved four-minute provider-log aggregate returned a service error with no result rows. Neither was retried. Provider lifecycle metadata still reports healthy, which does not measure connection availability, CPU, memory or disk pressure. The owner has now supplied resource charts; the observations below supersede the earlier pending-readings state. No specific infrastructure cause is established.

An independent local assessment confirmed a separate request-lifecycle gap: abandoned public catalogue reads could continue SDK work and start fallbacks. A focused local repair now propagates disconnect cancellation without replacing existing artwork/translation deadlines or changing authenticated pricing/admin scope. The actual-router/SDK regression was RED on the deployed source and all 13 focused cases now pass. Existing API/artwork/translation/observability checks and 9 identity/set cases pass; backend typecheck passes. Independent review accepted the exact five source/test hashes and independently reran all 13 focused cases. Repository lint passed with 0 errors and 8 pre-existing warnings.

See [the focused evidence](../performance/public-catalogue-cancellation-20261017.json). This local repair is not evidence of the production failure's cause or recovery and has no matching live release approval. The unchanged Storm M6 logo passed the merged-source local export asset check; signed native/TestFlight delivery and installed-device acceptance remain pending. Earlier unresolved artwork batches remain as disclosed in this release record.

## Resource evidence and release verification follow-up

The owner's Primary Database charts show 13 connections against a displayed limit of 60, one dedicated-pooler client against 200, and 3.26 GB disk usage with 8 GB provisioned. Shared-pooler readings are unavailable. These observations weaken full-disk and global-connection-ceiling explanations in the shown window. They do not rule out a smaller PostgREST internal pool occupied by slow or stalled reads. Earlier swap and I/O-wait readings still need workload and latency attribution; they do not establish an OOM, restart or a need for a paid upgrade.

A bounded structural review of existing saved logs found no hidden SQL in the later 37-row projection. An earlier receipt contains timeout statements for artwork-manifest, stored-price and database-statistics reads, including duplicates. Those earlier statements cannot identify the later Mew failure. Neither approved diagnostic was retried.

The owner-backend release lane now opts into a locally tested first-failure stop. It aborts an unread failed response, flushes an honest partial JSON receipt and exits unsuccessfully before later checks. Existing default continuation and all successful-run requirements remain. The lane also runs the regression before deployment and saves clean JSON. All 23 local CLI/loopback regression cases pass and were independently retested; final source hashes were accepted. The original five-file cancellation repair is unchanged. A held-response fixture failed before the teardown repair and passes afterward; this does not establish an indefinite production hang.

These are reviewed source changes in draft PR #407. Fresh hosted checks must match the final updated head; checks on its previous head cannot certify the added change. No PR407 merge or server deployment is approved or performed. The proposed server-only release preserves existing bindings and an unrelated staged credential patch. Its existing SOURCE_COMMIT deployment-metadata write must be covered by matching approval. No database, catalogue, pool, compute, storage or credential change is proposed. TestFlight remains held until actual public retrieval and mobile delivery gates pass.
