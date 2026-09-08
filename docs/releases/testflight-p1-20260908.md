# Stackr TestFlight release — 8 September 2026

The owner requested the UX/P1 fixes in the next TestFlight and one clear release path. This instruction authorizes the iOS build and submission; it supersedes the earlier queue-only instruction for this release.

## One owner release path

- App: **Stackr**, Apple app `6772118450`, bundle `com.tommo86.Stackr`.
- Version: **1.0.3**. EAS assigns the next build number remotely.
- EAS project: `@tommo86/Stackr`, project ID `22048198-a309-41d2-a2bf-aa354c76be3a`.
- Build and submit profile: **production-owner**, using the existing production services.
- Update channel/runtime: `owner-recognition` / `1.0.3-owner-recognition-v1`.
- Audience: existing **Team (Expo)** internal group. Its only tester was verified as the owner in App Store Connect on 8 September. No other group is part of this submission.
- Review the app in TestFlight. Local browser previews are development tools, not additional release candidates.

## Consolidated source

Branch `codex/testflight-p1-20260908` in the existing `D:\Stackr-live-pricing-ready-20260905` checkout combines the P1 fixes with main `3d4647e318faf42eb8c75d7fc776b9d337632fce`. Main contains the shipped Build 27 commit `a335d64b1c6f025c7e94fa6013614b6d70fbb2c3` and the subsequent approved Home, catalogue, binder, pricing and recognition repairs. No extra checkout or hosted environment was created for this release.

The P1 changes add manual collection review, durable owner-scoped scan recovery, recoverable pricing/search/saved-item errors, confirmed removal failures and exact product-to-listing handoff. Manual collection retries use a persisted request and reconciliation journal; unsubmitted drafts remain editable and discardable.

Build only iOS with `production-owner`. Resolve its production environment before evaluating Expo configuration. After the build finishes, submit its exact verified build UUID using `scripts/submit-owner-recognition-ios.mjs`; do not use an unqualified latest build. Confirm Apple processing and the assigned group before calling the build available.

Backend deployments, hosted database migrations, provider activation, public updates and App Store distribution are separate work. The release retains the existing production controls.

The final build ID, build number, validation results and Apple status are recorded in the release receipt produced by the release task.
