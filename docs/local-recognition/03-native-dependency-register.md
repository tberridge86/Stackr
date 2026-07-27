# Native Dependency Register

Created: 2026-07-26

Scope: dependencies and native-build impact for Prompt 3. No package installation or dependency upgrade was performed.

## Core App Versions

| Dependency | Version | Source | Notes |
| --- | --- | --- | --- |
| Expo SDK | `54.0.36` | `package.json`, installed package | Existing project version. |
| React Native | `0.81.5` | `package.json`, installed package | Existing project version. |
| React | `19.1.0` | `package.json`, installed package | Existing project version. |
| Expo Dev Client | `6.0.21` | `package.json`, installed package | Existing development-build support. |
| Expo Camera | `17.0.10` | `package.json`, installed package | Main scanner camera package. |
| React Native Vision Camera | `4.7.3` | installed package | Legacy/grading camera package and future frame access candidate. |
| ONNX Runtime React Native | `1.24.3` | `package.json`, installed package | Already configured as app plugin; Android generated Gradle dependency already present. |
| Expo Modules Core | `3.0.30` | installed package | Native module foundation. |

## Added Local Module

| Item | Value |
| --- | --- |
| Package name | `stackr-card-vision` |
| Package version | `0.1.0` |
| Native module name | `StackrCardVision` |
| Native module version | `stackr-card-vision-native-v1` |
| Native approach | Expo Modules |
| Android class | `com.stackr.cardvision.StackrCardVisionModule` |
| iOS class | `StackrCardVisionModule` |
| Public JS wrapper | `lib/stackrCardVision.ts` |
| Diagnostics route | `/scan/card-vision-diagnostics` |

## Health-Check Capability Fields

| Field | Android implementation | iOS implementation |
| --- | --- | --- |
| `platform` | Returns `android`. | Returns `ios`. |
| `moduleVersion` | Returns `stackr-card-vision-native-v1`. | Returns `stackr-card-vision-native-v1`. |
| `onnxRuntimeAvailable` | Checks `ai.onnxruntime.reactnative.OnnxruntimeModule` and whether `onnxruntimejsi` can load. | Checks `OnnxruntimeModule` Objective-C class availability. |
| `cameraFrameAccessAvailable` | Checks VisionCamera `Frame` and `FrameProcessorPlugin` classes. | Checks VisionCamera `Frame` and `FrameProcessor` or `FrameProcessorPlugin` classes. |
| `nativeImageProcessingAvailable` | Checks Android `BitmapFactory` availability. | Checks Core Image availability. |
| `opencvAvailable` | False. | False. |
| `opencvVersion` | Null. | Null. |

## ONNX Runtime

Current package:

- `onnxruntime-react-native@1.24.3`
- License from package metadata: MIT
- Existing app plugin: `onnxruntime-react-native`
- Android generated Gradle dependency already present: `implementation project(':onnxruntime-react-native')`
- iOS plugin support exists in the installed package, but iOS native project checks were not available in this Windows checkout.

Prompt 3 adds:

- `assets/models/stackr-card-vision-healthcheck.onnx`
- `runOnnxRuntimeControlledSessionCheck()`

The health-check model is an Identity graph with no card data and no learned weights. It is used only to prove that ONNX Runtime can create and release a native session in a development build.

## Camera

Current packages:

- Main scanner: `expo-camera@17.0.10`
- Future frame access candidate: `react-native-vision-camera@4.7.3`

No camera package upgrade was performed. No frame processor was added in this phase.

## Camera Permissions

Camera permissions remain configured through app configuration:

- `app.json` `expo-camera` plugin
- `app.json` `react-native-vision-camera` plugin
- `app.json` `expo-image-picker` plugin
- iOS `NSCameraUsageDescription` in app config
- Android `android.permission.CAMERA` in app config

No manual generated permission file edit was made for Prompt 3.

## OpenCV

No OpenCV dependency was added.

| Field | Value |
| --- | --- |
| Required in Prompt 3 | No |
| Installed | No |
| Version | N/A |
| License | N/A |
| Build impact | None in this phase |

Future OpenCV work must use an official OpenCV 4.x distribution and must document exact version, license, binary size, ABI support and build-time impact before integration.

## Build Impact

Added build inputs:

- A small local Expo Module package under `modules/stackr-card-vision`.
- Android Kotlin source for a health-check module.
- iOS Swift source and podspec for a health-check module.
- A 146-byte ONNX health-check asset.

Not added:

- No cloud recognition provider.
- No API keys.
- No OpenCV wrapper.
- No native frame processor.
- No new model weights for card recognition.
- No dependency upgrades.

