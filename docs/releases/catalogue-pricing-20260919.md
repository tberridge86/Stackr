# Catalogue pricing and stable collection valuations — 19 September 2026

Status: implemented candidate with local integration evidence; **not deployed or accepted in production**. Catalogue provider expansion remains disabled. This receipt must stay open through release and device acceptance.

## Source and ownership

Repository `tberridge86/Stackr`; base `989da7d489d4e127ac80a8798a1bf67367942954` was fetched and confirmed as current main on 19 September. PR #202 is merged and its printing/language resolver is reused. Work is isolated on `agent/pricing/catalogue-cycle-20260919`; the heavily modified `D:\Stackr-1` checkout was preserved. No wholesale replay of older work.

The integration/promotion owner is the release role in [the agent guide](../agents/README.md) and [release brief](../agents/release.md). The desktop coordinator retains the bridge role from the build-34 handoff. The accessible task inventory did not show an active release task to which deployment could safely be delegated. Open PRs #201 (scanner), #203/#204 (logos), #188 (migration history) and #185 (cleanup) were checked and left untouched. This PR owns implementation across pricing/API/UI; release review must coordinate backend/schema, catalogue identity and client delivery before promotion.

## Utilisation map and delivered candidate

| Existing path | Change/reuse |
| --- | --- |
| Published `api.catalogue_cards` and approved alias RPC | Freeze all published identities, languages and versions in a database cycle; never use holdings as the sweep population. No artwork or catalogue mutation. |
| Railway owner workers | Existing entry point delegates to the catalogue worker only when its new enable flag is true. Sequential bounded slices, persistent leases, provider spacing/budget, retry dates, negative caching and fair attempt order. |
| `price_refresh_queue` and exact provider service | Reuse authenticated exact work and unique pending identities; add shared catalogue/priority leases and persistent provider backoff. A small publication-priority batch uses revision markers; changed holdings enqueue due/missing exact identities. |
| Shared exact snapshots | Retain source-labelled estimates and provider timestamps. Same exact quote/time reuses existing evidence across days. No claim of completed sales. Normal, explicit English TCGplayer holo and reverse quotes remain distinct. |
| PR #202 saved reference resolution | Retained, including explicit language prefixes, printing UUIDs, conflicting aliases and no guessed PBL repair. |
| Stackr API and gateway | Private authenticated GET `/v1/market/collection-valuation` and POST `/refresh`, no public cache or caller-selected owner. Reads never call providers. |
| Home | Prepared generation supplies total, quantities and coverage. A pending/rebuilding generation retains the previous complete result. Older-server fallback merges evidence per identity, accepts decreases/removals and does not let a legacy transport failure block an independent exact read. Its bounded manual fallback now rotates. |
| Binder | Separate owned subtotal, standard-set and master-set subtotal/coverage. Duplicate binder placement does not create collection ownership. Read-only/public views receive no private valuation. |

Migration `20260919100104_catalogue_pricing_cycles.sql` is additive and service-only. It provides cycles/items/state, provider budget and identity leases, priority markers, complete ownership snapshots, fenced private generation publication, stored exact-price bulk reads, and catalogue-revision checks. The migration was generated with Supabase CLI and executed against isolated PGlite PostgreSQL fixtures, **not either remote project**.

Counts are quantities, except `distinctPriceIdentities` and refresh work counts. `totalUnits = pricedUnits + unpricedUnits`; `pricedUnits = freshUnits + olderPriceUnits`; `unpricedUnits = pending + retrying + unsupported + unresolved + noProviderQuote`. A known subtotal is null when there is no valid priced evidence. A valid zero is retained. Quote freshness uses its original source timestamp and existing expiry, not the current retrieval date.

## Read-only production population and capacity plan

Observed production project: `oakdbbzdqwurpjnoqhmu`, 19 September. [Full variant/finish/revision counts](../pricing/catalogue-population-20260919.json) come from the published catalogue, with zero provider calls.

| Language | Published variants | Exact normal finish | Additional adapter-eligible English finishes | Unsupported/unverified finish scope |
| --- | ---: | ---: | ---: | ---: |
| English | 33,168 | 18,195 | 5,733 holo + 8,182 reverse | 1,058 |
| Japanese | 13,771 | 8,566 | 0 | 5,205 |
| Simplified Chinese | 20,408 | 5,686 | 0 | 14,722 |
| Traditional Chinese | 8,166 | 6,289 | 0 | 1,877 |
| Korean | 239 | 122 | 0 | 117 |
| Total | **75,752** | **38,858** | **13,915** | **22,979** |

52,773 is an **adapter-scope upper bound**, not verified quote coverage: every alias, physical identity and timestamp must still pass. English normal rows with unknown finish (120) are excluded. First editions, foreign special finishes and stamped/pattern variants are not assigned normal prices. No full production cycle has run, so production outcome counts for this candidate are **unmeasured**, not zero failures or 100% accounted.

[TCGdex's official FAQ](https://tcgdex.dev/faq) describes free, keyless access without published hard rate limits and encourages caching; it also describes known marketplace mapping conflicts. This is not a verified numerical capacity/storage entitlement for a 100k-call/day workload. [List filtering/pagination](https://tcgdex.dev/rest/filtering-sorting-pagination) and [GraphQL](https://tcgdex.dev/graphql) were examined; no official production bulk/delta price contract was established. No new provider was enabled and no source approval was modified.

One request per eligible variant has an upper bound of 52,773 requests per cycle / 105,546 per day. At the candidate default 1,000 ms spacing, the minimum provider-active time is 52,773 seconds (**14.66 hours**), before network/DB time, retries and worker gaps. Reserving 20% requires at least 65,967 requests per 12-hour budget for that upper bound. Even that budget cannot overcome the spacing limit. A 60-second worker slice every five minutes adds substantial duty-cycle delay; the existing six-hour schedule cannot deliver catalogue throughput. Published API price is free; Railway compute/storage cost is unmeasured. A verified bulk/delta feed or verified faster capacity and measured throughput is required before activation. There is no supported bulk adapter in this candidate because no such contract was verified.

The worker is disabled by default. Enabling provider work requires `STACKR_CATALOGUE_PRICING_ENABLED=true`, `STACKR_TCGDEX_CAPACITY_VERIFIED=true`, positive `STACKR_TCGDEX_VERIFIED_REQUESTS_PER_CYCLE`, and a 64-hex `STACKR_TCGDEX_CAPACITY_EVIDENCE_SHA256`. The SHA is a release evidence binding/configuration guard; the code does not independently prove the truth of that evidence. Review the actual allowance/terms artifact before setting it. The shared budget is a rolling 12-hour budget; normal sweep uses at most 80%, priority work the remaining allowance. Keep existing owner identity and `MARKET_PRICE_REFRESH_ENABLED` configuration explicit. Do not set these flags merely to clear a failing gate.

## Live baseline and rollback identities

Railway project `d205637b-5376-41aa-9169-1015ba88fec3`, production environment `b4304736-cac8-4ca9-92a7-93f7f6499c2f`:

| Component | Observed baseline | Evidence boundary |
| --- | --- | --- |
| API `299d7ad4-5ed8-4301-b609-ef99274078d0` | Deployment `10613eca-a888-4ef0-af96-8dc1cc7d7d20`, 13 September; `backend`, `node server.js` | Deployment metadata did not provide a commit hash. Do not label this PR #202 or this candidate. |
| Automatic worker `ff1e8d30-4307-45be-855c-5f83f092d8a5` | Deployment `0fa038ac-a0b6-4a48-a789-4c799543e852`, source `989da7d489d4e127ac80a8798a1bf67367942954`; `0 */6 * * *`; `node scripts/refresh-owner-provider-prices.mjs --limit=30 --apply` | Actual 19 September 06:01 logs: `dryRun:false`, 25 refreshed, 5 unavailable, 0 failed. This proves the old worker executed apply; it is not a new-code canary. |
| Queue worker `c4c52418-b307-4c9f-9ffd-e67be163c366` | Deployment `c0f1bf48-9cd6-43e2-a7b2-90dc7d17497d`; `*/5 * * * *`; `node scripts/refresh-owner-provider-prices.mjs --limit=12 --apply --include-queue --queue-only` | New catalogue enable flag absent at inspection. |
| GitHub scheduler | `STACKR_OWNER_PRICE_REFRESH_SCHEDULED_ENABLED=true` | Still active. Candidate workflows honour `STACKR_PRICING_SCHEDULER=railway_catalogue`, but this variable has **not** been set. |
| Supabase | Production project above; staging `lmwfhvexfcoyeuoyrlco` | New migration absent/unapplied by this task. Existing migration-ledger reconciliation PR #188 must be considered before release. |
| Owner client | Checked-in profile `production-owner`, channel `owner-recognition`, app 1.0.3, derived runtime `1.0.3-owner-recognition-v1` | Configuration only. No new EAS update/build/submission, served group or installed-device identity. Historical build-34 receipt is not a current device check. |

Existing provider-to-database baseline: the inspected last-24-hour shared TCGdex snapshot slice had 72 English and 23 Japanese rows. English provider dates ranged 17 September 22:54:32 to 18 September 22:54:58 UTC, latest retrieval 19 September 06:01:32; Japanese source dates 17–18 September 22:54:32, latest retrieval 19 September 00:02:32. These are old-lane persisted estimates; they are not this candidate's accepted provider/database/API trace. Chinese/Korean quote coverage remains unverified.

## Local validation and remaining delivery work

- Isolated real SQL integration covers 1,201 published rows across five languages, full drain/resume, 1,201 manual refresh identities across 25 persisted 50-item batches, expired leases, competing claims, negative caching, cadence, budget, publication-priority markers, service-only access and ownership mutation fencing.
- Real preparation worker + stored-price service + SQL publication/readback: two owned units at £4 produce £8; changing quantity retains old £8/2-unit generation while updating, then publishes £4/1 unit. Provider callback throws if invoked and was not invoked. Corrected published language invalidates the old exact snapshot.
- The same 250-unit fixture starts at £2,500. Next read has 60 newer £8 prices and 190 transient failures; final known subtotal £2,380, 250 priced, 190 marked older. Removal, quantity change, identity correction, authoritative invalidation, account clearing and genuine decreases are tested. These are fixtures, **not the user's production totals**.
- Explicit normal/holo/reverse quote selection, foreign-language rejection, graded rejection, original provider timestamp and Retry-After behaviour are covered. Standard versus master membership and duplicate binder placement are covered.
- HTTP route tests exercise anonymous 401, other-user 403, owner read, private/no-store and asynchronous 202, ignoring forged owner input. PR #202 suites pass 53/53. Owner worker, personal pricing, market pricing service, collection UI, Home refresh/release and Binder retrieval regressions pass.
- `npm run typecheck`, `npm run typecheck:backend`, `npm run lint` (0 errors, 12 existing warnings), gateway tests (44), generated API contract/route coverage (40/40) pass locally. New suites are wired into automatic identity CI. CI for the PR is a separate result.

Unproved: actual migration on a representative remote schema; real bounded new-worker canary; approved full-population provider capacity/terms/bulk option; authenticated live API readback and cold/warm p95/payload/error measurements; sustained throughput; delivered Home/Binder stability on device. No live latency sample exists (n=0), so no sub-500 ms claim. HTTP fixture timings are not production benchmarks. No new provider calls were made by this task.

Candidate limitations to resolve before production acceptance: manual background enumeration now checkpoints 50 identities per invocation and renews its lease, independently of the complete valuation. Very large real-world collections still need throughput/lease-duration measurements. Standard/master membership uses canonical variants and edition; richer per-binder exclusions/custom collecting rules need validation against actual saved preferences. Publication priority notices canonical snapshot changes; alias-only repairs without publication revision changes need an explicit repair signal. Prepared Home currently suppresses the historical trend instead of inventing points; existing per-card history is preserved, but prepared-generation trend delivery is unfinished. Ownership-revision calculation reads the complete private input on summary access and needs live performance measurement/index review. These are reasons to keep the PR draft, not claims that remaining work has shipped.

## Release order and exact rollback procedure

1. Review the candidate and resolve the above implementation/capacity gaps. Capture exact merged SHA and applicable CI. Use the release role; do not overlap another API/gateway/client promotion.
2. Reconcile the live migration ledger, review/apply only the named additive migration through the existing controlled database path, and verify RPC grants/indexes and representative inputs. Do not run a blanket remote migration push.
3. Deploy API through `.github/workflows/deploy-production.yml` with `release_scope=backend_only` and the exact reviewed main SHA. Attest bundled source and owner-authenticated summary response. Then deploy the required gateway routes through the existing gateway privacy release, recording current Worker version/traffic rollback identity first.
4. Run `node scripts/refresh-catalogue-prices.mjs --dry-run` using the worker's existing server credentials and explicit project binding. Review frozen population and verified capacity. A bounded permitted canary must log actual `dryRun:false`, source SHA, exact provider result, persisted snapshot and authenticated API readback; merely changing service settings is insufficient.
5. Disable competing GitHub pricing execution with `STACKR_PRICING_SCHEDULER=railway_catalogue` before enabling the revised Railway lanes. Set reviewed flags/budget and choose a measured recurring slice cadence; database due time remains 12 hours. The existing automatic six-hour/30-card configuration is **not** adequate for activation. Never add an uncontrolled third scheduler.
6. Deliver JS changes to `owner-recognition` only after attesting the currently installed runtime/compatible EAS artifact and rollback update group. This candidate adds no app native module (PGlite is test-only), so an OTA may be compatible; this has not been established for the installed device. Otherwise use `build-owner-ios-release.yml` with the exact reviewed SHA and the existing `production-owner` build/submission path. Record received update/build separately from API/worker deployment.
7. On owner device, compare the same collection across opens, partial failures, refreshes, quantities/removals, standard/master modes, sign-out and account changes. Capture known subtotal and exact coverage/source age, not screenshots of a spinner alone. Measure authenticated API cold/warm reads separately from app render latency and confirm zero provider calls while opening Home.

Rollback: first stop the new sweep/queue services or remove `STACKR_CATALOGUE_PRICING_ENABLED`, preventing new provider work. Restore automatic service to deployment `0fa038ac-a0b6-4a48-a789-4c799543e852` with the exact old command and six-hour cron above, and queue service to `c0f1bf48-9cd6-43e2-a7b2-90dc7d17497d` with its old command/five-minute cron. Verify actual logs after restoration. Restore API deployment `10613eca-a888-4ef0-af96-8dc1cc7d7d20` only if reverting API is needed. Keep additive tables/history; do not drop or delete price evidence. Restore captured pre-release gateway version/traffic and client update group (not yet captured, so rollout is blocked until known). Restore the previous GitHub scheduler selection only after Railway rollback is verified, avoiding overlapping pricing execution. New Home can fall back on an old API's 404; Binder shows pending rather than inventing a value. No rollback action has been performed by this task.
