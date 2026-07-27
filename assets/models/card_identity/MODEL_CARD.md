# Stackr Card Identity ONNX Model

## Model Version

stackr-card-identity-onnx-v0.0.0-blocked

## Status

blocked

## Intended Use

Mobile inference for Stackr card-identity visual embeddings after an approved source model has been trained, evaluated and exported.

## Unsupported Use

This blocked artifact must not be used for production recognition, grading, pricing, identity forcing, or matching unknown cards to the nearest known card.

## Source Model

- Source model version: `stackr-embedding-v0.0.0-blocked`
- Source status: `blocked`
- Source checkpoint contains weights: `false`
- Selected source baseline: `none`
- Dataset manifest SHA-256: `30088194d480c2b037db56329514c75e67a296b8889beda9e073b5d4c7c937ce`

## Preprocessing Contract

- Fixed dimensions: `1x3x320x224`
- Colour order: `RGB`
- Pixel range: `float32_0_to_1`
- Mean: `0.485, 0.456, 0.406`
- Std: `0.229, 0.224, 0.225`
- Resize algorithm: `bilinear`
- Crop behaviour: `use_native_rectified_full_card_preserve_complete_card_no_square_crop`
- Tensor layout: `NCHW`
- Output: 128-dimensional L2-normalised embedding

## ONNX Parity

- Required test images: `1000`
- Tested images: `0`
- Maximum embedding difference: `not measured`
- Mean embedding difference: `not measured`
- Nearest-neighbour parity: `not measured`

## Quantisation

- Full precision: `blocked`
- FP16: `blocked`
- INT8: `blocked`
- INT8 decision: INT8 cannot be accepted or rejected until a representative calibration set and protected hard-negative evaluation are available.

## Benchmarks

No mobile inference benchmark was recorded because no ONNX model binary was exported.

## Licence

No model binary was exported for this blocked run. Future weights require approved training provenance and an explicit model licence.

## Blockers

- no_approved_embedding_model
- source_checkpoint_has_no_weights
- no_selected_source_baseline
- test_image_count_below_1000
- quantization_calibration_dataset_missing
- pytorch_onnx_parity_unavailable
- quantized_accuracy_unmeasured
