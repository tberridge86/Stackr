# Binder Pokédex and retrieval follow-up — 2 November 2026

The owner clarified that Pokédex belongs to the Binder page and must remain intact. The priority is retrieval. Home, Search and Binders remain the three primary navigation entries; Pokédex and Pokémon detail remain reachable through Binders.

## Client corrections

Home previously awaited every local master-set preference before starting its compact totals RPC. A deliberately unresolved storage fixture reproduced zero RPC calls. Home now requests its owned/unique/binder totals immediately. It uses the existing shared QueryClient and invalidation/account namespace, with a distinct totals projection key so a response without local master overrides cannot overwrite full completed-set accounting. The default full summary still honors those overrides. Fresh shared snapshots retain their real update time; stale data is not made fresh by copying it.

The Pokédex screen previously asked for 151 rows while the canonical transport caps each request at 50. Four sequential HTTP requests therefore preceded its first visible list. It now displays one 50-row transport page, then retrieves the remaining pages with three workers. All 1,025 species and their separate species/provider-form identities remain; the complete read uses 21 requests instead of 22. Duplicate/truncated/mixed-version pages cannot enter the complete cache. Unmount stops further scheduling, a complete warm list is never replaced by a partial refresh, and a pending or rejected cache write cannot keep successful live results busy. The existing 25 ms disk-cache handoff remains.

The actual Binder header exposes its Pokédex shortcut in core mode. The Pokédex route remains hidden from primary navigation, and the existing Pokémon detail route is allowed. Ownership, generation/form filters and account guards remain.

## Search corrections

Production probes found both slow database selection and a separate 450 ms API translation cutoff. The initial function-local planning setting alone was insufficient for SQL-language function execution. PostgreSQL 17's SQL-function executor plans without bound arguments. The follow-up keeps the reviewed SELECT verbatim inside a stable, security-invoker PL/pgSQL wrapper, allowing parameter-aware planning, and adds a B-tree on exact native name with printing identity included.

| Observation | Measured result |
| --- | --- |
| Native translation SQL before the index/wrapper | 1,908.77 ms |
| First indexed/wrapped read | 826.15 ms |
| Two later reads | 120.14 ms; 68.15 ms |
| Old API continuation failures | HTTP 503 at 474 ms and 469 ms |
| Exact continuation SQL (11 native names plus fuzzy exclusions), cold | 1,581.37 ms |
| New API translation allowance | 2,500 ms, with request cancellation retained |

These are bounded database/server observations, not phone timing or a statistical benchmark. The API deadline change prevents valid cold reads from being discarded solely because they exceed 450 ms. Its regression includes a valid 1,600 ms translation response on both the first and next pages, alongside permanently stalled, denied and cancelled reads.

Migrations `20261102160729` and `20261102161732` are applied to production and their repository bytes match the migration ledger. The second migration retains the reviewed SELECT exactly, the same owner, invoker security, stable volatility, empty search path, JIT setting and service-only execute grants. Session-wide planning remains automatic. The existing catalogue revision checks deliberately invalidate cursors issued before a function definition change.

English first/next pages (50/50 entries) and Japanese native-name first/next pages (50/17 entries) have identical content hashes before and after, excluding the changed revision field. Security and performance advisor findings are unchanged. No access grant, row policy, publication rule or catalogue/image record was changed.

## Validation and delivery

The local checks passed: 46 Home/Binder scenarios; actual Binder/root/tab navigation; the actual canonical Pokédex client and screen; complete-index/cache handoff; account/ABA/unmount controls; partial/error/retry; ownership bounds; issue #304; the actual SDK/backend/SQL Search pagination matrix; and migration parity across ten selectors and all five published languages. The full repository checks, deployed source and live consecutive-page verification are recorded in [the machine-readable evidence](binder-pokedex-retrieval-evidence.json).

PR [#457](https://github.com/tberridge86/Stackr/pull/457) and [#458](https://github.com/tberridge86/Stackr/pull/458) are merged. Final tested source `a7bbec03d302d272737d83d0c5a85fc479e85ff5` and merge `3729e40a3b6975b49c86fea3c4df5a083483c2ba` have the same tree. All ten applicable final checks passed; the release-candidate job was intentionally skipped.

The exact merged source is deployed to the dedicated Railway performance canary, service `8baf4d98-4605-4832-9d7e-65880e2a6b29`, as deployment `bd05806e-9306-481b-9e43-e1a68b0dc98a`. At 16:54 UTC its runtime attested `3729e40a3b69`, production environment configuration and Supabase project `oakdbbzdqwurpjnoqhmu`. A bounded `Pikachu` journey fetched two consecutive 17-card pages: 34/34 distinct variant identities, 0/17 continuation overlap, 34/34 image URLs, and continuation remained available after each page. The results covered `en`, `ja`, `zh-cn` and `zh-tw`; 11/34 were Japanese `exact_translated_name` matches. Observed provenance labels included Pokémon Card Game Japan/official, TCGdex, Pikaqian, Pokémon Taiwan, Scrydex and Pokémon TCG API. Railway measured 4,371 ms for the cold page and 807 ms for the next page. These are two observations rather than p50/p95, and both remain above the prior API target.

At the historical 16:55 UTC observation, production `pocketvault` was unchanged at deployment `c40b25c1-b1a3-49d1-aed2-df0fc0852228`, with attested source `0bf2e60222644682d600deb7cc0e94862fd2a71a`. The production release below supersedes that identity. Railway patch `6760f37e-07d2-4f20-b1d5-42d41ffee8b0` is retained only as historical evidence of a cancelled direct source-pin attempt; it is not the production release lane and must not be accepted as a substitute.

Three approved image samples separately returned HTTP 200 with valid JPEG bytes. This checks those image URLs, not on-phone rendering or full catalogue coverage.

The app source is not an installed-phone result. No new native build or OTA is claimed in this follow-up. Historical Build 63 was separately observed in TestFlight; that receipt does not establish which binary/OTA is installed. Cold/warm phone timings and rendered image journeys still require the new app build.

## Production release observation - 2 November 2026

The protected [backend-only workflow run 41505622670](https://github.com/tberridge86/Stackr/actions/runs/41505622670) succeeded. Railway production service `299d7ad4-5ed8-4301-b609-ef99274078d0` runs deployment `92bcf761-8b24-4337-a537-5de165cee60d`. At 19:14:26 UTC its runtime attested bundled source `67755c1a5574e26c4aeec0ade21053641331454b`, environment `production` and Supabase project `oakdbbzdqwurpjnoqhmu`.

The public gateway `https://api.stackrtcg.com` was checked at 19:15:52 UTC using the actual client mapping and artwork resolver:

| Bounded journey | Observation |
| --- | --- |
| Japanese `Pikachu`, two 17-card pages | 34 distinct selected variants, zero overlap, continuation available after each page; 34/34 correct Japanese scope, selected variant and English display |
| Actual client artwork resolution | 33/34 resolved: 18 exact images and 15 approved shared references |
| First two species pages | 50 + 50 canonical matches, 100 distinct species, reported total 1,025 |
| Three selected image URLs | HTTP 200, valid JPEG bytes: 515,944; 193,968; 144,887 |
| Individual Railway server durations | Search 870/362 ms; missing-image manifest 95 ms; species pages 11/4 ms |

These are individual observations, not p50/p95, a clean cold benchmark or installed-phone timings. The three JPEG samples remain official provider URLs; they do not establish that every asset is in R2. The one unresolved Japanese PCG7/041 Pikachu image remains a recorded acquisition gap. The supplied matching photo has been identified, but the required download helper reports `Library prepare_materialize is not available`; original bytes and content hash are unverified and no replacement has been published. This is not a newly demonstrated permission hold.

## Native release observation - 2 November 2026, 21:40 UTC

The [existing native workflow run 41526961602](https://github.com/tberridge86/Stackr/actions/runs/41526961602) uses frozen source `aa52a81ff2f3ae6a792a32b306237146b99da191`, expected backend `67755c1a5574e26c4aeec0ade21053641331454b`, production profile and `verify_only=false`. Attempt 1 failed before an EAS build request because `EXPO_TOKEN` was empty. The owner reports saving the repository secret. Attempt 2 is waiting for the repository's production approval; the credential fix has not yet run through preflight.

PRs [#460](https://github.com/tberridge86/Stackr/pull/460) and [#461](https://github.com/tberridge86/Stackr/pull/461) repaired outer-whitespace handling in reviewed source inputs and the normal production submission path. Normal production requests EAS automatic submission after the build finishes; it no longer explicitly assigns Apple's automatically distributed `Team (Expo)` group. The owner profile retains its separate submission behavior. A queued request will not itself prove build completion or TestFlight availability.

No new EAS build ID or remote build number is established at this observation. Historical Build 63 used source `832eba78ad8bbdd8dea1d358b811f2c11bc3f013` and predates these repairs. Native build, submission, Apple processing, tester availability and installed-phone acceptance remain separate pending milestones; the existing run should be followed rather than dispatching a duplicate build.

All 49 existing issue objects in the shared repair queue are preserved. Earlier artwork/identity/translation holds are not silently closed by these retrieval changes. Sampled delivery does not establish universal image or translation coverage.

The implementation follows PostgreSQL's [function-local settings](https://www.postgresql.org/docs/17/sql-alterfunction.html) and [query planning controls](https://www.postgresql.org/docs/17/runtime-config-query.html). The SQL executor behavior is visible in [PostgreSQL 17 functions.c](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/executor/functions.c#L498).
