# Marnie canonical correction preflight

This is a local, rollback-default rehearsal package for the active P1
`TRANSLATION-MARNIE-001`. It changes nothing by itself. The proposed live
action remains a separately approved, exact canonical catalogue update.

## Bound review input

- Proposal: `docs/audits/20261010/marnie-alias-correction.json`.
- Current before-image: `docs/audits/20261011/marnie-before-image.receipt.json`.
- Normalized proposal SHA-256: `4e45815a9eb6abcb8ac94c1986808557110fb1821559af30e0222510ba26b13b`.
- Normalized before-image SHA-256: `1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677`.
- Read-only relevant deployed-schema receipt: `docs/audits/20261011/marnie-canonical-schema.receipt.json`, captured at `2026-10-11 16:18:47.816747+00`. It records 103 relevant columns, 51 constraints and the published/mobile-syncable view definition; no user rows or mutations are included.
- Cohort: 12 published `zh-tw` Trainer printings named `瑪俐`, 13 variants,
  13 active `english_display` aliases currently reading `Pikachu`, and 13
  native aliases that must remain `瑪俐`.
- Out of scope: all user records, holdings, market/pricing data, artwork,
  native aliases, set/collector/finish/variant identity, and the genuine
  `zh-tw` `皮卡丘 → Pikachu` cohort.

## Existing canonical lane

The repository's canonical schema stores the printing display field in
`catalog.card_printings` and the scoped aliases in `catalog.card_names`.
Published `zh-tw` catalogue versions expose mobile-syncable records through
`catalog.catalogue_change_log`. The guarded manual-repair pattern already used
by `supabase/manual/chinese_identity_correction_20261010.sql` is therefore a
verifiable lane for this narrow correction.

The historical owner-approved runtime generator is deliberately excluded from
the write lane. Its own metadata says its sources were already approved/applied
and its canonical write flag is false. Re-generating it for an unapplied Marnie
mutation would misstate provenance. It may only be regenerated after a reviewed
canonical correction has been applied and read back.

## Rehearsal and rollback

`supabase/manual/marnie_canonical_correction_rehearsal_20261011.sql` has exact
12/13 target IDs, captured publication ID, old-value timestamps, set/collector
number/variant/finish and active-alias-cardinality guards. It locks
only the catalogue/publication tables it needs, reads no private collector rows,
writes the two display fields and public change log only inside a transaction,
then ends with `ROLLBACK`. It aborts when the current publication, cohort,
native aliases, identity, old values or before-image timestamps differ.

`supabase/manual/marnie_canonical_correction_rollback_rehearsal_20261011.sql`
is the bounded executable inverse rehearsal. It requires the matching 25-row
forward receipt and the exact post-correction Marnie values before changing the
same 12/13 IDs back to the captured Pikachu aliases, and also ends in
`ROLLBACK`. Do not restore from the unrelated 16,800-row historical rollback.
It also rejects a later identity, provenance or timestamp change and advances
the published version's change-sequence pointer only inside the rehearsal.

For a future approved execution, capture a fresh before-image first and replace
only the final `ROLLBACK` terminator after independent review confirms the
fresh IDs, timestamps and publication version. This package is prepared local
source, not a production-ready action. Relevant deployed columns, constraints
and view metadata were inspected read-only; full schema/RLS rehearsal, public
API alias priority, consumer delta handling and installed-phone delivery have
not been verified.

## Delivery blocker after a canonical write

The existing `resolveCardEnglishSupplement` gives the exact owner-approved
runtime record priority when no reviewed canonical English provenance is present.
That generated record still maps `zh-tw/瑪俐` to `Pikachu`. Therefore a canonical
database correction alone can still be hidden by the dated runtime fallback.
Do not regenerate that runtime from the historical “already applied” input.
After a reviewed canonical write, the delivery lane must prove that the API
supplies valid reviewed English-name provenance which takes priority, or replace
the exact generated record through a newly reviewed applied input and recheck
the backend/mobile mirror. Neither step has been performed here. The separate
`marnie-runtime-correction-candidate.json` prepares only the expected single
group replacement, with exact identities/timestamps and source hashes. It is
not generator input and does not create new generated metadata or assert an
applied correction. The actual regenerated record/input hashes must reflect the
future applied source.

## Local controls

Run `node scripts/test-marnie-canonical-correction-preparation.mjs`.
It binds the two source receipts, proves the exact 12/13 cohort and current
known-bad baseline, proves native/genuine-Pikachu preservation, then executes
both rollback-default SQL rehearsals in an isolated local PGlite schema. It
tests set, collector-number, finish, publication and extra-alias drift; tests
the local forward 12/13 mutation and 25-row published/mobile-syncable predicate;
and proves the bounded inverse restores the captured display baseline with 25
reverse receipts and the actual maximum change-sequence pointer. Independent
review accepted this limited preparation with no P1/P2 findings. It
intentionally does not claim the deployed runtime, public API or phone is
corrected.

Before any live request, also run the rehearsal in a reviewed non-production
environment, retain its receipt, inspect the exact change-log rows, perform an
independent review, then read back canonical API searches/details after the
separately approved production action.
