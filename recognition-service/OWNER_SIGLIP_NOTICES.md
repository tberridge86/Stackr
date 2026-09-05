# Owner SigLIP artifact notices

Include this file and the `licenses/` directory with each future owner recognition
artifact package and runtime image. These notices identify the model and database
metadata licences; they do not grant rights in underlying card artwork.

## SigLIP 2 model

- Upstream: Google, `google/siglip2-base-patch16-256`.
- Pinned revision: `3f9f96cb90da5dbc758b01813f2f6f1aee24c1ab`.
- Licence: Apache License 2.0; full standard text in `licenses/Apache-2.0.txt`.
- Official pinned model card, verified 2026-09-05:
  <https://huggingface.co/google/siglip2-base-patch16-256/blob/3f9f96cb90da5dbc758b01813f2f6f1aee24c1ab/README.md>.
  Its metadata explicitly declares `license: apache-2.0`.
- Source weights SHA-256:
  `6125cacc01fa93bdc98a0c5101cefcd69b2ed1f8ab4f38d86f4ad5984f5dc863`.
- Packaged FP32 ONNX SHA-256:
  `f01886dd1d66979f44125db8f482639c9c32cf27d4cc3baa6f1b7d55d2d198d7`.

Stackr modification notice: the upstream vision tower was exported to FP32 ONNX
for image embeddings, with a normalized 768-dimensional output. This is an export
of the pinned model, not a claim of ownership of the upstream model. The source
and export identity come from the local `pilot-report.json` accompanying the
`siglip2-base-patch16-256-20260903-r3f9f96cb-hardened2` export.

The standard Apache licence text was retained from the locally installed
Transformers 4.49.0 distribution. Its package-specific Hugging Face copyright
heading was omitted here because it is not a copyright attribution for Google's
model. No model copyright year or additional model NOTICE text is invented.

## TCGdex database metadata

- Project: <https://github.com/tcgdex/cards-database>.
- Copyright (c) 2021 TCGdex.
- Licence: MIT; complete supplied text in `licenses/TCGDEX-MIT.txt`.
- Retained from the local `tcgdex-cards-database/LICENSE`; checkout revision
  `771a8381c57c73182b9776657a15cd1166c66d36`.
- Source licence SHA-256:
  `12e7dd2d018848b9997d0226c4632f01da86ec4bf6ebe0c8b19953d5e5eeb6ff`.

The MIT notice is retained for provider database metadata and identification
fields. It does not state that TCGdex licenses underlying Pokémon artwork,
trademarks or other third-party material. The inference gallery's source/model
hashes remain recorded in its existing summary and provenance manifests.

Runtime Python dependencies retain their own installed distribution licences.
This file supplements those notices rather than replacing them.
