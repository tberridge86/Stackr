# R2 activation and production connection - 24 October 2026

Source baseline: PR #437 at `7eaf21165e6e23a1c4a192f300247d3121f053b2`.

## Verified live configuration

- Owner activated R2 and authorized the exact public-domain binding and restricted production credential.
- Bucket `stackr-catalogue-public`: Standard storage, Western Europe (WEUR).
- Custom domain `assets.stackrtcg.com`: Cloudflare reports **Active / Enabled**. The development r2.dev endpoint remains disabled.
- Created `stackr-catalogue-production-20261024`: Object Read & Write, restricted to this bucket, until revoked. No credential material is recorded in this repository.
- Saved both R2 credential fields as secrets in the existing protected GitHub `production` environment. Saved bucket, endpoint and public base URL as production environment variables. Existing required-reviewer protection is preserved; no production credential was copied to staging.
- Applied only `STACKR_R2_BUCKET` and `STACKR_R2_PUBLIC_BASE_URL` to Railway production API service `pocketvault` (`299d7ad4-5ed8-4301-b609-ef99274078d0`). Railway accepted the two-variable change and started its configuration redeployment. Completion and served source revision have not yet been verified at this checkpoint.
- The API's R2 adapter is URL-only. Private scan routes retain Supabase storage; administrative catalogue routes enqueue work. R2 write credentials belong on publishing/migration services, not this API reader.
- No artwork objects have been copied, database pointers changed or source objects deleted. The architecture PR has not yet been merged.

## Validation and staging isolation

All four hosted PR workflows passed for baseline `7eaf211`: Platform
`40085203225`, Gateway `40085203222`, binder `40085203238`, owner pricing
`40085203235`. New changes require their own hosted checks.

The Japanese completion workflow can start on qualifying main pushes. Its
first preparation step now requires all five staging R2 settings before any
discovery or ingestion. It rejects the production bucket and production CDN
hostname, including case and trailing-DNS-dot variants. Missing or unsafe
configuration fails preparation; dependent mutating jobs cannot run. Diagnostics
name configuration fields without exposing values.

Local YAML parsing, 13 offline guard fixtures and independent review pass.
Removing the inserted guard reproduces the exact baseline workflow; triggers
and other commands are unchanged. This is not a live staging connectivity test.
Staging requires separately authorized storage/credentials before its writers
can resume.

## Release and migration boundaries

PR #436 remains separate and is not included in this R2 release. Its failing
mobile-recovery assertion and daily-history schema/app coordination remain
separate work.

Public readers require the bucket and public base URL together. Retained
GitHub public writers have explicit environment mappings and additionally use
the endpoint and restricted credential. The one-shot migration service needs
those five R2 settings, pinned production Supabase configuration and a persistent
Railway journal volume. Its default command remains disabled.

Deploy and verify compatible readers before publishing any new pointers.
Begin with an inventoried 25-asset batch using the
[migration runbook](r2-catalogue-migration-20261023.md), verify authenticated and
public CDN bytes, and preserve original objects plus rollback receipts.

This checkpoint establishes active CDN configuration and saved production
configuration only. It does not establish successful object delivery, completed
migration, architecture deployment, app performance or device acceptance.
