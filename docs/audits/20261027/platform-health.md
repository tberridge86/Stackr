# Stackr platform health — 27 October 2026

Bounded audit alongside the R2 transfer. Source: `b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`.
Live observations approximately 15:08–15:17 UTC (London time on this date).
Production Supabase: `oakdbbzdqwurpjnoqhmu`; Railway project: `d205637b-5376-41aa-9169-1015ba88fec3`.

The current split remains appropriate. The most useful next work is delivering
existing correctness fixes and reducing measured valuation work. There is no
evidence here that the API needs more CPU or memory. This is a scoped health
assessment, not a best-in-class certification or a production load test.

## Completed repair

**PH-REL-001 — overlapping production releases:** the owner and hardening
release workflows used a different concurrency group from the standard production
release, despite targeting the same API. Both now use the existing
`stackr-production-deployment` group with `cancel-in-progress: false`.

Four backend jobs across three workflows pass the new focused YAML regression;
the original configuration fails. The test is imported by the existing deployment
tooling suite. Independent review found no blockers. Active releases will not
cancel each other; GitHub can still replace pending runs, so this is not a durable
FIFO queue. No deployment, worker restart, migration, source deletion or merge
was performed by this audit. Production benefit requires merging the fix.

## Platform results

| Platform / check | Status | Evidence and implication |
| --- | --- | --- |
| GitHub release serialization | Failed baseline; fixed/tested in candidate | PH-REL-001 above; existing release controls and triggers preserved. |
| GitHub build repeatability | Passed, bounded source check | 111 workflows parsed; all 492 external step actions SHA-pinned. Sampled production/Pages/iOS lanes use npm ci. Does not certify every dependency or live repository permission. |
| Existing integration | Failed delivery; existing work retained | PR #446 owns account-cache, Home, search continuation and restore-security fixes. Its checked head has 14 successful checks and two skipped gates; it remains unmerged/undeployed. PR #448 remains the adjacent transfer owner's recovery integration. PR #185 already owns cleanup. |
| API release identity | Passed, live attestation | `/health` returned bundled source `7c1acd409680`, deployment `dfc23b30-9675-4ba0-ad2b-9f1875302747`, production environment and correct Supabase project. Do not substitute Railway's configured source commit or current main for this running identity. |
| API resource headroom | Passed, observed low-load window | 288 five-minute samples over 24h: memory average 0.186 GB, maximum 0.215 GB, current 0.146 GB against 8 GB limit; CPU maximum 0.00363 against reported limit 8. This is not peak-capacity evidence and the limit is not billed allocation. |
| Database connections | Passed, point-in-time | 25 connections / configured 60; one active; zero lock waiters. Database size 3,274,624,147 bytes. No capacity upgrade indicated by this observation. |
| Database read isolation | Passed, narrow live test | Read-only transaction as authenticated role with synthetic non-owner subject returned zero private binders, other profiles or other holdings. All public ordinary/partitioned tables have RLS enabled. Does not test sign-in, write authorization or real account switching. |
| Auth protection | Failed configuration check | Supabase advisor reports leaked-password protection disabled. Enable through Auth configuration when account access is available. No credential or policy changes performed. |
| Security advisories | Triage completed, not blanket failure | 33 RLS-without-policy informational findings and 11 authenticated SECURITY DEFINER warnings. Inspected admin directory uses trusted-admin guard; is_admin delegates to trusted server-controlled claims. Do not open service tables or revoke all functions merely to silence warnings. Remaining functions need targeted review if changed. |
| Migration history | Failed full reconciliation; existing issue | 191 source migration files vs 192 live entries; 17 source-only and 18 live-only version labels. Includes known renamed collection-summary migration and intentionally pending work. Existing Oct21 reconciliation explains much of this. Do not replay all differences or rewrite applied history. Content/replay reconciliation remains outstanding. |
| Catalogue integrity | Passed constraints check; full data check unmeasured | No unvalidated catalogue constraints found. Combined asset relationship/metadata aggregate hit its 8-second audit timeout; stopped rather than raising the budget during transfer. Final exhaustive R2 metadata reconciliation stays with adjacent migration work. |
| Valuation performance | Failed operational reliability; measured | Successful generation at 15:10 took 58,608 ms: catalogue_members 50 calls / 23,745 ms; stored_exact_prices 16 calls / 19,263 ms, slowest 8,196 ms. A 15:01 generation failed at stored_exact_prices with SQLSTATE 57014. These are background-worker timings, not Home paint times. |
| Query cost | Measured; targeted investigation required | Cumulative request_collection_valuation average 1,531.5 ms / 448 calls; exact-price average 542.6 ms / 119,329 calls. Stats span different historical windows; they are not today's benchmark. Fresh overlapping query snapshots also show 30 catalogue_cards calls consuming 7,108 ms. |
| Railway scheduled workers | Mixed | Five-minute queue worker subsequently published valuation successfully. Catalogue-price worker finished at 14:15 but reports needs_mapping and fullCatalogueCurrent=false; earlier coverage reads timed out. Cardmarket production has a cron setting but no active deployment in the inventory; latest listed deployments are removed, newest dated Oct19. Reconcile intentional pause/handoff before restarting. |
| Scheduler overlap and job recovery | Unmeasured live ownership | Source has scheduler handoff guards and job mechanisms; names and cron schedules alone do not prove duplicated writes. No flags, schedules or retries changed. Existing successful later runs establish recovery for sampled failures, not every interruption case. |
| R2 public objects | Passed, six-file sample | Three originals and three card-grid WebP files fetched publicly; all six match database SHA-256, byte size and MIME. This does not certify every asset or private-storage configuration. |
| R2 rendition/caching | Passed, bounded sample | Sample thumbnails 18–21 KB vs originals 128–210 KB. Immutable one-year cache headers present; same-client repeat of one original returned HIT, Age 262. A repeat using a different default client got 403; do not interpret that as an app/CDN outage or a global cache-hit ratio. |
| R2 migration/new writers | Adjacent work / unmeasured configuration | Do not restart or duplicate active transfer. Source writer bindings exist; staging/production secret scope and a fresh ingestion receipt still need verification. No full-bucket cleanup authorized by this sample. |
| Gateway/public API | Passed, limited live smoke | Gateway /v1/health and search returned 200 with catalogue results. Fresh local gateway cache tests 13/13, circuit isolation 4/4 and search language fixture pass. Runner timings include remote proxy/network overhead and are not phone latency. |
| Website/Pages/DNS | Unmeasured, access blocked | Root and www domains returned an audit-runner upstream connection error. Cloudflare account UI reached sign-in, so Pages project, DNS binding, deployment SHA and billing could not be verified. No outage or successful Pages deployment is claimed. |
| Installed app | Unmeasured; source defects have existing fixes | No phone or signed-in app session available. Main retains binder-ID-only caches and missing search continuation; PR #446 has reviewed fixes. Deliver that candidate then perform one short account-switch/search/Home/Binder acceptance pass. Do not duplicate its changes. |
| Monitoring | Passed sampled monitor; coverage unmeasured | Existing Production API Monitor run 40493107091 succeeded. API sample includes intentional commerce-lock 503/410 responses and 401 auth rejection; those are not general downtime. Four manifest client-abort 499 entries merit correlation, not an invented error rate from a small sample. Railway tracing is off; existing logs and timings were sufficient to locate the worker bottleneck. |
| Backup/rollback/D: | Unmeasured execution | Railway retains redeployable release evidence. No disruptive live rollback performed. D: is not mounted in this runtime; no isolated backup image or restore target available. Database restore, file-to-metadata restoration and independent backup coverage are not certified. |
| Costs/capacity | Unmeasured billing/load ceiling | No billing exports or controlled peak-load run available. Keep current API capacity; inspect inactive services and worker efficiency before spending more. No service or data deleted based on an unused-looking name. |

## Practical follow-up queue

| Priority | Owner | Next action |
| --- | --- | --- |
| 1 | Release | Merge the focused concurrency fix after normal checks. Deliver existing PR #446 through its established lanes and perform short device acceptance. |
| 1 | Transfer owner | Complete #448 receipts, pointer reconciliation and final retrieval checks. This audit does not interfere with its worker. |
| 2 | Performance + pricing | Use the captured valuation stage timings to reduce catalogue round trips and inspect stored-price query plans. Preserve exact variant/language/finish and last-good valuation semantics; measure before/after on the same sample. |
| 2 | Backend | Continue existing migration reconciliation, including the recorded collection-summary version mapping. Run restore/security rehearsal on an isolated target when available. |
| 2 | Backend/Auth | Enable leaked-password protection using authenticated project settings, then verify. |
| 2 | Pricing/release | Resolve whether Cardmarket's removed deployment is intentional; verify scheduler ownership and only resume the existing lane when its configuration is understood. Catalogue mapping gaps are data coverage work, not fixed by more servers. |
| 3 | Release/owner | Provide authenticated Cloudflare access for Pages/DNS/cost verification; inspect actual D: backup and installed app. These remain explicit access-dependent checks. |

## Evidence

Machine-readable snapshots are in [evidence](evidence/). SQL probes were read-only
and bounded to 5–8 seconds; no image bytes were saved locally. The six sampled
public images were streamed only for checksum verification.

- [Release/GitHub audit](platform-health-release.md)
- [Client/gateway audit](platform-health-client.md)
- [Worker stage timings](evidence/valuation-worker.json)
- [Migration version comparison](evidence/migration-version-comparison.json)
- [CDN verification](evidence/public-delivery-probes.json)
- [Same-client cache hit](evidence/cdn-same-client-repeat.json)
- [Supabase advisor remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

No background task was created. Missing evidence is Unmeasured, not an automatic
block on unrelated improvements. No overall health percentage is assigned.
