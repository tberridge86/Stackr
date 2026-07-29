# Critical Security Remediation

Date: 2026-07-29

Status: credential containment verified live; critical database controls rehearsed in staging; production rollout remains NO-GO.

## Fixes prepared

| Finding | Prepared control | Production state |
| --- | --- | --- |
| Public private-profile fields | `profile_public_directory` contains display-only fields and is kept in sync by a trigger. Public app reads now use it. | Expand migration not applied. Legacy `profiles` public-read policy remains until the app cutover. |
| User role escalation | Final cutover revokes broad profile writes and grants authenticated writes only to approved columns. Update RLS has `USING` and `WITH CHECK`. | Cutover script not applied. |
| Cross-user market rows | The permissive authenticated policy is removed; reads are limited to public rows or the row owner. | Migration not applied. |
| Public scan bucket | `card-scans` becomes private, is limited to 5 MiB JPEG/PNG/WebP objects, and uses authenticated user-prefixed paths. Existing root-level objects remain owner-readable through stored ownership. | Migration not applied. |
| Railway gateway origin bypass | Gateway-owned backend routes fail closed by default in production when origin authentication is not configured. | Code not deployed; Railway variables must be configured first. |
| Secrets in new commits or bundles | CI scans the working tree, pull-request commit range, and exported app bundle without printing secret values. | Current-tree, exported-bundle, and rewritten ordinary-ref history scans pass. GitHub Support purge of pull-request references remains pending. |

## Verified live credential cutover

On 2026-07-29, the Railway backend was moved from the exposed legacy Supabase `service_role` JWT to a modern backend-only secret API key under the existing server variable name. The replacement deployment returned HTTP 200 from `/health` and completed a Supabase-backed card lookup with a database match.

The EAS inventory covered 15 production store builds. Every inspected production build used the modern publishable Supabase key rather than the legacy `anon` JWT. The current development, preview, staging, and production EAS profiles also use the publishable key.

After the Railway and GitHub Actions consumers were updated, the legacy JWT-based API keys were disabled. Supabase key metadata then reported the legacy key disabled and the publishable key enabled, while a repeat Railway database lookup still returned HTTP 200 with a database match. The same repeat probe received HTTP 500 from the external Pokemon provider; provider health is tracked separately and did not affect the successful Supabase lookup.

No database migration, RLS change, storage-policy change, gateway deployment, or mobile publication was performed as part of this credential cutover.

## Staging database rehearsal

On 2026-07-29, the critical database controls were rehearsed in the separate `Stackr me5 staging` project (`lmwfhvexfcoyeuoyrlco`) using two synthetic `.invalid` profiles, three synthetic market rows, and an empty synthetic `card-scans` bucket. No production or customer data was copied into staging.

The forward rehearsal applied the synthetic fixture, `critical_security_containment`, and `finalize_profile_privacy_cutover`. The assertions verified:

- the public profile directory contained both display-only rows and no email, push-token, role, or payment columns;
- the anonymous role received `permission denied` when selecting the private `profiles` table;
- each authenticated test identity saw one private profile row and zero rows belonging to the other identity;
- anonymous market access returned only the public row, while each authenticated identity saw the public row plus its own row and none belonging to the other identity;
- `card-scans` was private, limited to 5 MiB JPEG/PNG/WebP uploads, and protected by authenticated owner-path read, upload, and delete policies;
- the public scan-read policy was absent.

The emergency rollback scripts were then applied in reverse order. Supabase's supported Storage API was required to delete the empty test bucket because current platform protections reject direct deletion from storage system tables. Final cleanup confirmed that every synthetic table, function, row, policy surface, and bucket was removed. Supabase security advisors reported zero findings after cleanup.

The staging catalogue schema still has 127 pre-existing performance-advisor items: 69 unindexed foreign keys, one table without a primary key, 41 unused-index notices, and 16 multiple-permissive-policy warnings. These are a prioritised performance backlog and were not introduced by the rehearsal.

The free-plan environment can keep only one non-production project active and spent several minutes switching between two paused rehearsal projects. `prompt5-migration-rehearsal` was returned to `INACTIVE`; `Stackr me5 staging` completed the authoritative rehearsal. This environment is suitable for manual verification but is not dependable enough for unattended CI until the redundant rehearsal project is removed or staging is moved to a plan with stable availability.

Production Supabase was not modified.

## Safe rollout order

1. Rotate every exposed credential before relying on Git history cleanup. Treat the Supabase legacy service-role JWT as active until it is revoked.
2. Configure the same strong origin key in Cloudflare `BACKEND_ORIGIN_KEY` and Railway `STACKR_GATEWAY_ORIGIN_KEY`. Set Railway `STACKR_GATEWAY_ORIGIN_AUTH_MODE=required` before deploying the backend change.
3. Back up Supabase and verify the backup can be listed and read.
4. Dry-run and apply `20260729055239_critical_security_containment.sql` in staging. This expands the profile model and contains market and scan access without removing the legacy profile-read policy.
5. Verify profile-directory row count equals profile row count, profile updates sync, public scan URLs fail, owner-signed scan URLs work, and user-specific market rows cannot be read by another account.
6. Deploy the app build that reads public display data from `profile_public_directory`. Complete community, friends, offers, marketplace, search, profile editing, push-token, and admin-role UAT.
7. Apply `finalize_profile_privacy_cutover.sql` only after telemetry confirms the updated app is active for the supported release cohort. Convert it to a timestamped migration at approval time so production history remains authoritative.
8. Re-run Supabase security advisors, API contract tests, staging smoke tests, and the red-team reproductions.

## Credential incident actions

Rotate or revoke these credential classes in their provider dashboards; never paste values into an issue, pull request, or chat:

- Supabase legacy service-role/JWT signing material, then migrate clients to publishable keys and servers to secret keys.
- Ximilar and CardSight credentials.
- eBay OAuth client secret and any derived refresh tokens.
- Pokemon TCG and other catalogue/pricing provider keys found by the incident inventory.
- Stripe live secret and webhook signing secret; inspect Stripe logs for unexpected use.
- Railway, Cloudflare, GitHub, and Expo deployment credentials if the history review shows they were committed.

After rotation, rewrite the private Git repository history using a reviewed sensitive-data inventory and a disposable mirror clone. Coordinate the force push, invalidate old clones, and require every contributor to reclone. Do not use history rewriting as a substitute for rotation.

Acceptance criteria:

- The old Supabase service-role credential returns an authentication failure.
- Full-history secret scanning passes on every rewritten root history.
- Current-tree and exported-bundle secret scanning pass.
- Provider access logs have been reviewed from the earliest known exposure date.
- GitHub branch protection requires the security and bundle checks.

## Rollback

- Phase-one database rollback: `supabase/manual/rollback_20260729055239_critical_security_containment.sql`.
- Profile cutover rollback: `supabase/manual/rollback_finalize_profile_privacy_cutover.sql`.
- Backend rollback: restore the prior Railway deployment. Do not disable origin authentication as a routine workaround.
- Mobile rollback: restore the previous EAS update only while the legacy profile policy is still present.

The database rollback files intentionally restore unsafe historical access and are emergency-only. A forward fix is preferred.
