# Native Build Setup For Stackr Card Vision

Created: 2026-07-26

Scope: Prompt 3 native-build foundation for future on-device recognition. This phase adds a local native health-check module and a development-only diagnostics route. It does not implement card recognition, change scanner capture behaviour, change provider routing, upgrade Expo/React Native, or add OpenCV.

## Findings Before Coding

- Expo SDK is `54.0.36`.
- React Native is `0.81.5`.
- Expo Camera is installed as `expo-camera@17.0.10`.
- React Native Vision Camera is installed as `react-native-vision-camera@4.7.3`.
- ONNX Runtime React Native is already installed as `onnxruntime-react-native@1.24.3`.
- `expo-dev-client@6.0.21` is already installed.
- `eas.json` already contains a `development` profile with `"developmentClient": true`.
- `app.config.js` already supports a development variant through `APP_VARIANT=development`, preserving the production app identifiers while using development identifiers when requested.
- `android/` exists as a native Android project.
- No full `ios/` native project directory was present in this Windows checkout, so iOS native compilation could not be run here.
- Camera permissions are already configured through `app.json` plugins and app config. No generated Android manifest or iOS plist permission edit was required.
- Expo Modules autolinking defaults `nativeModulesDir` to `./modules`, so a local Expo Module can be added without manually editing `MainApplication.kt`, `settings.gradle`, a Podfile, or generated app bootstrap files.

## What Changed

Added a local Expo Module package:

- `modules/stackr-card-vision`
- Native module name: `StackrCardVision`
- Native function: `getCardVisionRuntimeInfo()`
- Module version returned by native code: `stackr-card-vision-native-v1`

Added app-facing TypeScript wrapper:

- `lib/stackrCardVision.ts`

Added a bundled health-check ONNX model:

- `assets/models/stackr-card-vision-healthcheck.onnx`

The ONNX model is a tiny self-authored Identity graph. It contains no card data, no model weights and no images. It exists only so a dev build can attempt to create and release an ONNX Runtime session.

Added development-only diagnostics route:

- `app/scan/card-vision-diagnostics.tsx`

This screen is hidden outside development builds and shows:

- native module health-check response,
- ONNX Runtime availability,
- VisionCamera frame-processor class availability,
- native image-processing availability,
- OpenCV status,
- bundled ONNX session health-check result.

## What Was Left Untouched

- Existing app identifiers:
  - iOS production bundle ID remains `com.tommo86.Stackr`.
  - Android production package remains `com.tommo86.Stackr`.
  - Development variant handling remains in `app.config.js`.
- Signing configuration.
- Deep links and schemes.
- Notifications configuration.
- Supabase configuration.
- Marketplace, binder, inventory, listing and grading flows.
- Existing scanner camera screen behaviour.
- Existing cloud/legacy provider code.
- Existing dependency versions and lockfiles.
- Generated native app bootstrap files.

## Development Build Status

An Expo development build configuration already exists:

- `expo-dev-client` is installed.
- `eas.json` has a `development` profile with `developmentClient: true`.
- `package.json` has `android:dev` using `APP_VARIANT=development&& expo run:android`.

No expo-dev-client repair was required.

## Native Module Approach

Stackr now uses an Expo Modules local package for the card vision health-check shell.

Autolinking verification:

- Android resolves `stackr-card-vision` from `modules/stackr-card-vision/android`.
- Android module class: `com.stackr.cardvision.StackrCardVisionModule`.
- Apple resolves pod `StackrCardVision` from `modules/stackr-card-vision/ios`.
- Apple Swift module class: `StackrCardVisionModule`.

This follows the installed Expo SDK 54 module shape:

- Android module extends `expo.modules.kotlin.modules.Module`.
- Android uses `ModuleDefinition`, `Name(...)` and `Function(...)`.
- iOS module imports `ExpoModulesCore` and defines `public class StackrCardVisionModule: Module`.
- iOS uses `ModuleDefinition`, `Name(...)` and `Function(...)`.

## Health-Check Contract

`getCardVisionRuntimeInfo()` returns:

| Field | Meaning |
| --- | --- |
| `platform` | `android`, `ios`, `web` or `unknown`. |
| `moduleVersion` | Native module version. |
| `onnxRuntimeAvailable` | Whether the installed native ONNX Runtime bridge/library appears available. |
| `cameraFrameAccessAvailable` | Whether VisionCamera frame/frame-processor classes appear available. |
| `nativeImageProcessingAvailable` | Whether platform-native image-processing primitives appear available. |
| `onnxRuntimeDetail` | Non-sensitive implementation detail string. |
| `cameraFrameAccessDetail` | Non-sensitive frame access detail string. |
| `nativeImageProcessingDetail` | Non-sensitive native image processing detail string. |
| `opencvAvailable` | Always false in this phase. |
| `opencvVersion` | Null in this phase. |
| `error` | JS fallback error if the native module is not linked or throws. |

The health check does not log or return images, raw OCR text, API keys or personal information.

## ONNX Runtime Session Check

`runOnnxRuntimeControlledSessionCheck()` in `lib/stackrCardVision.ts` loads `assets/models/stackr-card-vision-healthcheck.onnx` with `expo-asset`, then attempts:

1. `import('onnxruntime-react-native')`
2. `InferenceSession.create(modelUri)`
3. `session.release()`

On native Android/iOS development builds, this is the controlled ONNX session check. In this Windows shell, it cannot be executed because it requires a running native React Native app.

## Camera Version And API Boundary

Current camera versions:

- `expo-camera@17.0.10`
- `react-native-vision-camera@4.7.3`

The native health check uses class availability checks only. It does not copy frame-processor code from another VisionCamera major version. A future frame processor must use the installed VisionCamera 4 API and should be validated against the current native build.

## OpenCV

OpenCV was not required for Prompt 3 and was not installed.

Current status:

- `opencvAvailable`: false
- `opencvVersion`: null
- build impact: none
- licensing impact: none

If future card-corner or rectification work requires OpenCV, use an official OpenCV 4.x distribution and document the exact version, license and binary size/build-time impact before integration. Do not add an abandoned React Native wrapper.

## Build And Check Results

Checks that passed:

- `npx tsc --noEmit --pretty false`
- `npx expo config --type introspect --json`
- `npx expo-doctor`
- `npx expo-modules-autolinking verify --platform android`
- `npx expo-modules-autolinking verify --platform apple`
- `npx expo-modules-autolinking resolve --platform android --json`
- `npx expo-modules-autolinking resolve --platform apple --json`
- `npx tsx scripts/test-stackr-card-vision-native-config.ts`

Android Gradle checks attempted:

- `./gradlew.bat :stackr-card-vision:tasks --all`
- `./gradlew.bat :app:assembleDebug`

Both were blocked before Gradle could start because this environment has no Java runtime:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

iOS build checks were not run because this is a Windows environment and no full `ios/` native project directory was present.

## Exit Criteria Status

- Development build starts successfully on an available target platform: blocked by missing Java/JDK and no iOS build environment.
- `StackrCardVision` native health check works: implemented and autolinking verifies; device execution still needs a development build.
- ONNX Runtime can create a native session or controlled test session: controlled session check implemented with bundled Identity ONNX model; device execution still needs a development build.
- Existing scanner still opens: scanner route code was not changed in this prompt; TypeScript passes, but device launch could not be verified without Java/native target.
- No unrelated dependency upgrades occurred: met.

