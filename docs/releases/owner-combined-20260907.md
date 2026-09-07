# Combined personal camera update for build 27

This release starts from production `c35667bfcd54bf8b497a01973643618584a799e1` in `tberridge86/Stackr`. It retains the API gateway, Railway backend/private SigLIP service, Supabase production catalogue and artwork storage, reviewed Home/UI and all 81 magazine covers already included in build 27.

## Changes

- Private recognition now offers a canonical correction flow: language, set, collector number, card and available variant/finish. It works when the correct card was absent from the five model suggestions. Changing an earlier choice clears dependent choices and ignores delayed responses.
- The owner can save a crop locally or explicitly upload the photograph and corrected identity to the existing private feedback service. Predictions, corrected printing/variant/finish, model/index provenance and the physical-card group remain linked. Failed transfers retain a local retry record; account changes stop subsequent writes. Old local captures remain available.
- Uploaded examples are queued for review. The action does not instantly train a model or add a card to a collection. Existing review/export boundaries remain intact.
- Deletion waits for private image removal and records withdrawal/deletion without modifying reviewer-only status fields. A live canary exposed the previous reviewer-trigger conflict; the route fix keeps the existing database protections and requires no new schema or permissions.
- Integrates the compact iPhone scanner/card-camera spacing fixes and the binder saved-card fallback before optional enrichment. Original working files remain preserved in the previous worktree.

## Release lane

App version remains 1.0.3. The app changes use existing native components and are compatible with build 27's `owner-recognition` channel and `1.0.3-owner-recognition-v1` runtime. Use a verified iOS EAS Update for this channel after the backend deletion fix is live. The ordinary `production` update channel is not the target. Earlier compatible owner-runtime binaries can receive the same channel update; private model access remains restricted by the existing server-verified owner check.

No gallery/model replacement, new image store, catalogue import, new native dependency or staging promotion is included. Source-labelled prices and history remain available through the existing production API. Automatic/manual refresh queue activation and sold-provider publication remain outside this update; the current worker is not an exact-owner TCGdex-only worker and must not be enabled simply to clear a disabled state.

## Acceptance

Run app/backend type checks, lint, owner recognition/teaching tests, scanner routing, binder catalogue and all-81-cover checks. Verify one temporary non-training image/identity upload and deletion on the deployed service, then remove the canary. Export the owner iOS bundle once and scan it for secrets; confirm runtime/channel before publishing.

After installing build 27, launch Stackr online, allow the update to download, then close and reopen it. Open Scan's flask button, photograph a card and use the correction/teaching controls. Actual physical-camera accuracy, large-text interaction and the phone's receipt of the OTA require device testing; automated and reference-image tests do not establish those results.
