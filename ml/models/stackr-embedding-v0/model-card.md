# Stackr Embedding Model V0

## Model Version

stackr-embedding-v0.0.0-blocked

## Intended Use

Internal research for Pokemon card visual retrieval experiments using approved Stackr recognition training data. The intended output is a 128-dimensional L2-normalised embedding for candidate retrieval.

## Unsupported Use

This artifact must not be used for production recognition, grading, price estimation, identity forcing, user moderation, or any workflow that transmits user photos without explicit consent.

## Training Data

Dataset manifest: `ml/data_manifests/pilot-dataset.parquet`

Dataset version: `stackr-pilot-recognition-dataset-v1.0.0`

Dataset manifest SHA-256: `9ded04ffc25428ad733cdb1530a64a58c40526f61ff5edd3e1838b616ab6e815`

Current run status: `blocked`

## Provenance

The pilot dataset metadata records zero approved training-pixel sources at this run. No external pretrained weights were used because model-weight provenance has not been reviewed for this task.

Source commit hash: `b6495cc77fd0e56e5911c5925c6bf3680640860a`

Source tree dirty during artifact generation: `true`

## Compared Baselines

- A. Supervised contrastive MobileNetV3 Small: blocked; objective=Supervised contrastive metric-learning objective with class-aware batches.; pretrained=no
- B. Multi-similarity MobileNetV3 Small: blocked; objective=Multi-similarity metric-learning objective with hard-negative mining.; pretrained=no
- C. Perceptual hash plus local-feature matching: blocked; objective=Nearest-neighbour retrieval over non-neural visual descriptors.; pretrained=no

## Metrics

Training and retrieval metrics are intentionally null because the run was blocked before image pixels could be loaded.

Required metrics retained in the metrics schema:

- training loss
- validation retrieval accuracy
- top-1
- top-3
- mean reciprocal rank
- hard-negative accuracy
- language accuracy
- same-art reprint accuracy
- exact-variant accuracy
- embedding-distance distributions
- model size
- desktop inference time

## Limitations

- no_approved_training_pixels
- no_real_phone_test_captures

## Known Failure Modes

- No trained embedding weights exist for this version.
- Clean reference metadata alone cannot demonstrate phone-camera recognition performance.
- OCR-only or collector-number-only matches remain insufficient for automatic exact identity.
- Hard-negative families that lack approved image pairs cannot be measured.

## Model Licence

No model weights are released for this blocked V0 run. Future weights must carry an explicit licence tied to approved training data and reviewed initialisation provenance.
