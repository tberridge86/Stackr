# Prompt 17: Local On-Device Inference

Date: 2026-07-26

## What Was Found

- `local_on_device_v1` existed as a controlled not-ready adapter.
- `onnxruntime-react-native@1.24.3` is already installed.
- `assets/models/card_identity/model-manifest.json` is still blocked:
  - `status = blocked`
  - `approvedForMobileInference = false`
  - `model.onnx` does not exist
- `assets/catalogue/catalogue-manifest.json` is still blocked:
  - `approvedForInstall = false`
  - `embeddings.count = 0`
  - all 52 pilot cards are documented as missing embeddings
- The Prompt 16 native search bridge exists, but it cannot return genuine candidates until the embedding pack is non-empty and installed.

## What Changed

- Added `lib/recognition/localOnDeviceInference.ts`.
- Connected `local_on_device_v1` to the local inference lifecycle instead of returning a static not-ready response.
- Added model/catalogue readiness validation before any inference attempt.
- Added a cached ONNX session lifecycle so a future approved model is not reloaded for every scan.
- Added L2-normalisation of ONNX embedding outputs before native search.
- Added typed handling for:
  - missing model
  - blocked or corrupt model state
  - missing catalogue
  - incompatible model/catalogue versions
  - out-of-memory
  - inference timeout
  - invalid tensor
  - unavailable native search
- Added a development-only comparison screen at `/scan/local-inference-comparison`.
- Added scanner-session warmup behind `localRecognitionEnabled` or `localRecognitionShadowMode`.

## What Was Left Untouched

- Existing legacy recognition remains the default production route.
- No cloud API was added to the local engine.
- No card is automatically added from local candidates.
- Existing scanner capture, Supabase, binder, marketplace, listing and grading flows were not restructured.
- No dependency or Expo SDK versions were changed.

## Current Behaviour

Because the approved model and catalogue are absent, `local_on_device_v1` returns:

- outcome: `rescan_required`
- candidates: `[]`
- error: `LOCAL_MODEL_BLOCKED` or the first applicable readiness blocker

This is intentional. No fake candidate is created.

## Future Ready Path

Once an approved model and compatible non-empty catalogue exist, the intended local path is:

1. Scanner session warms `local_on_device_v1` when the local feature flag or shadow-mode flag is enabled.
2. The engine validates model and catalogue versions.
3. The ONNX session is created once and cached by model URI/version.
4. The rectified recognition crop URI is used as the image input.
5. Base64-only images are rejected.
6. A native or efficient binary preprocessor supplies the fixed `1 x 3 x 320 x 224` float tensor.
7. ONNX inference runs with timeout protection.
8. The 128-dimensional output is L2-normalised.
9. Native flat search returns top candidates.
10. The recognition adapter returns `review_required`; it does not auto-add the card.

## Development Comparison Mode

The comparison route displays:

- scan image
- top local candidates
- similarity values
- OCR evidence
- rectification/preprocessing/inference/search/total timings
- model and catalogue versions

It is hidden outside development builds.

## Important Limitation

The current implementation intentionally does not perform real preprocessing or inference while the model is blocked. The default preprocessor returns `LOCAL_PREPROCESSOR_UNAVAILABLE` after readiness becomes valid unless a native/efficient tensor path is supplied. This prevents accidental base64 conversion or large JavaScript image decoding from becoming the default recognition pathway.

## Verification

Run:

```bash
npm run test:local-on-device-inference
npm run test:recognition-orchestrator
npx tsc --noEmit
```

Native airplane-mode candidate verification still requires:

- an approved `assets/models/card_identity/model.onnx`
- a ready catalogue with embeddings
- a native development build
- Java/Android or macOS/iOS tooling
