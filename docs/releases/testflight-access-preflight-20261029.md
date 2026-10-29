# TestFlight access preflight — 29 October 2026

The owner requested the next build. Release target remains the standard production
profile and Team (Expo). This receipt records access recovery and preflight only;
no merge, database mutation, service deployment, native build or submission occurred.

## Candidate and verification

- PR #446: https://github.com/tberridge86/Stackr/pull/446
- Candidate head: `334cf9e80423130716b5c67860872124f1fc0386`.
- Observed main: `8d368bcf68aff40fd358640889898120563f5124`.
- The PR remains draft, open and mergeable.
- All five exact-head workflows passed: Platform 40651260897, Card-first UI
  40651260982, Gateway 40651260976, Pricing 40651260989 and Binder 40651260920.
- The frozen WP32 job is skipped separately from the active scoped checks.
- Existing source review and local validation are recorded in the October 28
  integration receipt; this preflight does not claim additional phone acceptance.

GitHub, Supabase, Railway, Cloudflare, Expo and App Store Connect dashboards are
accessible. App Store Connect still shows 1.0.6 (61) as the newest inspected build
with Team (Expo) access. Dashboard sign-in does not supply a Stackr app QA session.

## Current deployment and rollback observations

Production Supabase project is `oakdbbzdqwurpjnoqhmu`. At
`2026-10-29 18:15:07.380258+00`, read-only lookup of
`api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)`
returned NULL. No SQL was applied.

Railway production backend remains SUCCESS at
`dfc23b30-9675-4ba0-ad2b-9f1875302747`, snapshot
`3580e80a-c847-4320-a256-ce75ae132258`; rollback and redeploy are available.
There are no staged changes. Project `d205637b-5376-41aa-9169-1015ba88fec3`,
environment `b4304736-cac8-4ca9-92a7-93f7f6499c2f`,
service `299d7ad4-5ed8-4301-b609-ef99274078d0`.

Cloudflare deployment UI freshly shows version prefix `56f04b7f` at 100% traffic,
tag `gateway-privacy-4e405d7b95dce08d71bdbd42ad5e4e6f3b829a07`.
The historical `gateway-live-delivery-20261018.json` maps this to:
- Version `56f04b7f-0692-4d8f-a9ae-0963442e57b8`.
- Deployment `edc59e4a-b404-449d-a26a-e61784ceacfd`.
- Durable Object namespace `aa7d685ce0ee4139b5b70cf0b33db23c`.

The full IDs and Durable Object binding remain historical evidence, not newly
attested live values. The existing gateway dispatch must reattest them before upload.

## Concrete blocker and continuation

The existing local designated QA credentials template has empty email and password
fields (presence-only checks; no credentials recorded). It has been opened in
Notepad for the owner to populate privately. Existing unrelated Notepad tabs were
preserved. No credentials or admin-created user tokens were substituted.

The October 28 release checklist explicitly requires designated-account QA before
the SQL, compatible backend/gateway rollout and dependent client release. Complete
the signed-in service checks with the designated account and record a sanitized
receipt; do not equate these with installed-phone UI or account-switching acceptance.

Then use the existing owner execution paths:
1. Revalidate the accepted candidate and merge with an exact expected-head guard.
2. Apply only the pinned search identity page proposal after its dependency/grant
   checks. Proposal LF SHA256:
   `d8f15108792dd828f4beb979245e66add90aba7b0bc1aaed7d0ce331eefd70b8`.
   Keep the sibling rollback proposal. Unrelated prepared-valuation/Profile/daily
   movers migrations remain out of scope.
3. Roll out the compatible backend, then gateway, preserving rollback receipts and
   verifying actual production delivery.
4. Freshly dispatch `build-owner-ios-release.yml` on the accepted exact main SHA,
   with exact deployed backend SHA, `verify_only=false` and explicitly
   `build_profile=production`. Do not rerun baseline run 40286973319.
5. Submit the exact finished new EAS build via submit profile production to
   `Team (Expo)`, then verify processing and tester availability.

The native workflow only builds; submission is separate. The next build number has
not been allocated. Baseline EAS build is
`c0acb3f0-8366-48cf-b55c-99b30a2b7469`, source
`b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`.

## Artwork continuity

Carry forward the October 27 evidence: 62,098/62,098 eligible R2 assets across 135
durable batches, 13 GET checks covering 11 objects, with no source deletion.
The Jungle first-edition Pikachu 60/64 rebind was API verified; regular-edition
artwork remains explicitly missing. Storm's 113 image files were checked.
These are prior receipts, not a new full delivery audit. Preserve unresolved
source-license/edition matches and perform the promised configured API verification
before TestFlight. Installed-phone image rendering remains unverified.

Sources:
- `docs/releases/testflight-coming-soon-integration-20261028.md` at candidate head.
- `docs/releases/testflight-continuation-20261027.md` on the infrastructure evidence branch.
- `docs/releases/gateway-live-delivery-20261018.json`.
