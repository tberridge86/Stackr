# R2 activation and deployment preparation — 24 October 2026

Baseline: PR #437 at `9dd1724ff645598bb83c36240c3226a60a77d0b5`.

## Verified live state

- Owner activated R2. Cloudflare now displays the bucket dashboard and active billing period.
- Created `stackr-catalogue-public`, Standard storage, Western Europe (WEUR).
- Bucket is empty (0 B); public access remains disabled.
- Prepared `assets.stackrtcg.com` custom-domain binding. Cloudflare's preview proposes a CNAME named `assets` targeting this bucket. Final Connect domain action has NOT been submitted.
- Prepared account token `stackr-catalogue-production-20261024`: Object Read & Write, ONLY `stackr-catalogue-public`, default lifetime Forever/until revoked. Final creation has NOT been submitted. No token or secret exists from this preparation.
- Browser action-time confirmation is required before creating security-sensitive credentials/public access. Proposed secret destinations are the existing Railway pocketvault production project (approved public writers and separate migration service) and this repository's protected production GitHub environment for retained public writer jobs. No production credentials will be copied into staging.
- Railway API `pocketvault` is shown Online. Current active deployment link identifies `2f62ce18-9bf7-4608-b126-4bc8957ef280`, labelled “Record exact transport diagnostic merge without deployed claims”. This observation is not verification of its served source revision or a new deployment.
- No database references changed, no objects copied or deleted, no runtime deployment made by this preparation.

## Release separation

All four PR #437 workflows passed on the named baseline, including Platform CI
`40084113990`. PR #436 remains a separate draft; its Platform run
`39986216811` failed the mobile-recovery suite at an outdated Card Detail
import assertion. It is not part of this R2-only release. Its daily-history
migration and new app requests require separate coordinated delivery.

## Configuration readiness

Public API readers require `STACKR_R2_BUCKET` and
`STACKR_R2_PUBLIC_BASE_URL` together. Retained writers also require
`STACKR_R2_ENDPOINT`, `STACKR_R2_ACCESS_KEY_ID` and
`STACKR_R2_SECRET_ACCESS_KEY`.

The four retained GitHub writer workflows now include explicit step-scoped
environment mappings in this continuation; adding secret values alone was
insufficient. Local unique-key YAML parsing, mapping/scope checks and baseline
preservation checks pass. Independent review found no blocking change regression.
Hosted CI for this new continuation remains pending.

The existing Japanese-completion workflow triggers on relevant main pushes,
including edits to its own workflow. Updating the draft PR does not run its
catalogue job, but an owner merge/push can start staging ingestion. Populate and
verify separate staging R2 settings before that merge, or explicitly review a
hold on the automatic job; do not describe merging as operationally inert. Their staging and production
environments must remain separate. Staging must use a separately approved
destination and credentials, not the production public catalogue token.

The one-shot migration service additionally requires pinned Supabase connection
configuration and a persistent Railway journal volume. Its default command
remains disabled. Deploy and verify compatible readers before publishing any
new pointers; start with an inventoried 25-asset batch using the existing
[migration runbook](r2-catalogue-migration-20261023.md).

This checkpoint supersedes the earlier runbook's activation-blocked observation
only. It does not establish CDN delivery, populated runtime secrets, successful
migration, app performance or installed-device acceptance.
