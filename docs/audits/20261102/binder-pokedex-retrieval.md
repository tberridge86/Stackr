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

The API source change is **staged, not deployed**. Railway patch `6760f37e-07d2-4f20-b1d5-42d41ffee8b0` contains only the pocketvault production source pin to that tested commit. The deployment tool returned “Cancelled — the user did not approve this action. No changes were made.” The last successful deployment remains `c40b25c1-b1a3-49d1-aed2-df0fc0852228`; no alternate deployment or approval bypass was attempted. The existing API can therefore still hit its 450 ms continuation cutoff. Approval, deployment, source attestation and consecutive live Japanese-page checks remain required before another native release.

Three approved image samples separately returned HTTP 200 with valid JPEG bytes. This checks those image URLs, not on-phone rendering or full catalogue coverage.

The app source is not an installed-phone result. No new native build or OTA is claimed in this follow-up. Historical Build 63 was separately observed in TestFlight; that receipt does not establish which binary/OTA is installed. Cold/warm phone timings and rendered image journeys still require the new app build.

All 49 existing issue objects in the shared repair queue are preserved. Earlier artwork/identity/translation holds are not silently closed by these retrieval changes. Sampled delivery does not establish universal image or translation coverage.

The implementation follows PostgreSQL's [function-local settings](https://www.postgresql.org/docs/17/sql-alterfunction.html) and [query planning controls](https://www.postgresql.org/docs/17/runtime-config-query.html). The SQL executor behavior is visible in [PostgreSQL 17 functions.c](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/executor/functions.c#L498).
