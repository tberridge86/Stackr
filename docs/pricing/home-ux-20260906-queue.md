# Approved Home: next TestFlight inclusion queue

Prepared 6 September 2026 after the owner approved the Home preview and asked to queue it alongside live pricing. **Status: queued for source integration; not a combined build-ready candidate, EAS job, OTA or TestFlight upload.**

## What is approved

- Value summary first, before Search/Scan and the collecting goal.
- A measured full-width, 76px-high compact chart in an unboxed 80px host; signed GBP and percentage movement, direction arrow, existing price disclosure and one 7D/30D selector.
- A collecting goal, short relevant card rail, concise updates and recent activity, using existing Stackr artwork/icons and navigation.
- English Home captions and detail descriptions while foreign-language artwork, language labels and exact card identity remain unchanged. Missing translations have honest English fallbacks, not invented names.
- Existing loading, empty, partial and recovery behaviour remains meaningful. Preview values are not evidence of live price accuracy.

This records the latest approved Home, not automatic approval to merge every prior app change from the shared workspace. The later value-first handoff supersedes the earlier collector-first ordering.

## Frozen source and fallback

The 17 named source/test/handoff files are copied to `D:/Stackr-release-queue/home-20260906/source`. Every copy was SHA-256 checked against the approved source. The adjacent [manifest](home-ux-20260906-manifest.json) records exact bytes, source checkout and release target. This is a review packet, **not a standalone app or a drop-in overlay**: whole-file snapshots also contain earlier workspace work and depend on the existing app.

Source: `D:/Stackr-1`, HEAD `4de71b535faaac6b876804c5ee156df8b47afbe6`, with existing uncommitted changes. HEAD alone does not reproduce the approved preview; use the file hashes and packet. No environment files, credentials, node_modules, catalogues or unrelated app files were packaged.

Pre-change fallback remains at `D:/Stackr-fallbacks/before-home-value-priority-20260906/source`; the earlier full fallback at `D:/Stackr-fallbacks/before-ux-refresh-20260905` is untouched. Recovery is selective and requires checking subsequent edits; never reset or clean the shared workspace.

## Required integration before a release build

The pricing candidate at `e33855e33af17fba91fca8f7f60b2095941a2d1b` already changes `features/home/HubScreen.tsx` and `components/ValueTrackerCard.tsx`. Its API differs from the preview. **Do not copy either approved file over the pricing version.**

1. Keep the pricing candidate's nullable `totalValue`, `pricingState`, `pricingCoverageLabel`, `pricingWarning`, `refreshing` and `onRefresh` interface. Preserve unavailable versus empty states, known subtotals, stale-price disclosure and retained successful reads after refresh errors. Do not convert unavailable prices into zero.
2. Keep `loadCollectionPrices`, collection pricing summaries/cache, exact-variant comparable history, authenticated refresh queue, bounded polling and rotating batches. Keep owner-only access and source/evidence checks, including Minty's comparable-history gating. The visual port must not replace the pricing data layer with the older preview workspace implementation.
3. Port the approved layout, compact chart and English display helpers into those contracts. Adapt `HomeCollectionHero` to the candidate's binder/chase/activity state. Review `HomeCommandCenter` types and the existing BinderArtwork/StackrImage/artwork-fallback dependencies; preserve reference-image policy and original icons. Do not merge unrelated seller, marketplace, inventory or backend changes merely to satisfy imports.
4. Preview fixtures are not needed in the native release. If retained for developer review, preserve both the route guard and Hub guard: development AND web AND framed AND loopback only. Native and production cannot accept fixture props or contact the optional loopback image helper. Never replace the normal Home route with `/dev/home-pricing-preview`.
5. Run the existing pricing candidate checks plus the Home regressions against the integrated source, adapting tests to the preserved pricing contracts rather than weakening assertions. Export iOS JavaScript using the existing production-owner configuration, then perform the physical-device checks below. The pricing queue's previous iOS export does **not** include this approved Home.

Preserve app version **1.0.3**, the owner-only audience, production-owner profile and `1.0.3-owner-recognition-v1` runtime. Do not reserve a build number, change release flags, publish, submit, deploy or activate providers as part of queue preparation. Pricing activation retains all separate gates in [live-pricing readiness](live-pricing-production-readiness.md).

## Verification receipt: approved source, not merged release

Fresh local checks on 6 September passed in `D:/Stackr-1`:

- `npm run typecheck`
- `npm run lint`
- `npx tsx scripts/test-home-display-labels.ts`
- `npx tsx scripts/test-home-collector-sections.ts`
- `npx tsx scripts/test-home-value-layout.ts`
- `npx tsx scripts/test-home-collector-preview.ts`
- `npx tsx scripts/test-home-value-presentation.ts`
- `npx tsx scripts/test-web-control-states.ts`

The approved preview was previously reviewed at 393 x 852 and 430 x 932. Tests cover positive/negative movement, measured chart width, empty/loading/partial/error states, English fallback labels and fixture rejection for production/native/unframed/non-loopback environments. This queue preparation does not claim a new native export, signed build, physical-device test or combined pricing/Home regression pass.

## What to test in the next TestFlight

- With your real account, value and signed change appear before collecting content. The chart fits without horizontal overflow and the 7D/30D controls still work.
- No collection is an onboarding state; a failed or unavailable price is not displayed as a GBP0 collection. Partial/stale values explain their coverage and age.
- A refresh queues work honestly, retains existing successful data on failure, and never manufactures a price change.
- Binder goals, card details, Chase List, Search and Scan open the intended real screens. No sample records or preview banner appear on iPhone.
- Japanese/other foreign artwork stays in its original language; Home captions are English and preserve the edition/language label. Missing artwork follows the existing neutral fallback.
- Check a narrow iPhone and a wider iPhone, large text, VoiceOver labels/reading order, tap targets, safe area and native haptics. Browser review cannot certify these device behaviours.

Release acceptance remains pending until the source integration, combined validation, owner-profile export and native smoke test are complete. Queueing does not weaken any existing release or provider gate.
