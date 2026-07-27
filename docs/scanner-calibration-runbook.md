# StackR Scanner Calibration Runbook

This runbook exists to prove scanner improvements with real evidence. Do not tune thresholds from a handful of easy cards or visual gut feel.

## What Is Now Versioned

- Auto-capture stability and duplicate cooldown.
- Blur, glare, exposure, framing, perspective, obstruction and stability quality gates.
- Local OCR auto-confirm and top-three suggestion thresholds.
- Remote fallback thresholds.
- Binder-page auto-confirm thresholds.
- Duplicate-detection thresholds.

The current draft version is `stackr-scanner-calibration-v1`.

## Benchmark Set

Build the benchmark set from `data/scanner-benchmark-cases.template.csv`. Every row needs a known `correct_stackr_card_id`.

Minimum coverage:

- English cards.
- Japanese cards.
- Modern cards.
- Vintage cards.
- Standard, holo, reverse-holo and textured cards.
- Promos and unusual numbering.
- Raw cards and graded slabs.
- Bright, dim and reflective lighting.
- Low, middle and high-end physical devices.
- Single-card scans and binder-page scans.
- Known difficult near-identical variants.

Minimum comparable sample before release decision:

- 60 production-baseline case results.
- 60 candidate-scanner case results.

Use the same cards, lighting setup and devices for baseline and candidate runs where possible.

## Baseline Run

1. Use the current production scanner flags.
2. Create a `scanner_benchmark_runs` row with `scanner_variant = production_baseline`.
3. Scan every active benchmark case.
4. Record one `scanner_benchmark_results` row per case.
5. Record:
   - Camera-ready time.
   - First-attempt success.
   - Top-one and top-three accuracy.
   - Total scan time.
   - Manual correction.
   - Rescan count.
   - Remote API usage.
   - Failure category.
   - Duplicate additions.
   - Crash outcome.

## Candidate Run

1. Enable the candidate scanner pathway and draft threshold version.
2. Create a `scanner_benchmark_runs` row with `scanner_variant = candidate`.
3. Run the same cases under the same physical conditions.
4. Do not discard failed or awkward scans.
5. Record all corrections and rescans.

## Threshold Calibration Rules

Do not use one confidence threshold for every recognition source.

Tune separately:

- Auto-capture stability.
- Blur rejection.
- Glare rejection.
- Local auto-confirmation.
- Local top-three suggestions.
- Remote fallback.
- Binder-page auto-confirmation.
- Duplicate detection.

OCR confidence, visual similarity and Ximilar confidence are different signals. Treat them separately.

## Evidence Report

After baseline and candidate rows exist, run:

```bash
npx tsx scripts/build-scanner-evidence-report.ts
```

The script writes `reports/scanner-calibration-evidence.md`.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The report will not invent missing data. If the benchmark is too small, it will say so.

## Release Gates

Do not release globally unless the candidate shows:

- No meaningful top-one accuracy regression.
- No meaningful top-three accuracy regression.
- Better first-attempt success.
- Lower or equal median completion time.
- Acceptable 95th-percentile completion time.
- Lower or equal remote request rate.
- No increase in duplicate additions.
- No device-specific crash regression.
- No meaningful failure-rate regression.

## Progressive Rollout

Use this order:

1. Internal test users.
2. StackR development accounts.
3. Selected UAT partners.
4. Small production cohort.
5. Wider rollout.

Move to the next stage only after a fresh evidence report recommends `proceed`.

## Raw Image Rule

Raw images must not automatically become training data. Store only metrics and IDs unless the user has explicitly consented to image retention for model improvement.
