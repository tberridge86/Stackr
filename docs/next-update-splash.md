# Next Update Splash Mitigation

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
