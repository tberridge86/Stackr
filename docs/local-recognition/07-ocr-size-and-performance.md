# Prompt 7: Region-Based Multilingual OCR

Date: 2026-07-26

## Scope

Prompt 7 adds an OCR evidence layer behind `OcrEvidence`. The layer is candidate evidence only: it must not become the sole basis for an automatic exact card identity.

No new packages were installed for this phase. Stackr already has `@react-native-ml-kit/text-recognition@2.0.0`.

## Current ML Kit Package

Installed package:

- `@react-native-ml-kit/text-recognition@2.0.0`

Declared Android native recognizers from the installed package:

- `com.google.mlkit:text-recognition:16.0.1`
- `com.google.mlkit:text-recognition-chinese:16.0.1`
- `com.google.mlkit:text-recognition-japanese:16.0.1`
- `com.google.mlkit:text-recognition-korean:16.0.1`

Declared iOS native recognizers from the installed package:

- `GoogleMLKit/TextRecognition 8.0.0`
- `GoogleMLKit/TextRecognitionChinese 8.0.0`
- `GoogleMLKit/TextRecognitionJapanese 8.0.0`
- `GoogleMLKit/TextRecognitionKorean 8.0.0`

The installed package also declares Devanagari support. Stackr does not use Devanagari for Pokémon card OCR in this phase.

Measured repository footprint:

- JS/native wrapper files under `node_modules/@react-native-ml-kit/text-recognition`: 32,493 bytes.

Native binary size impact:

- Android and iOS binary contribution could not be measured in this workspace because a native build is still blocked by the previously recorded missing Java/JDK and lack of an iOS build environment.
- The service records the exact native dependencies and keeps script execution staged so CJK recognizers are not invoked unless needed.

Runtime performance impact:

- Device OCR latency was not measured in this workspace for the same native-build blocker.
- The service returns structured warnings when OCR regions are missing or recognition fails.
- On-device measurement should record per-region and per-script duration once the development build is available.

## OCR Strategy

The OCR service is implemented in `lib/ocrEvidence.ts` and returns the extended `OcrEvidence` interface from `lib/recognition/types.ts`.

The staged recognition order is:

1. Read `collectorNumber`, `setRarity`, and `regulationCopyright` regions first.
2. Use the Latin ML Kit recognizer for number and set-code style text.
3. Select Japanese, Korean, or Chinese recognition only when language hints, user preferences, visual candidates, or first-pass text make it likely to help.
4. Read the card-title region only when it can materially narrow candidates, or when CJK recognition is needed.
5. Return individual OCR evidence items with raw text, normalized text, source region, bounding box, script, recognizer script, confidence where available, and alternatives.

The service accepts already-cropped region images. When those are not supplied, it crops from the Prompt 6 rectified OCR source using the versioned ROI manifest `stackr-pokemon-card-roi-v1.0.0`.

It does not OCR the full camera preview frame, and it does not send images to a cloud service.

## Normalisation

The collector-number parser normalizes:

- Unicode compatibility forms.
- Whitespace.
- Slash variants such as `／`, `⁄`, and `∕`.
- Hyphen variants.
- Japanese OCR hyphen confusion in collector numbers, such as `ー`.
- Full-width digits.
- `O` to `0`.
- `I`, `l`, `|`, and `!` to `1`.
- `S` to `5` when immediately followed by a digit.
- Leading zeros.
- Set-code casing.
- Common OCR punctuation noise.

Examples now covered by tests:

- `099/165`
- `０９９／１６５`
- `099／190`
- `ＳＶＰー０９９`
- noisy isolated `O99`

## Safety Rule

OCR is evidence, not identity.

New OCR evidence sets:

- `soleExactMatchAllowed: false`
- `strategyVersion: stackr-ocr-evidence-v1.0.0`
- `regionVersion: stackr-pokemon-card-roi-v1.0.0`

The existing local OCR matcher was also guarded so OCR-only signals such as `number-total` continue to rank candidates but do not become a `strong` automatic match unless independent visual corroboration is present.

A noisy isolated collector number such as `099` or `O99` is parsed as candidate evidence with low confidence and `not_exact_identity` warnings.

## Production Logging

This phase does not add production analytics. If later analytics are connected, they must not include:

- Card images.
- API keys.
- Personal information.
- Raw OCR text.

Safe fields for production analytics are limited to script attempted, region role, duration, error code, result state, quality reason codes, and coarse confidence buckets.

## Remaining Measurements

Required once the native development build is available:

- Android release/debug APK or AAB delta with and without CJK recognizers.
- iOS archive size delta with and without CJK recognizers.
- Cold recognizer creation time per script.
- Warm recognizer time per script.
- Median, p95, and maximum OCR duration per region.
- Peak memory during staged Latin-only OCR.
- Peak memory when one CJK recognizer is used.

These measurements are not faked in this document.
