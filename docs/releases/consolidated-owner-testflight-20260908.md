# Consolidated owner TestFlight release

The owner asked to merge the benefits from the Stackr chats before finalising the release. Build 28 had already been uploaded from `bdf56a5`; it cannot be amended with further source changes. The next native build uses the same app, production-owner profile, owner-recognition channel/runtime and existing Team (Expo) internal group. No new hosted environment is created.

## Reconciliation

| Workstream / task | Included benefit and evidence |
| --- | --- |
| Create market-leading U | P1 recovery and collection review plus 32 applicable P2 fixes, committed in `c8beb2c`. Detailed dispositions are in `docs/UX_P2_FIXES_2026-09-08.md`. |
| Prepare TestFlight production bridge | Latest main `20483bb` is merged into the release branch by `6089911`. This adds PR #151 image/logo recovery and exact search identities, PR #153 name-and-set search ordering, and PR #154 cache, haptic and variant-artwork improvements. |
| Fill image and metadata gaps (2) | The 81 magazine covers and exact issue/language mapping are already included (`20aa963`, `cc8b390`, `89253c7`). The newer bridge records 129 Japanese images, 139 recovered Japanese logo links and 19 English promo image links using existing approved storage. See the API production bridge receipt for scope and exclusions. |
| Improve recognition accuracy (2) | Existing owner-only SigLIP recognition, private capture/correction and teaching flows are retained (`b852318`, `daad49f`, `a220a96`). They remain review-gated and do not automatically retrain or publish a new model. |
| Add live price refresh charts (2) | The merged price/value work (`f87d89d`, with release evidence `e33855e`) retains current estimates, provider-refresh requests and conditional per-card market-history support. It does not yet provide durable personal collection valuation history: the Value History chart remains in its building state. Home can show comparable in-session/cached valuation points. Provider refresh queues checks rather than synchronously updating prices/charts; production data/configuration and verified-sale coverage remain acceptance items. |
| Audit Stackr sales pitch coverage | The merged integration repair retains faster collection loading, honest price subtotals, account isolation and haptic/back-control fixes (PR #148). The source includes these changes; remaining capability gaps are not treated as shipped features. |
| Assess app visual variety | The compact Market header is ported as a small change against the release code: redundant subtitle removed and results/filter/sort/layout controls combined with responsive wrapping. The old dirty Market screen is not copied wholesale. |
| StackR Colour Direction | Applied the requested palette to the shared theme and mounted Home components: soft neutral page backgrounds, white panels, navy headings/collection feature panel, purple actions and selections, teal positive states, and small gold accents. Native delivery and physical-device visual verification remain pending. |
| Add iPhone 15 live preview | Production-safe local preview tooling is retained and excluded from the native archive. Its navigation-race test is made independent of Windows line endings. Browser preview is a development aid, not proof of native behaviour. |
| Assess phone compatibility | Device acceptance requirements are retained: small/large phones, enlarged text, safe areas, keyboard, background recovery and camera behaviour. This task produced an assessment rather than a separate native implementation. |
| Set up Android beta testing | Existing Android support and staging build workflow remain. The chat did not complete a Play Console release; this iOS release does not imply one. |
| StackR Revision Delivery / release-status chats | Operational release evidence is reconciled against actual Git, EAS and App Store Connect identities. Older availability uncertainty is superseded by the verified Build 28 receipt and the new exact-build receipt. |

The earlier dirty `D:\Stackr-1` checkout remains untouched. Completed improvements were matched to release commits or ported narrowly; old experiments, unrelated local changes, migrations and provider activations are not bulk-imported.

## Release contract

- Apple app `6772118450`, bundle `com.tommo86.Stackr`, version `1.0.3`.
- EAS project `22048198-a309-41d2-a2bf-aa354c76be3a`; profile `production-owner`.
- Channel `owner-recognition`; runtime `1.0.3-owner-recognition-v1`.
- EAS assigns the next build number remotely. Submit the exact verified build UUID.
- Assign only the existing Team (Expo) internal group. Confirm Apple processing before claiming availability.
- Publish no public OTA, App Store release, backend deployment, catalogue mutation, provider activation or family/commerce activation as part of this native consolidation.

## Acceptance and limitations

Run app/backend type checks, lint, P1/P2 recovery tests, personal loading/cache tests, catalogue/identity tests, owner recognition/config/archive/submission checks, production export and CI on the consolidated source. Check the compact Market controls and shared dialog keyboard behaviour in the browser.

Actual iPhone keyboard, enlarged text, VoiceOver, haptics and camera accuracy require owner testing in TestFlight. Missing catalogue artwork/translations, limited verified sold-price coverage, production family/child safeguards and commerce fulfilment remain documented gaps. A successful build does not close them.

The exact final commit, build number, EAS build/submission IDs, checks and Apple availability belong in the release receipt, not an inferred label such as “latest”.
