# Prompt 18: Evidence Fusion And Calibrated Confidence

Date: 2026-07-26

## What Was Found

- The local embedding model remains blocked.
- The ONNX export remains blocked.
- The local embedding catalogue remains blocked with zero embeddings.
- No reviewed validation prediction file exists at `ml/data_manifests/evidence-fusion-validation.jsonl`.
- Because there are no local prediction rows with correctness labels, automatic acceptance thresholds cannot be backed by observed validation data yet.

## What Changed

- Added `lib/recognition/evidenceFusion.ts`.
- Added a calibration command: `npm run fit:evidence-fusion`.
- Added tests: `npm run test:evidence-fusion`.
- Added blocked calibration artifacts:
  - `assets/models/card_identity/evidence-fusion-calibration.json`
  - `ml/reports/evidence-fusion-calibration.json`
  - `ml/reports/evidence-fusion-calibration.html`
- Connected `local_on_device_v1` so future local candidates are reranked through evidence fusion rather than using visual similarity as a confidence percentage.

## Features Implemented

The fusion layer extracts:

- visual similarity
- rank
- top-one/top-two similarity margin
- collector-number exact match
- collector-number partial match
- set-code match
- set identity match
- card-name similarity
- language agreement
- regulation-mark agreement
- release-era agreement
- variant evidence
- frame-to-frame agreement
- capture-quality scores
- OCR conflict with the visual candidate

## Safety Rules

The layer enforces these abstention behaviours:

- A weak collector number cannot override poor visual similarity.
- Conflicting strong OCR evidence triggers review, not automatic acceptance.
- A small top-one/top-two margin triggers review.
- No local candidates triggers rescan.
- Low-quality captures cannot receive automatic acceptance.
- If the calibration model is blocked, candidates can be shown for review but cannot be automatically accepted.

## Calibration

The calibration command supports:

- logistic calibration
- isotonic calibration
- Brier-score comparison
- reliability table generation
- false-accept-rate constrained threshold selection
- false-reject rate, accepted coverage and precision by confidence band
- breakdowns by language and variant

Current status is blocked because validation rows do not exist. The generated report intentionally contains `null` metrics and no acceptance threshold.

## Three-Frame Voting

`fuseThreeFrameLocalEvidence` combines up to three local frame results by canonical card ID, averages visual similarity for repeated candidates and records frame-to-frame agreement as a calibrated feature. It performs no network calls.

## What Was Left Untouched

- Scanner capture flow.
- Cloud/legacy fallback defaults.
- Supabase, marketplace, binder, listing and grading features.
- Model, ONNX and catalogue artifacts from earlier prompts.
- Package versions.

## Required Validation Input

To fit a real calibration model, create reviewed local prediction rows at:

```text
ml/data_manifests/evidence-fusion-validation.jsonl
```

Each row must contain:

- candidate metadata and local similarity
- second-candidate similarity or margin
- OCR evidence
- capture-quality measurements
- frame agreement when available
- ground-truth `correct: true | false`
- language and variant labels for reporting

These rows must come from validation data not used to train the embedding model.

## Exit Criteria Status

- Confidence correlates with observed correctness: not met; no reviewed validation predictions exist.
- The scanner can abstain: met.
- Automatic acceptance thresholds are backed by validation data: not met; thresholds remain null.
