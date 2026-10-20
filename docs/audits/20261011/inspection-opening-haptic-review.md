# HAPTIC-INSPECTION-001 delayed opening feedback

Target7 follow-through on 11 October 2026 in the maintained integration checkout. Frozen comparison source is `bd2aa90414f40533979e4161d5c0e8fbf78708cf`; matching main remains `3d08536f7bd581ed1266f176c13640c0a712305f`. This is an independently reviewed local repair, not a delivered or tactile comfort claim.

## Confirmed issue and smallest adjustment

The shared `CardInspectionProvider` requests opening feedback, while the haptic facade asynchronously hydrates the saved preference. Unlike the existing foil cue, opening feedback had no current-view guard. A card could close before hydration finished and still produce an obsolete native impact.

Reuse the facade's existing `isCurrent` guard for `cardInspection`, retaining zero-argument compatibility. The provider captures an inspection generation and pathname, invalidates the generation on close/replacement/navigation/unmount, and masks navigation during render before passive cleanup. Keep the existing rigid opening impact, 250ms cooldown, saved preference, web no-op and native-error containment. Existing request validation, lazy viewer, list state, after-close action order, navigation and rendering stay intact. No dependency or new interaction pattern is added.

## Source entry inventory

Eight production consumer files route inspection through the shared provider. The source has sixteen `inspectCard(...)` call sites across these consumers; paired long-press/accessibility handlers and generic reusable components are not sixteen independently tested phone journeys.

| Consumer | Source path | Declared routes |
| --- | --- | --- |
| Card detail | `app/card/[id].tsx` | Artwork inspection button |
| Binder detail | `features/binder/BinderDetailScreen.tsx` | Existing binder inspection handler |
| Binder add cards | `app/binder/add-cards.tsx` | Long press and accessibility inspection |
| Pokémon detail | `app/pokemon/[id].tsx` | Long press and accessibility inspection |
| Home command centre | `components/HomeCommandCenter.tsx` | Chase/missing rail long press and accessibility |
| Home collector sections | `components/HomeCollectorSections.tsx` | Shared card tile long press and accessibility |
| Market cards | `components/market/MarketComponents.tsx` | Shared card/listing long press and accessibility |
| Search cards/listings | `components/search/SearchResults.tsx` | Card tile and result-row long press/accessibility |

The development-only `app/dev/card-inspection.tsx` also uses the provider and is excluded from the production count. Tracked app/components/features/lib sources contain no direct `expo-haptics` import outside `lib/haptics.ts`. Only the provider loads `CardInspectionViewer`, and only that viewer uses `InteractiveCardPreview`. This is source mapping for the existing showcase, not physical coverage across every card/language or proof about system-level feedback.

## Verification

- Meaningful RED: with `CARD_INSPECTION_BASELINE=1`, the actual frozen haptic facade produces one impact after the fixture closes during hydration (expected zero). The frozen complete provider also fails because it supplies no live opening guard.
- GREEN actual facade controls: current guarded opening requests the existing single rigid impact; expired/already-closed requests dispatch none. Existing disabled/web/native rejection/cooldown/legacy preview controls pass.
- React-rendered complete provider and existing preview lifecycle: **30 cases** pass with mocked native boundaries. New cases check live opening, close, replacement, pathname invalidation in layout before passive route cleanup, and unmount. Existing lazy load, list/filter/scroll preservation and quick-action dismissal ordering remain.
- Full `test:card-inspection` passes existing motion, material identity, accessibility interactions, Home, foil/rendering, showcase and issue304 controls. Native GPU compile, physical-card material verification and installed haptics remain outside these fixtures.
- Application TypeScript and affected-file lint pass; the lifecycle test retains three pre-existing warnings, no errors. Whitespace check passes. Independent review accepted the scoped repair with no P1/P2 finding.

## Delivery and acceptance

Implementation commit is recorded in the queue/integration receipt. Merge, matching app delivery and installed-device verification are pending. Reference phone is iPhone15 Pro, owner-reported iOS26.6.1, 5G, previously installed build54. The source inventory resolves the missing source-map step; real preference-on/off, repeated gesture/cancel/back, unsupported-device behaviour, latency and at least4/5 helpful/comfortable tester feedback remain unmeasured. Target7 is open.
