# Next TestFlight: completed collector fixes

The owner selected the latest completed card-finish, usability and pricing fixes for the next normal TestFlight beta. This candidate builds on PR #312 at `89bb6f7231b65bf230754089929bd80608f7986b`. Image and price coverage work continues separately; complete catalogue coverage is not a delivery prerequisite for this constrained beta.

## Included

- Shared button sizes, readable typography, labelled listing fields, accessible dialog and recovery controls, and consistent flow layout.
- Display-only finish profiles and inspection surfaces on card details, scan results, owned binder cards, inventory thumbnails and profile showcases. Saved showcase finish metadata survives reopening and hydration. Unknown finishes remain conservative; effects never establish a canonical printing or a verified physical material.
- Full-resolution supplied artwork in enlarged views, exact-edition priority, and same-printing image recovery. Existing foreign-language artwork guards, approved startup video, modal keyboard handling and dismissal sequencing remain in place.
- Exact selected variant, finish, edition, language, set, product and currency validation for the detail-price path. Changing selection clears the old price and ignores late responses. Existing authenticated bulk and detail caches retain account/language/condition isolation and sale provenance.
- Root and backend lockfiles select `proxy-addr` 2.0.8, removing the critical advisory that failed PR #312's dependency gate.

## Validation and delivery boundary

Focused checks cover rendered control semantics, finish resolution/ownership/showcase round trips, artwork candidates, actual pricing request paths and stale UI responses. Existing artwork recovery, inspection lifecycle/material safety, startup, native-language display and commerce-lock checks are also exercised. `test:next-beta-fixes` is included in normal platform CI. Type checking, lint, backend type checking and the iOS production bundle are required before freezing the native source. Lint may retain pre-existing warnings; it must have zero errors. Native compilation and physical-device acceptance are separate from a local JavaScript bundle export.

The next native build uses the existing reviewed-main iOS workflow with the normal `production` profile and the exact integrated main revision. Version/runtime remains 1.0.5; the remote build counter supplies the next build number. A successful build must be submitted, processed and assigned to the existing TestFlight groups before delivery is claimed. External availability additionally depends on Apple beta review. No new native build or device acceptance is established by this source receipt alone.

On 6 October a live Apple read confirmed build 52 (`ab7ada32-5e74-4830-ba9d-7f4f2b6fbd7f`) is VALID, APPROVED and IN_BETA_TESTING for both existing internal and external groups. Its enabled public link is https://testflight.apple.com/join/qDmymuVm. This supersedes the earlier pending-review snapshot; it does not prove installation on the owner's phone.

## Background work

Remaining image gaps, broader price coverage, translation proposals and pricing-worker/database improvements retain their separate evidence and approval requirements. This candidate does not publish proposed names, activate providers, apply catalogue/database migrations, trigger manual price refreshes or enable commerce. The existing available TestFlight build remains the fallback while the next build is processed.
