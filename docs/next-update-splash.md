# Next Update Splash Mitigation

## September 9 startup repair

The animated loading component had only been mounted by `/splash-preview`; the real root font gate and initial account/profile route still showed different static splash images. Both startup phases now mount `StackrLoadingScreen`, using the shared neutral background, navy text, purple indicator and small gold accents. The native launch image remains the first frame before JavaScript is ready.

The native splash hides after the root view lays out, revealing actual loading content instead of relying on an 80 ms timer. Bundled fonts have a five-second fallback; account and profile requests each have a ten-second deadline. Failed account/profile reads show a retry action. A failed profile read cannot send an existing collector to setup. There is no artificial minimum loading-screen duration.

Loading animations do not hold React Native interaction work open and pause for recovery or Reduce Motion. The latter can be checked in iOS accessibility settings.

Validation: `npm run test:startup-loading`, `npm run typecheck`, `npm run lint`. Cold launch, offline recovery and the final native-to-runtime visual transition still need testing on the iPhone. This source change is not present in the user's installed build 27 until released.

Stackr's next app update includes the new premium branded launch/loading treatment in two layers:

- Runtime Expo loading screen: `components/StackrLoadingScreen.tsx`
- Native SwiftUI drop-in for a future iOS shell: `ios-swiftui/StackrSplashView.swift`

The Expo app does not currently contain a checked-in native `ios/` project, so the SwiftUI file is preserved as a drop-in implementation rather than compiled directly today. To avoid the splash being missed in the next EAS update, the live React Native loading screen now uses the same Stackr logo, blobs, stars, slogan, and restrained shimmer treatment.

Reference assets are tracked in:

```text
assets/ios-splash-reference/
```

Expected Xcode asset names for the SwiftUI implementation:

```text
stackr_wordmark
stackr_icon
blob_purple
blob_light_purple
blob_orange
sparkle_gold
double_star_gold
```

Before the next release:

- [x] Keep the branded runtime splash in the Expo app.
- [x] Keep the SwiftUI native splash implementation in source control.
- [x] Keep matching asset references in the repository.
- [ ] If/when an `ios/` project is generated, add `ios-swiftui/StackrSplashView.swift` to the Xcode target and import the assets into `Assets.xcassets`.
