# Pitch Black duplicate artwork repair

The 120 original Queue 1 PBL printing records lack direct artwork even though their canonical me05 counterparts have all 120 public fronts. The set picker hides the duplicate when the canonical set is available; saved binders referring to an old PBL ID still need the repair.

The frozen cohort pins 120 exact name/number/printing pairs and current public source asset IDs, hashes and derivative descriptors. Current TCGdex descriptors must independently confirm each generic English front. New bindings have no variant, no exact-finish claim and no recognition eligibility.

## Current implementation

Production has a unique index on original Storage-object references. Staging has a different shared-object rule. To retain both schemas, the repair makes exactly 120 byte-identical copies of the existing approved public originals under deterministic printing-specific, content-addressed keys. It reuses the 360 existing derivative files. No provider image is reacquired, no source permission is changed, and no existing asset, object, card identity, finish or ownership record is replaced.

The existing protected `deploy-production.yml` scope `pbl_artwork_links` requires the exact merged main SHA, shared production lock and all unrelated options disabled. Its existing credential resolver reads only the current production server key; staging has no Storage write credential.

Execution first rehearses the complete 120-asset/120-link insertion in staging and rolls it back. It then validates production identity and rights, verifies the 480 existing files, checks all proposed copy bytes and any existing copy keys before uploading, and copies only missing originals with overwrite disabled. Each copy is anonymously hashed, sized and decoded. A serializable transaction rechecks the source state and inserts 120 asset bindings and current-version links atomically. Post-commit checks require the exact copied original keys, hashes and derivative descriptors for all 120 target printings, then verify their 480 public files again.

Failures roll back catalogue changes before commit. Uploaded copies can remain without catalogue links after a later failure; the receipt records their exact keys, creation and verification state. A retry verifies existing copy bytes and accepts only an identical asset payload. Never delete canonical originals or shared derivatives. Any cleanup of copies requires receipt reconciliation and proving no remaining asset references. An uncertain commit must be reconciled before retry or rollback.

## Previous attempts

- Run 36321928721 at d2a50b73116afb08d72287b54e7d78d2bc2dfcad stopped in read-only staging preflight because 40 generic source fronts were associated with reverse-holo variants. No writes occurred. Fresh provider-front proof now distinguishes the generic image from that catalogue association.
- Run 36322628918 at ae7db1dc5dba9365ef3d5fe419809f4b2ed8af29 passed all 120 current provider checks, the full staging rehearsal/rollback and all 480 public file checks. Production's original-object uniqueness constraint rejected the first new binding; the transaction rolled back, with no created assets, links or objects. Distinct original copies address this without changing a database rule.

Validation: 21 focused PBL checks plus 43 existing publication/credential checks passed. Changed-file ESLint and deployment-tooling checks apply. Actual execution results are recorded in the matching PR and owner-facing receipt. Device rendering remains unverified.

The protected original-copy attempt (36323582304, revision 7f16e346f9e28dca7c6203d8d3c2efa9b56347b9) passed provider proof and the full staging rollback rehearsal, then hit the 45-second production statement limit before any copy or catalogue write. Public manifest reads now resolve exact base-table asset IDs before querying the public view, preserving all direct and inherited target conflict checks. The timeout stays at 45 seconds. A production read-only EXPLAIN ANALYZE returned the 120 frozen public source rows in 947.363 ms (one observation, not app latency). Focused PBL validation now contains 23 passing checks.

The repair also rehearses and rolls back all 120 exact production metadata bindings before creating copies. This independently proves the production constraints accept the payload rather than relying only on staging parity. The final publishing transaction still rechecks live identity and eligibility after every file has been verified.
