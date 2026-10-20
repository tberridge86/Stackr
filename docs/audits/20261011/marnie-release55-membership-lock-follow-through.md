# Marnie release55 publication-membership lock follow-through

## Local repair

The canonical forward rehearsal now holds `share row exclusive` locks on its seven touched or publication-visible catalog tables, including `catalogue_version_printings` and `catalogue_version_variants`. It rejects a missing target printing membership separately from a missing target variant membership before any update. The bounded inverse similarly locks and verifies both membership tables; it does not lock `card_variants`, which it neither reads nor writes.

The local PGlite rehearsal uses both membership tables with the production column shape needed by these guards. It checks each lock list and proves either a printing or variant membership deletion rejects before any correction receipt or name write. `node scripts/test-marnie-canonical-correction-preparation.mjs` passed locally. This is a local PostgreSQL-compatible behaviour check; it does not prove cross-session lock contention on the hosted PostgreSQL service.

## Staging companion and diagnostics

A separate rollback-only staging companion is prepared at `D:/Stackr-recovery-artifacts-20261009/runtime-temp/release55-tool-temp/marnie-stage-companion-rehearsal-20261011r55.sql`. It requires the reviewed `postgres` executor and PostgreSQL 17.6, locks the same seven tables, captures its current 25 target values/timestamps only in an on-commit-drop temporary table, makes 25 uniquely marked test updates/receipts, reports aggregate receipt, delta, sequence, identity and native-alias invariants, then rolls back and reports zero remaining markers. The companion now validates a non-null, 25-row captured baseline instead of assuming Pikachu or prior captured timestamps, and derives each receipt’s prior summary from the temporary before-image. It still checks identity, native aliases, variants, membership, alias cardinality and marker absence before writing, then rolls back. This proves the mechanism only; it does not establish staging/production parity. SQL alone cannot establish the selected Supabase project, so execution must occur only through the staging-bound MCP tool. It is not a production script.

The paired fresh read-only preflight plus all-seven-table schema/index/RLS/grant/policy/delta-view fingerprint query is at `D:/Stackr-recovery-artifacts-20261009/runtime-temp/release55-tool-temp/marnie-canonical-fresh-preflight-20261011-v2.sql`. It preserves the existing target value/timestamp diagnostics and adds metadata required to distinguish the stage mismatch from schema divergence. The metadata SELECT was syntax-checked locally with PGlite after the outer delta-view expression was corrected; the local fixture intentionally lacks the catalog relations needed to execute it.

## Evidence boundary

No remote query, write, deployment, runtime-map generation, pending-metadata update, commit, or push was performed here. The existing stage discrepancy remains a blocking observation until the new read-only receipt identifies whether it is value, timestamp, membership, or schema drift. Reviewer noted staging has one fewer constraint: `card_variants_check` is absent there; that does not change the name-only rehearsal but prevents claiming full production parity.
