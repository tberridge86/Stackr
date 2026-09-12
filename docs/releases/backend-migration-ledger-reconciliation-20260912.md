# Backend migration-ledger reconciliation — 12 September 2026

This is a read-only reconciliation of repository main `10e1f4c64735102136e0d4c9d730e1f8ee829ea5`, production Supabase `oakdbbzdqwurpjnoqhmu`, and staging Supabase `lmwfhvexfcoyeuoyrlco`. The live observations were made between 11:16 and 11:20 UTC. No database mutation, migration replay, deployment, record merge, deletion, or access change was performed.

## Measured result

| Ledger | Migrations before this source recovery | Candidate repository migrations | Notes |
| --- | ---: | ---: | --- |
| Repository main | 130 | 136 | Six production-recorded migrations were missing from source and are restored here. |
| Production | 145 | 145 | Read-only ledger; no migration was applied. |
| Staging | 161 | 161 | Read-only ledger; no migration was applied. |

The five collector-search migrations recovered by PR #168 are present in production **5/5** and absent from staging **0/5**. For every migration, the production ledger contains one statement and its SHA-256 exactly matches the repository file after removing only the repository's final newline.

The same comparison found six retrieval migrations applied to production on 11 September but absent from current main. Their exact production-recorded versions, names, order and statement bytes are restored in this branch. All six statement hashes match **6/6**. The final live function state remains service-only and security-invoker: `api.card_image_manifest_for_identities` and `api.catalogue_set_card_rows` are executable by `service_role`, not `anon` or `authenticated`; the two intermediate bundle/fact functions are absent as their recorded follow-up migrations require.

## Remaining classified differences

After restoring the six exact statements, production still has 15 applied version/name entries absent from this candidate. They comprise the Prompt 2 containment and marketplace transaction chain and remain `applied-but-missing-from-source`; they were not copied speculatively in this focused repair. Six repository migrations are not recorded under the same version/name in production and remain `source-only or version-divergent` until separately reconciled.

Staging is not aligned with either candidate or production: it has 55 version/name entries absent from this candidate, while this candidate has 30 entries absent from staging. The five PR #168 and six newly recovered migrations must not be blindly replayed there: staging already exposes one equivalent image-identity function without those ledger versions, so schema and history need an isolated, ordered rehearsal first.

The exact version/name differences and all 11 live/repository hashes are retained in `backend-migration-ledger-reconciliation-20260912.json`. Historical August reconciliation receipts remain historical and are not rewritten.

## Release handoff

- Review the six source-recovery files as historical recovery, not new production DDL.
- Do not reapply them to production; their exact versions are already recorded there.
- Keep staging/full deployment fail-closed until the 15 remaining production-only records, six repository-only production differences, and staging's divergent ledger have an explicit source/provenance classification and isolated replay plan.
- Preserve PR #180's separate binder-RLS migration and PR #184's retrieval work; neither is merged or applied by this branch. PR #180 independently removes the migration-count fixture's hard-coded ceiling and should land before this recovery is promoted.

Rollback for this source-only change is removal of these six recovered files and this receipt before merge. There is no live rollback because no live state changed.
