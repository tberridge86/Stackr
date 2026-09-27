# Queue 1 English artwork publication

The first 348 images are already privately staged by merged PR #220 and successful
run [36304753186](https://github.com/tberridge86/Stackr/actions/runs/36304753186).
On 27 September Jack answered **YES** when asked whether his existing artwork
permission covers storing, resizing and displaying these English Pokémon TCG API
images in Stackr. The exact question and answer are recorded in
`catalogue/rights-evidence/queue1-english-pokemon-tcg-api-owner-confirmation.2026-09-27.json`.
This is an owner attestation, not an independently issued third-party licence.

## Bounded implementation

Exactly Shining Legends 78, Dragon Majesty 78, Shining Fates Shiny Vault 122 and
Crown Zenith Galarian Gallery 70. Both approval and the frozen 348-card cohort are
byte-hashed. All collector prefixes, original hashes, staging identities and
1,392 object descriptions are retained. Production identities are resolved again
from its published catalogue; staging UUIDs are not transplanted.

A separate byte-bound source approval records permission for this cohort. The
global registry and live source-wide review status remain unchanged, so this does
not activate unrestricted acquisition or unrelated image publication. Each new
asset records the approval/cohort hashes, source attribution and original source.
Images are printing-front references, not verified finish photography, and are
ineligible for model training/recognition references.

The existing `deploy-production.yml` receives the `queue1_artwork` scope under its
existing production environment and shared deployment concurrency lock. The broad
catalogue promotion job explicitly excludes this scope. It changes no environment
protection, backend deployment, gateway, mobile channel, schema, catalogue version,
card metadata, prices, ownership record or review-bucket policy.

## Execution

After ordinary PR integration and relevant CI, dispatch the existing workflow from
main with `confirmation=DEPLOY PRODUCTION`, `release_scope=queue1_artwork` and
`expected_main_sha` equal to the exact selected main revision. Leave migration,
mobile, gateway and bootstrap controls false and other release identifiers empty.
The job checks these inputs before loading database credentials into the runner
step. It requires the existing production environment credentials for both
projects and the project-bound production database connection.

Before any write, verify the exact card bindings, scoped attestation, source state,
private asset mappings, absence of conflicting published artwork and every staged
image's bytes/dimensions. Copy the existing originals and derivatives without
provider re-downloads or image regeneration. Use immutable content-addressed public
keys and no overwrites; verify production readback hashes and decoding.

New asset rows and their links to the already-published production catalogue are
inserted in one serializable transaction after fresh identity/version/source
checks. Existing rows are reused only if every relevant field matches. Public
manifest bindings and anonymous bytes for all 1,392 objects are then checked.
Installed-device acceptance is a separate, unverified step.

## Evidence and recovery

The workflow uploads a non-secret receipt for 90 days. It records each storage key,
SHA, created/reused flag, asset row ID and catalogue-version association. Source
storage and private review rows are retained. No deletion happens on success.

Before commit, a database failure rolls back its transaction; already copied
content-addressed objects may remain unlinked. If commit acknowledgement is lost,
the receipt marks the outcome unknown. Reconcile the deterministic asset IDs and
version links before taking any recovery action. An idempotent rerun verifies
existing objects and rows and completes missing work; it never overwrites them.

For a confirmed post-commit verification failure, the receipt records that assets
are published and verification failed. Recovery must remove only newly created
version links listed in this run's receipt after checking their exact current
identity; do not remove pre-existing links or delete shared storage objects.
No automatic broad rollback, bucket-policy edit or source revocation occurs.

## Validation state

28 offline guard tests pass against the real frozen cohort. They cover approval
tampering, wrong projects/revisions, collector/finish/language/name drift, duplicate
bindings, private asset conflicts, public key validation and workflow isolation.
These checks do not establish that the live transfer or publication has run.
At preparation time: 348 staged, 0 published, 0 device-verified. Append live
execution evidence after the protected run; do not treat this document as a
successful publication receipt.

## Credential repair after first release attempt

Run [36309092033](https://github.com/tberridge86/Stackr/actions/runs/36309092033)
at revision `d7da623ade27cded31ba07d62e64cf9c9481ece3` passed its protected
production review but failed on the first Supabase source read with
`Legacy API keys are disabled`. It reached no image or catalogue writes.

The publisher now prefers the configured modern server secret. If the saved key
is legacy, it uses the existing production environment's `SUPABASE_ACCESS_TOKEN`
to read the exact project's named existing modern server key through the
[documented Management API](https://supabase.com/docs/reference/api/v1-get-project-api-keys).
This requires existing `secrets:read` access; missing access or ambiguous keys
stops before writes. It creates no keys, changes no key settings and never enables
legacy keys. Fetched credentials stay in memory and are masked in GitHub logs.
Six additional credential tests cover fixed projects, read-only lookup, modern
key selection, failure handling and secret-free diagnostics.

Retry [36313752514](https://github.com/tberridge86/Stackr/actions/runs/36313752514)
at revision `bbad42a627605687c4985386acffdef491884855` successfully reached the
management API but stopped before writes because multiple server keys exist.
Read-only dashboard inspection confirmed four secret keys in each project. The
resolver now selects staging's existing `stackr_catalogue_operator` key and
production's existing `default` key by exact name and secret type. It still rejects
missing, duplicate, malformed or restricted-role matching keys. No key was revealed
in chat, created, rotated or enabled during that inspection.

Run [36314163769](https://github.com/tberridge86/Stackr/actions/runs/36314163769)
at revision `944e1c15b36a5e10ac5725e6b700f9b1e250531b` resolved the named keys,
then stopped on `Invalid schema: ingest` before any writes. The source and asset
tables are private and must not be exposed through PostgREST to make publication
work. All catalogue metadata reads now use the existing project-bound, TLS-verified
database connections in read-only sessions. Storage continues through its normal
server API. The existing separate serializable write transaction is unchanged.
Post-publication manifest verification reads the same `api.asset_manifest` view
through the database; it does not prove the external Stackr HTTP route or phone UI.
No exposed-schema, grant, RLS or bucket-policy changes are required.

Run [36314596818](https://github.com/tberridge86/Stackr/actions/runs/36314596818)
at revision `042c91b9f0104461adc0f0e66f9b24ab91b585fc` verified all 1,392 source
files, copied and verified all 1,392 production files, then hit the existing
45-second database statement limit before inserting any asset or version link.
Its receipt contains 1,392 verified objects and zero assets/links; production
independently shows zero published Queue 1 rows. The stored files are retained.

The transaction now requests only the same bounded card identity columns already
used successfully during preflight, rather than expanding every catalogue view
column. Conflict checks read the cohort in one query instead of rescanning the
manifest for each printing. The 45-second limit is retained. A retry verifies
existing production files against the approved hashes and image dimensions,
skips uploading them, and reads private staging only for missing files. Mismatched
existing bytes stop the release; they are never replaced. Post-commit anonymous
verification still downloads and validates every file.
