# Chinese language conflict repair — 10 October 2026

## Problem and bounded correction

Five TCGdex Simplified Chinese set cohorts duplicate exact Traditional Chinese printings: SV7a (64), SV8 (106), SV8a (237), SV9 (100), SV10 (98). Production recheck found 605 unique one-to-one pairs, matching game, set code, collector number, native name and printing discriminator. They carry 750 active source variants, with zero set-associated artwork/version-asset links. Exact UUIDs and the read query are in chinese-language-conflicts-20261010.json.

The adapter now rejects these five zh-cn cohorts before normalization/reconciliation, across sets, cards, variants and assets. Traditional Chinese and unrelated Simplified Chinese records remain importable. It does not convert script, copy imagery, remap prices, relabel a printing, or create a cross-language fallback. This is a source validation fix, not complete replacement of the published catalogue.

## Database registration

supabase/manual/chinese_language_source_conflicts_20261010.sql registers exact counterpart evidence as 605 open high-severity identity conflicts and one audit event. The transaction guards unique pairs, per-set counts, active variants and absent assets. Locks and NOT EXISTS make repeat registration idempotent.

Staging lmwfhvexfcoyeuoyrlco: initial registration applied and rerun; readback 605 conflicts / 605 unique printings / 605 open. Independent review strengthened the asset guard to cover printing/variant-only attachments. The amended transaction correctly aborts on staging, where a fresh full-scope read found 667 catalog.assets associations and zero version-asset associations. These staging links must receive separate language/source review before promotion; none was changed. Production full-scope read finds zero associations in either table. Staging predates printing_discriminator; JSON extraction defaults the absent field to the legacy empty discriminator without weakening the one-to-one check.

Production oakdbbzdqwurpjnoqhmu: independently reviewed transaction applied; 605 conflict pairs registered. No canonical set/printing/variant, published membership, external identifier, collection, binder, image or price rows are changed. Conflict registration affects admin/quality counts and does not hide the cards. Public cards and price/history bridges still need their existing IDs.

Production post-write readback: 605 conflicts, 605 unique printing IDs, one audit event, 605 retained active printings, 750 retained active variants and 750 distinct variants still in api.catalogue_cards.

## Validation

- npm run test:catalogue-ingestion: passed, including all four record shapes and all 605 receipt-backed records rejected before normalization/database access.
- npm run typecheck: passed.
- npm run lint: passed with eight pre-existing app/component warnings.
- Independent identity reviewer confirmed retaining canonical IDs and published external identifiers is necessary for ownership and price/history reads.

## Remaining delivery

Merge the source guard through the existing catalogue release lane before running another TCGdex Chinese import. No backend/native deployment has occurred in this task.

Repeated non-dry-run imports will retain rejected raw observations and create their own schema-conflict audit entries through the existing importer. The manual 605-record cohort registration itself is idempotent. Do not retry these rejected cohorts to fill catalogue gaps; use verified replacement source evidence.

The canonical catalogue remains unresolved for these 605 records. Obtain an authoritative Simplified Chinese printing/source identity, then rehearse a separate exact replacement/version transaction with collection and price/history read checks. Do not delete or deprecate this cohort merely to make coverage appear complete.
