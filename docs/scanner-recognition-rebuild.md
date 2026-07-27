# StackR Scanner Recognition Rebuild

Updated: 2026-07-26

## Root Cause Summary

The scanner already has strong components: camera readiness tracking, card localisation, scan quality checks, targeted OCR, local catalogue matching, visual-pack fallback, diagnostics and learning events. The reliability gap is orchestration:

- Quality, OCR, visual matching and confirmation thresholds were not represented as one staged pipeline.
- Baseline evidence did not capture top-5 recall, no-match rate, confident wrong matches, language, era, lighting or sleeve/toploader/slab breakdowns.
- User corrections were logged, but not promoted into a review queue with explicit "user reported, not verified" status.
- Scanner pack generation defaulted to English, which makes Japanese and Chinese matching slower and easier to mis-route.
- Random non-card frames could fall through to a generic "could not identify" state instead of a clear non-card rejection.

## Pipeline

Stage A: Quality validation
- Detect blur, glare, low light, obstruction, perspective distortion, card boundaries, card presence, multiple-card risk and too-distant captures.
- Non-card rejection message: "No trading card was detected. Position one card inside the frame and try again."

Stage B: Image correction
- Crop, perspective-correct, rotate and create separate OCR/visual images.
- Preserve artwork and printed details. Do not over-normalise lighting for recognition.

Stage C: Candidate retrieval
- Use set symbol/code, collector number, OCR card name, HP, Pokemon name, language, artwork embedding, border/layout, rarity, regulation mark and slab label.
- Prefer local OCR and on-device visual packs; use expensive remote analysis only for ambiguous or unsupported cases.

Stage D: Candidate ranking
- Rank by weighted evidence rather than a single OCR/provider score.
- Never merge candidates by translated name alone.

Stage E: Confirmation
- Auto-confirm only above the calibrated threshold and margin.
- Show the best candidates when confidence is lower.
- Capture user corrections as reviewable labels.

## Baseline Metrics

Each benchmark run must record:

- Time to camera readiness, capture, crop, first candidate and final result.
- Top-1, top-3 and top-5 accuracy.
- No-match rate.
- Incorrect confident-match rate.
- Performance by language, era, lighting, item type, capture type and sleeve status.

Do not claim scanner improvement without comparing production baseline and candidate runs on the same benchmark cases.

## Dataset Rules

Training/evaluation samples must record card ID, set ID, language, collector number, variant, source, rights status, capture type, lighting, angle, sleeve status, background, quality score and label verification status.

Allowed training sources are user-consented, licensed, partner, owned or explicitly permitted assets. Copyrighted internet images must not be bulk-uploaded into training without permission. User corrections remain `user_reported` until reviewed.

Controlled augmentations may include mild rotation, perspective, lighting variation, blur, glare simulation, partial obstruction and background variation. Do not alter artwork, set symbol, collector number, rarity, language text or other defining card features.

## Implementation Order

1. Run the baseline benchmark and generate the scanner evidence report.
2. Expand Japanese and Chinese catalogue/embedding coverage using permitted sources.
3. Build language-specific scanner packs with `SCANNER_PACK_LANGUAGE=ja` and `SCANNER_PACK_LANGUAGE=zh`.
4. Tune Stage A thresholds from rejected-frame evidence.
5. Tune candidate ranking weights from verified benchmark cases.
6. Review correction queue and recurring confusion pairs before retraining.
7. Release behind threshold-set rollout gates only after candidate metrics pass.

## Acceptance Gates

- Japanese, Chinese and English cards are matched using stable IDs and language-specific data.
- A failed scan returns to camera search mode.
- Non-card frames show the explicit no-card message.
- Top-1/top-3/top-5 accuracy materially improves against baseline.
- Median final result time materially improves against baseline.
- Incorrect confident-match rate does not regress.
- User corrections are queued for review and are not treated as verified training labels automatically.
