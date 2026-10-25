# Cloudflare Pages release

`Deploy Stackr Pages` builds the reviewed production Expo web export, then pauses
at the existing GitHub `production` environment before publishing. Configure
required reviewers on that environment; merely naming an environment in YAML
does not enable review protection.

The export job has no Cloudflare credential. It uses the canonical production
public runtime targets and release flags, disables dotenv loading, scans the
bundle for server secrets, rejects dynamic Functions/Worker output, and checks
Pages' 20,000-file/25 MiB-per-file envelope. It uploads the export and a SHA-256
manifest before the deploy job can begin.

## Target and prerequisites

- Cloudflare account: `b4c23b0834cc5a113aa4a98fd904b281`.
- Existing Pages project: `stackr-web`, production branch `main`.
- Initial hostname: `stackr-web.pages.dev`. The workflow rejects custom domains
  and does not create a project, change DNS, or alter the native app release.
- `CLOUDFLARE_API_TOKEN` in the protected production environment, scoped to
  Cloudflare Pages Edit on this account. Never add it to `EXPO_PUBLIC_*`.
- If the project uses Git integration, automatic production builds must already
  be disabled to avoid a second publisher.
- The exact source revision must be on `main` and have successful Platform CI.
- Supabase Auth's web redirect allowlist and API CORS must permit the intended
  Pages origin before account-based acceptance. This workflow cannot verify an
  authenticated session or approve a DNS cutover.

Confirm the existing project ID and current production deployment ID from
Cloudflare. Use `NONE` only when that existing project has no production deploy.
These exact IDs are checked immediately before publishing. Neither is invented
or inferred from the project's display name.

## Run and review

Dispatch `Deploy Stackr Pages` on `main` with:

1. `confirmation`: `DEPLOY STACKR PAGES`.
2. `expected_main_sha`: exact reviewed 40-character main revision.
3. `expected_project_id`: verified Cloudflare project ID.
4. `previous_deployment_id`: current production deployment ID, or `NONE`.

Review the `pages-export-<sha>` artifact while the production environment job
awaits approval. Publishing downloads that same run's artifact, recomputes every
file's checksum, and uses Wrangler from the locked gateway dependency tree.

A successful deployment is confirmed through the Cloudflare API using project,
environment, branch, exact commit, clean source and terminal success. The public
index and one actual Expo JavaScript bundle must match their local bytes on both
the immutable deployment URL and `stackr-web.pages.dev`. A final project read
checks that the deployment remained current during these probes.

The `pages-release-<run>-<attempt>` artifact contains sanitized before/publication/
verification receipts. It never contains the raw project response, which can
include environment values. `publicFilesVerified: true` proves these static
responses only; `appSessionVerified` stays false until live app acceptance.

## Failure and rollback

An upload timeout or a failed public probe can occur after publication. Do not
blindly rerun: inspect the `before` and `published` receipts and the current Pages
deployment. The prior deployment ID is the rollback target. Retain the previous
export/deployment and use Cloudflare's reviewed rollback flow; this workflow does
not delete deployments or automatically roll back over another publisher.

Before adding a custom domain, separately verify login/password-reset redirects,
API/CORS, routes, images and the existing DNS records, with a rollback plan.

## Validation

`node scripts/test-pages-release.mjs` exercises wrong source/target/rollback IDs,
competing Git publication, preview/failed deployments, dynamic export rejection,
public byte/MIME checks and workflow credential separation. Offline success does
not mean a Pages project exists or a deployment has run.

References: [Direct Upload in CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[Wrangler Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/),
[Project API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/),
[Deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/).
