# Latest Stackr Prompts

Last updated: 2026-06-24

This file captures recent product/design prompts and what was implemented from them. Sensitive credentials or private login details are intentionally not recorded here.

## 1. Raw Card To Graded / Slab Conversion

Prompt intent:

- Add a premium raw-owned-card to graded/slab-owned-card transition.
- Include grading company, grade, optional cert number, optional slab photo/value.
- Animate the card lifting, slab frame forming, sparkles, and landing in a Slab Binder.
- Move one selected copy only.
- Log Recent Activity.
- Keep Stackr visual language: white/pale lavender, deep navy, purple gradients, gold sparkles.

Status:

- Implemented `SlabConversionModal`.
- Added `convertBinderCardToSlabBinder`.
- Added `Slab Binder` destination logic.
- Added slab metadata migration.
- Added Recent Activity logging.

Key files:

- `components/SlabConversionModal.tsx`
- `app/binder/[id].tsx`
- `lib/binders.ts`
- `supabase/migrations/20260623120000_binder_card_slab_metadata.sql`

## 2. Branded Stackr Price Tracking Charts

Prompt intent:

- Replace generic/default chart styling.
- Match Home/Hub screenshots.
- Purple gradient card, white line chart, translucent fill, dotted reference line, endpoint marker.
- Apply to collection value and individual card/slab value history.

Status:

- Updated Home/Hub value tracker.
- Updated PokeTrace card/slab market insights chart.

Key files:

- `components/ValueTrackerCard.tsx`
- `components/PokeTraceMarketInsights.tsx`

## 3. Stackr Hero Bar Icons

Prompt intent:

- Use supplied Stackr icon assets instead of generic vector icons.
- Icons included Marketplace, Social, Pokedex, Profile, Seller Mode, notifications, info, scan card, binders, price builder, sell card, and trade.

Status:

- Copied icons into the repo.
- Added shared icon map.
- Updated bottom nav, Hub hero buttons, Hub quick actions, Social notification, Profile notification, Binder Vault Pokedex shortcut.
- Replaced Hub Trade quick action with the dedicated `trade.png`.

Key files:

- `assets/images/hero-icons/`
- `lib/stackrIcons.ts`
- `app/_layout.tsx`
- `app/(tabs)/index.tsx`
- `components/HomeCommandCenter.tsx`
- `app/(tabs)/binder.tsx`
- `app/(tabs)/community/index.tsx`
- `app/(tabs)/profile.tsx`

## 4. Premium Stackr Splash / Loading Screen

Prompt intent:

- Create a premium animated Stackr splash/loading experience.
- Use Stackr logo/wordmark, card icon, purple/light-purple/orange blobs, gold sparkles, and slogan.
- SwiftUI implementation requested, with helper views and integration example.
- Must be responsive, safe-area aware, premium, animated, and not a static poster.

Status:

- Added a standalone SwiftUI drop-in file for future native iOS shell.
- Mitigated Expo gap by updating the actual React Native `StackrLoadingScreen`.
- Copied splash reference assets into the repo.
- Added release checklist to ensure it stays part of the next update.

Key files:

- `ios-swiftui/StackrSplashView.swift`
- `components/StackrLoadingScreen.tsx`
- `assets/ios-splash-reference/`
- `docs/next-update-splash.md`

## 5. Expo Go / QR / Dev Build Notes

Prompt intent:

- Make it easier to open Stackr on iPhone.
- Generate a working QR and explain why Expo Go may not load.

Status:

- Generated `expo-go-qr.png`.
- Confirmed the app likely needs a custom Expo development build because it uses native modules such as Vision Camera, ONNX runtime, Stripe, and Purchases.

Key file:

- `expo-go-qr.png`

Recommended dev command:

```powershell
npx expo start --dev-client --tunnel
```

## Prompt Log Rule Going Forward

For future product prompts, add a short entry here with:

- Prompt intent
- Implementation status
- Key files changed
- Any release risk or follow-up
