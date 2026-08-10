# 05 Live Camera Guidance and Automatic Capture

Date: 2026-07-26

## Scope

Prompt 5 connects the Prompt 4 `StackrCardVision` frame analyser to Stackr's existing VisionCamera scanner route at `app/scan/card-camera.tsx`.

The default Expo Camera `/scan` recognition route, Supabase flows, marketplace flows, binder flows, grading flows and recognition APIs were deliberately left untouched.

## Current Version Constraints

- Expo SDK: `~54.0.36`
- React Native: `0.81.5`
- VisionCamera: installed as `react-native-vision-camera` major `4` with resolved package `4.7.3`
- Worklets present: `react-native-worklets` `0.5.1`
- Worklets missing: `react-native-worklets-core`
- Native analyser config: `stackr-card-frame-analyser-v1.0.0`

VisionCamera 4 frame processors require the native frame processor runtime. The scanner only attaches a frame processor when `StackrCardVision.getCardVisionRuntimeInfo()` reports `cameraFrameAccessAvailable=true` and the `stackrCardFrameAnalyser` plugin initializes successfully.

## Implementation

The VisionCamera screen now:

- Requests YUV preview frames with `pixelFormat="yuv"` when the frame processor is available.
- Uses the installed VisionCamera 4 `useFrameProcessor` API.
- Calls the native `stackrCardFrameAnalyser` frame processor plugin through `VisionCameraProxy`.
- Uses `runAtTargetFps(8)` and a native `minIntervalMs` of `125` ms.
- Lets native code drop frames when the analyser is busy or still inside the throttle window.
- Emits only small structured analysis results to React Native.
- Never passes full preview frame image data or base64 through the JavaScript bridge.
- Tracks corner movement across analyses.
- Requires three consecutive accepted analyses before automatic capture.
- Locks automatic capture until framing becomes unacceptable or movement invalidates stability, preventing repeat captures of the same stable card.
- Allows manual capture at any time.
- Supports tap-to-focus and records focus failures.

## Native Frame Handling

Android frame processing now copies only the Y/luminance plane inside the frame processor callback and immediately schedules analysis on a single native worker thread. The `Frame` and `ImageProxy` are not retained by the worker. Incoming frames are dropped when:

- The previous accepted analysis was less than `minIntervalMs` ago.
- The native analyser worker is busy.
- The frame has no usable luminance plane.
- The native callback throws while preparing the luminance sample.

iOS has matching instrumentation and health-check functions. A real iOS VisionCamera frame processor plugin is not enabled yet because this repository does not currently include a validated iOS frame processor registration path for the installed runtime.

## Live Guidance

`lib/liveCardGuidance.ts` maps analyser reasons to user guidance:

- `LOW_FILL` or `NO_CARD`: move closer
- `EDGE_CLIPPED`: move further away
- accepted-but-not-yet-stable: hold steady
- `GLARE` or `OVEREXPOSED`: reduce glare
- `UNDEREXPOSED`: improve lighting
- `CORNER_OCCLUDED`: show all four corners
- `PERSPECTIVE` or `ASPECT_RATIO`: flatten the angle
- `BLUR`: tap to focus
- `MULTIPLE_CARDS`: keep one card in the window

Quality thresholds remain in the versioned native analyser configuration, not in UI code.

## Instrumentation

The live scanner records:

- `analysisFramesReceived`
- `framesProcessed`
- `framesDropped`
- `analyserP50Ms`
- `analyserP95Ms`
- `timeToStableCaptureMs`
- `focusFailures`
- `captureSource` (`auto` or `manual`)

The instrumentation does not log card images, base64 data, API keys, personal information or raw OCR text.

## Recognition Isolation

No recognition API is called by live frame guidance. Automatic capture produces a still photo through the existing `takePhoto` path only after stable framing is observed. Recognition remains a later pipeline concern.

## Remaining Native Build Risk

Because `react-native-worklets-core` is absent, this implementation must be validated in a development build after the frame processor runtime is available. Until then, the screen intentionally falls back to manual capture and avoids mounting an unsafe frame processor.
