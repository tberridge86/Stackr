# 06 Native Card Rectification

Date: 2026-07-26

## Scope

Prompt 6 adds native card rectification after a VisionCamera still photo is captured. It is additive: the existing Expo Camera scanner, recognition APIs, Supabase integration, marketplace, binder, listing and grading flows are not replaced.

## Versions

- Rectification pipeline: `stackr-card-rectification-v1.0.0`
- ROI mapping: `stackr-pokemon-card-roi-v1.0.0`
- Recognition crop size: `224 x 320`
- Recognition crop ratio: `0.7`, portrait
- Native analyser config used before capture: `stackr-card-frame-analyser-v1.0.0`

No model, catalogue or database schema version was introduced by this prompt.

## Native Outputs

The native module accepts a `CardRectificationRequest` containing:

- source photo file URI
- source photo dimensions
- VisionCamera orientation-derived rotation
- mirrored state
- camera position
- preview dimensions and resize mode
- accepted preview corner coordinates
- scan ID

It returns file URIs for:

- full-resolution rectified image
- `224 x 320` recognition crop
- OCR source crop
- thumbnail
- left-edge ROI crop for geometry QA

Outputs are written to the app cache under `stackr-card-rectification/{scanId}` as PNG files. The source photo is not saved to the user gallery.

## Orientation and Mapping

The mapping path is:

1. Convert accepted normalized analyser corners to absolute preview coordinates.
2. Map preview points through the configured preview resize mode.
3. Correct for mirrored input, which is rejected for card rectification in this version.
4. Apply sensor/display rotation to map preview points into stored full-photo coordinates.
5. Apply a four-point perspective transform natively.
6. Render a portrait card image and derived crops.

The TypeScript test mirror covers iOS and Android orientation strings, portrait capture, landscape capture, rotated card coordinates, severe accepted perspective, front-camera rejection and preview-to-photo coordinate accuracy.

## ROI Mapping

ROI coordinates are normalized against the rectified portrait card:

- `cardTitle`
- `artwork`
- `collectorNumber`
- `setRarity`
- `regulationCopyright`
- `fullFront`
- `fullBack`
- `leftEdge` QA strip

The left-edge QA strip is intentionally narrow and anchored at `x=0`, so the development overlay can catch any bug where an edge crop accidentally becomes an unzoomed full-card copy.

## Development Screen

`/scan/rectification-diagnostics` displays the latest rectified card, overlays all ROI boxes, and shows the generated left-edge crop in development builds. It uses only local file URIs and in-memory metadata.

## Temporary File Cleanup

When the VisionCamera scanner is cancelled, Stackr deletes:

- native rectification cache files for the active scan ID
- original temporary VisionCamera capture files recorded for that scan

## Current Validation Limits

Native Android and iOS compilation could not be verified in this environment because Java/JDK is unavailable and this checkout has no generated `ios/` app project. The TypeScript geometry tests pass, and native implementation must still be validated in a development build on real devices.
