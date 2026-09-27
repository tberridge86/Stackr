# Pitch Black duplicate artwork links

The 120 original Queue 1 `PBL` printing records lack direct artwork even though
their canonical `me05` counterparts have all 120 public fronts. The set picker
hides the duplicate when the canonical set is available; that does not repair a
saved binder referring to an old PBL ID.

`tools/queue1-pbl-relink-20260927/cohort.json` freezes all 120 name/number/printing
pairs and exact existing source image IDs, hashes and derivative descriptors.
The repair creates one printing-front asset binding and current catalogue-version
link per duplicate. It reuses the existing storage keys and approved source
provenance; no object upload, card/variant edit, source activation, ownership
change, model-training permission or exact-finish claim is introduced.

Execution uses `deploy-production.yml`, `release_scope=pbl_artwork_links`, the exact
merged main SHA and the existing protected production environment/shared lock.
Every unrelated migration, gateway and mobile option must remain false.

The job first inserts and verifies the exact bindings inside a serializable
staging transaction and rolls it back. It then reads the live production
identities and eligible public source assets, downloads/hashes/decodes all 480
existing originals and derivatives, rebinds inside a serializable production
transaction, and inserts the 120 assets/links atomically. Existing different
target artwork, variant drift, wrong source/number/language, revoked eligibility
or changed bytes stop the operation. Repeated runs accept only the exact same
payload. No source or existing target asset is overwritten.

After commit, the job checks 120 distinct target manifest printings and repeats
all 480 public file checks. Its scanned receipt records the new asset and link
IDs, revision, timestamps, staging rehearsal, commit state and verification.
Device rendering remains separate. A commit with uncertain outcome must be
reconciled before any retry or rollback.

Rollback, if required after a verified publication, is a reviewed transaction
restricted to the exact created IDs in the receipt: remove only their
`catalogue_version_assets` rows and new `catalog.assets` bindings. Never delete
the shared storage objects, canonical source assets, card identities or owner
records. A precommit failure rolls back without an application-data change.

Validation: 15 focused identity/retry/config/workflow checks; existing deployment
tooling checks; changed-file ESLint. The actual staging and production results
will be appended to the matching PR and the owner-facing receipt.
