# R2 configuration for retained public writers

The strict public asset writer rejects incomplete R2 configuration. Adding
repository secrets alone does not expose them to a GitHub Actions process.
The eight execution steps below explicitly bind their destination variables and
credentials; unrelated installation, test, metadata and private-upload steps
do not receive those R2 credentials.

| Workflow | Writer job | GitHub environment |
| --- | --- | --- |
| catalogue-ingestion-ci.yml | ingest-staging (mirror operation only) | staging |
| catalogue-stored-asset-repair.yml | repair (execute step only) | staging |
| complete-japanese-catalogue-images.yml | mirror | staging |
| complete-japanese-catalogue-images.yml | complete-and-publish | staging |
| four-language-catalogue-images.yml | mirror | staging |
| recover-tcgdex-zh-cn-images.yml | recover | staging |
| materialize-pokedata-gap-art-20260910.yml | materialize | production |
| repair-approved-alpha-set-logos.yml | repair | production |

## Environment configuration

Configure these same names separately in the existing GitHub staging and
production environments, using each environment's verified bucket and CDN
binding. Staging must not inherit the production bucket or credentials. Do not
set repository-wide defaults for these names: GitHub can fall back to those
values when an environment-specific setting is missing. Verify each environment
explicitly before execution.

| Name | Store | Meaning |
| --- | --- | --- |
| STACKR_R2_ENDPOINT | Environment variable | Verified account's HTTPS R2 S3 API endpoint |
| STACKR_R2_BUCKET | Environment variable | Exact bucket for this environment's approved public artwork |
| STACKR_R2_PUBLIC_BASE_URL | Environment variable | Public HTTPS CDN base bound to that bucket |
| STACKR_R2_ACCESS_KEY_ID | Environment secret | Bucket-scoped object read/write access key |
| STACKR_R2_SECRET_ACCESS_KEY | Environment secret | Matching S3 secret access key |

The steps set STACKR_CATALOGUE_STORAGE_PROVIDER to r2 explicitly. The adapter
continues to validate the endpoint, bucket, public base URL and credentials and
does not fall back to Supabase Storage. Do not insert sample destinations or
credentials merely to make a job pass.

These bindings do not prove that environment values exist, that credentials
have the intended scope, or that the CDN serves the destination. All three
remain live cutover prerequisites. Current Railway and Cloudflare access must
be restored before those checks can be completed.

The same writer variables are required in the Railway migration/ingestion
service's server secret store. A Railway API instance that only reads public
assets needs the verified bucket and public base URL, not R2 write credentials.
The dedicated price worker is metadata-only and needs no R2 configuration.
Manual calls to scripts/import-approved-capture-catalogue-assets.mjs require the
same server variables; no retained workflow caller was found for that script.

## Preserved execution gates

None of these workflows subscribes to pull_request or pull_request_target.
Opening or updating the integration PR does not start an image writer.

The existing Japanese completion workflow also subscribes to selected path
changes on main, guarded by the repository owner's actor ID. An owner merge
that changes its workflow or listed source paths can therefore start its
staging ingestion, mirror and completion chain. This existing behavior is
preserved; account for it before the main cutover and configure staging R2
first. Other workflows retain their manual dispatch or exact owner issue-comment
commands. Production materialization still defaults to dry run and retains its
exact source/confirmation checks; alpha-logo repair retains its explicit
production confirmation.

The bindings do not change schedules, concurrency, command bounds, rights checks,
publication guards, source identities or private storage. Migrating those
retained jobs to Railway still requires a separate scheduler handoff with no
overlap.

## Automatic verification

Run node scripts/test-r2-writer-workflows.mjs. It reads the actual workflow YAML,
checks all eight execution steps and their environment-scoped expressions,
detects newly added direct writer callers, and rejects missing/misplaced secrets,
wrong target environments, broadened events, lost owner/dependency gates and
loss of the production dry-run default. It performs no network requests or
live writes.

