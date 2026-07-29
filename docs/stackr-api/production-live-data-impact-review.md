# Production live-data impact review

## Scope

This is an aggregate-only review of every migration containing an `INSERT`,
`UPDATE`, or `DELETE`. It does not expose customer rows and did not write to
production. The authoritative per-migration detail is also embedded in
`production-migration-matrix.csv`.

Evidence time: `2026-07-29 16:20:13 UTC`

## Production baseline

| Object | Observed state |
| --- | ---: |
| Tracked migration rows | 0 |
| Canonical/private schemas | 0 of 6 |
| Binders | 43 |
| Binder cards | 1,672 |
| Owned binder cards | 1,288 |
| User card variants | 615 |
| User card flags | 23 |
| Market products | 191 |
| Pokemon cards | 20,359 |
| Provider records | 5,411 |
| Provider mappings | 5,220 |
| User achievements | 96 |
| User coin ledger rows | 0 |
| Existing storage buckets | 3 |

Production does not contain `catalog`, `ingest`, `market`, `ml`, `api`, or
`audit`. The six new Stackr buckets are also absent.

## DML review

| Migration | Scope | Aggregate production effect |
| --- | --- | --- |
| `20260518150000` | Migration time | Upserts 16 market products. Two are temporary obsolete identities removed by the next migration. |
| `20260519102000` | Migration time | Upserts 14 products and deletes the two obsolete identities. All 28 final identities already exist; 17 rows have one or more differing seeded fields. Net row-count change is zero. |
| `20260527123000` | Function only | No replay-time row change. Profile DML runs only on future auth-user inserts. |
| `20260528114500` | Migration and function | Inserts 15 rewards and four cosmetics. Backfills 68 achievement coin-ledger rows. Runtime purchase and award DML is not invoked. |
| `20260605214500` | Migration time | Production has zero duplicate variant identity groups and zero rows to delete. |
| `20260621170000` | Migration time | Seeds 36 reward definitions after the historical ledger backfill. |
| `20260628120000` | Migration time | Seeds two reward definitions after the historical ledger backfill. |
| `20260701195000` | Migration time | Existing values make both explicit UPDATE statements affect zero rows. The new non-null columns receive defaults during DDL. |
| `20260702120000` | Migration time | Inserts 981 owned-card identities, matches 295 existing identities, increases zero existing quantities, and links 1,288 binder rows across 1,276 grouped identities. |
| `20260717143000` | Migration time | Provider language and mapping backfills affect zero rows. |
| `20260721090000` | Migration time | Inserts one draft internal scanner-threshold row into a new table; it is not activated. |
| `20260726103000` | Function only | No replay-time row change. Queue/confusion DML runs only on future scan events. |
| `20260726210000` | Migration time | Four pricing-source upserts are value-preserving for current rows. |
| `20260726223000` | Migration time | Inserts one missing private Scan Lab bucket. |
| `20260726234500` | Migration time | Inserts one missing private recognition-feedback bucket. |
| `20260727212256` | Migration time | Seeds new canonical tables with 1 game, 5 languages, 5 sources, 10 finishes, 12 variants, and 8 rarities. |
| `20260727213835` | Migration time | Raw-ingest compatibility backfill affects zero legacy rows because the schema is new. |
| `20260728060617` | Migration time | Asset backfill affects zero legacy rows. Inserts four missing buckets: one public catalogue bucket and three private buckets. |
| `20260728064400` | Migration and function | Seeds five inactive/non-selected model registry rows. Activation DML remains inside uninvoked functions. |
| `20260728171416` | Migration time | Seeds new private-market tables with 6 currencies, 11 conditions, 5 graders, 12 grades, 4 providers, and 1 inactive estimate version. |
| `20260728213516` | Migration time | Adds two rarity taxonomy rows to the new canonical table. |
| `20260729055009` | Function only | No replay-time row change. Catalogue activation and rollback DML remains inside service-role-only functions. |

## Required decisions

### Ownership conversion

The largest customer-data change is the owned-card conversion. It creates 981
rows and links 1,288 binder rows. The aggregate join found no duplicate
existing identities and no quantity reductions, but the release owner must
approve this conversion and its backup recovery point before execution.

### Achievement rewards

The initial reward migration backfills 68 ledger rows. Twenty-six existing
achievements match the 38 reward definitions added by later migrations, but
those migrations do not retroactively add ledger entries. Product ownership
must decide whether that asymmetry is intended. This is a release blocker, not
an invitation to edit historical production data during Prompt 6.

### Marketplace compatibility

Production `user_card_flags.listing_images` is `jsonb`; the historical
migration declares `text[]` only when the column is missing. Prompt 5 proved
the migration replays with the production shape, and all current values are
JSON arrays, but the backend/mobile contract must continue to treat this legacy
column as `jsonb`.

### Security advisors

The live security advisor reports 39 findings: four errors, 19 warnings, and
16 informational findings. The four errors are security-definer views:
`tcg_card_printings`, `catalogue_health`, `tcg_set_cover_images`, and
`japanese_catalogue_health`. Production remains **NO-GO** until they are fixed
or an accountable security owner explicitly accepts them for the release.

The performance advisor reports 332 findings: 231 warnings and 101
informational findings. Main categories are unindexed foreign keys, RLS auth
init plans, unused indexes, overlapping permissive policies, and three
duplicate indexes. Advisor reference:
https://supabase.com/docs/guides/database/database-linter

## Conclusion

All 22 DML-bearing migrations are classified. The review found no observed
duplicate-row deletion, no provider-record rewrite, and no active catalogue or
model activation. Production remains **NO-GO** because the authenticated CLI
dry run, verified recovery point, reward policy decision, ownership conversion
approval, provider legal-use approval, and security-error disposition are not
complete.
