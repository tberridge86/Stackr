# Architecture setup readiness — 24 October 2026

This is a prepared integration and rollout record. It is not evidence of a live deployment or asset migration.

## Exact source provenance

- Main/base: `7e22cee8d94f2904c3c2cfcf2c0e28da74eabdcc`.
- Architecture PR #437: `8445e60278fccdf0601e1c7cad68a7e038c8a603`.
- Build 60 retrieval PR #436: `65a671771f6bdfca3eb3723f136e27fe427736cf`.
- Isolated candidate: `D:\Stackr-1\.worktrees\architecture-integration-20261024`, starting from local snapshot `c65c0ca254a19ac9623989a4f949bf22de6117ff`.
- Both remote PRs remained draft and main was unchanged when inspected today. This records the local preparation checkpoint. The new integration PR and its checks record the current combined head and hosted validation status. Earlier green CI belongs to PR #437's source, not this combined candidate.

The integration preserves both PRs: R2-aware reader/writer boundaries; 50-item client requests; complete logical catalogue windows; bounded optional-device-storage waits; cancellation and retry; partial artwork-page recovery; saved binder identity; URI-based image cache reuse and stale-callback rejection; web lazy images; and genuine daily catalogue movers.

Combining a 64-page ceiling with 50-item pages would silently reduce the previous 32,000-row capacity to 3,200. The combined pager retains 32,000 rows with up to 640 bounded pages. Focused regressions cover the real combined pager, mixed-provider set-card fallback and facts-only behavior. Generated API types are regenerated from the combined OpenAPI contract. Daily movers depend on `supabase/migrations/20261022064554_catalogue_daily_market_movers.sql`; its presence in source does not mean it is applied.

## Retrieval rollout limits

The repaired catalogue, ownership, Home, Binder and trade readers enforce 50-row responses while preserving complete logical results, current-account checks and retry behavior. This increases request count for large collections: the 1,003-row summary fixture now requires 22 requests, including its empty terminal page. These are offline correctness results, not evidence of faster live retrieval. Benchmark small, large and multilingual collections before promotion; server aggregates remain the preferred way to reduce work for totals. Other confirmed frontend query sites remain listed in `remaining-ui-query-boundaries-20261024.md`; this candidate does not claim universal query compliance or sub-100ms latency.

Eight retained public-writer steps across seven workflows now receive environment-scoped R2 bindings, with guards and schedules preserved. The new `deploy/r2-writer-workflows.md` records the exact scope and configuration prerequisites. This is wiring, not evidence that credentials exist or can access the destination.

## Service targets

Existing identifiers below were observed previously and must be re-read after access is restored. Proposed resources are not verified as existing.

| Resource | Target | Status |
| --- | --- | --- |
| Railway project | pocketvault — `d205637b-5376-41aa-9169-1015ba88fec3` | Previously observed |
| Railway production environment | `b4304736-cac8-4ca9-92a7-93f7f6499c2f` | Previously observed |
| Existing API service | `299d7ad4-5ed8-4301-b609-ef99274078d0` | Previously observed; preserve running service |
| Migration service | `stackr-catalogue-r2-migration` | Proposed dedicated inactive service |
| Durable migration journal | `/data`, writable by UID 1000 | Proposed volume |
| Supabase production | `oakdbbzdqwurpjnoqhmu` | Read access verified today |
| Cloudflare account | `b4c23b0834cc5a113aa4a98fd904b281` | Previously observed |
| R2 public catalogue bucket | `stackr-catalogue-public` | Proposed destination |
| R2 CDN hostname | `assets.stackrtcg.com` | Proposed; DNS/bucket binding unverified |
| Cloudflare Pages project | `stackr-web` | Proposed; no domain cutover |

Use repository-root build context and `deploy/catalogue-r2-migration/railway.json`. Keep the default disabled command, restart policy NEVER, no cron and no public domain. Its minimal package does not contain root npm scripts; invoke `node scripts/migrate-catalogue-to-r2.mjs` directly for an explicitly configured run.

## Access observed today

- Railway MCP requires reauthentication.
- Official Railway CLI 5.30.1 attempted to refresh existing OAuth credentials and returned `invalid_grant`; it requires a fresh Railway sign-in.
- Existing Cloudflare Wrangler OAuth credentials are expired and could not refresh.
- Browser control is unavailable in this session.
- GitHub and read-only Supabase access work.
- A bounded production check returned no `catalog.assets` rows with `storage_provider='s3_compatible'`.
- Current R2 activation/billing status is unverified. The last inspected page, on 23 October, showed R2 inactive. A Railway subscription update does not establish R2 activation.

No live service, database, bucket, DNS, scheduler or asset was changed during this setup attempt. No catalogue images were downloaded locally. Access restoration is required to complete provisioning; local preparation and offline tests do not substitute for it.

## Concrete rollout sequence

1. Restore Railway and Cloudflare authentication, then re-read the project, environment, current deployments, schedules, R2 activation, bucket and domain state. Preserve unrelated work already running.
2. Reuse or provision the inactive dedicated migration service and durable journal volume. Reuse or create the intended R2 bucket and custom domain after checking current account state. Configure bucket-scoped server credentials and the explicitly pinned production Supabase connection; never place secrets in source or client variables.
3. Build the combined source and require CI for its exact new commit. Reconcile the daily-history migration with the live migration ledger before any daily-mover feature activation.
4. Deploy the compatible combined card, manifest and fast set-card readers before changing any image pointer. Confirm actual running revisions. Configure every retained public writer for R2; otherwise the intentionally strict writer will stop public writes.
5. Generate a 25-asset metadata inventory on the migration service. Execute only its exact digest with the same bounds and durable journal. Verify authenticated R2 read-back and public CDN byte hashes, lengths and MIME types before database compare-and-swap publication.
6. Verify actual card/set API responses and Home, Search, Binders, Pokedex and Showcase in the app. Measure warm/cold retrieval and image behavior separately. Only then advance bounded batches, reconciling failures and counts. Preserve source objects and rollback receipts.
7. Handle approved external image references, legacy saved URL snapshots and bundled assets separately. Private scans, profile media and listing photos must retain their access controls; they are not part of the public catalogue copy.
8. Build and review the Pages export, then verify the intended project, Auth redirects and API/CORS configuration. The guarded workflow publishes the initial production Pages alias, stackr-web.pages.dev; it is not a preview-only deployment. Complete app acceptance there before any custom-domain or DNS cutover.

Strict server pagination remains off until compatible clients ship. Existing pricing scheduler ownership remains unchanged until a bounded Railway rehearsal and stop/drain/start handoff prove no overlap. No private-media migration, DNS cutover, scheduler activation or latency guarantee is implied.

## Validation status

Local combined checks pass: root and backend TypeScript checks; all 16 non-Pages architecture scripts; 40 gateway tests; the generated API contract and 43 route checks; affected ownership, Home, Binder and retrieval regressions; workflow YAML parsing; whitespace checks; and the repository secret scan. The full Build 60 aggregate stopped at a missing local CanvasKit WASM dependency; the remaining independent suites passed. The final Pages guards and the full locked-dependency suite require hosted CI for this exact combined commit. Earlier source checks do not certify it.

The Pages publication workflow requires an exact reviewed commit and a protected environment. Its YAML environment name does not prove required reviewers are configured; verify the actual environment settings before publishing. It neither accepts billing terms nor grants itself deployment approval. Live R2/CDN/app/device validation, database migration execution and retrieval latency remain unverified.
