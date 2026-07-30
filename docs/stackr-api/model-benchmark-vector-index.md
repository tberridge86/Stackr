# Stage 6: Model Benchmark, Embedding Generation And Vector Index

Updated on branch: `chore/api-gateway-v1`

Stage status: blocked by missing approved real-world benchmark data and missing Stackr-measured model results.

This stage does not replace the current scanner path, existing CLIP pack, or Ximilar fallback. It adds the reproducible benchmark framework, model registry, index-version gates and regeneration plan needed before Stackr can safely activate its own embedding index.

## Current State Found

- Stackr already has recognition guardrails in `lib/embeddingV0Training.ts`, `scripts/train-stackr-embedding-v0.ts`, `lib/cardIdentityOnnxExport.ts` and `assets/models/card_identity/model-manifest.json`.
- The local V0 embedding plan is explicitly blocked: no approved training pixels and no approved real-phone test captures are available.
- `ml/data_manifests/hard-negative-groups.json` contains 1,071 rows, 51 classes, 51 source images and 1,020 synthetic views.
- The current hard-negative manifest records zero real-phone capture sources and zero approved training-pixel sources.
- The current language coverage includes English, Japanese and Traditional Chinese only. Simplified Chinese and Korean are missing from the benchmark coverage.
- Existing `public.card_clip_embeddings` uses `jsonb` embeddings. It is not a pgvector/HNSW catalogue index.
- Stage 2 already created the private `ml` schema. Stage 6 extends it with benchmark registry and activation metadata only.
- `supabase/config.toml` now exists, but Docker is not installed on the current Windows host, so the full local Supabase reset remains delegated to GitHub CI.
- The Stage 6 migration was applied twice to isolated staging and rolled back twice. The fixed migration produced zero Supabase security-advisor findings and left zero Stage 6 objects after rollback.
- Staging has `vector` `0.8.2` installed in the `extensions` schema. No concrete vector table or HNSW index exists because no benchmark-approved model or dimension has been selected.
- A read-only capture inventory on 2026-07-30 found no reviewed Scan Lab manifest, zero staging benchmark/feedback rows and zero rows in the legacy production training table. Ten legacy `card-scans` objects were excluded because they have no training-consent, verified-label or physical-card-session linkage.

## Benchmark Candidates

The benchmark framework compares candidates without selecting them by reputation alone.

| Candidate | Family | Source | Licence status in Stackr | Dimension | Production decision |
| --- | --- | --- | --- | --- | --- |
| `mobileclip2_s0` | MobileCLIP | Apple `ml-mobileclip` | Research-only model weights | Unknown until export is verified | Blocked for production |
| `mobileclip2_s2` | MobileCLIP | Apple `ml-mobileclip` | Research-only model weights | Unknown until export is verified | Blocked for production |
| `dinov2_vits14` | DINO | Meta DINOv2 | Apache 2.0 | 384 | Candidate, not selected |
| `clip_vit_base_patch32_current_pack` | CLIP | Existing Stackr scanner pack | Needs review | 512 | Fallback/reference comparison only |
| `stackr_embedding_v0_blocked` | Stackr metric learning | Local blocked V0 plan | Rejected until data exists | 128 | Blocked |

Official references reviewed:

- Apple MobileCLIP repository: https://github.com/apple/ml-mobileclip
- Apple MobileCLIP model-weight licence: https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS
- Apple MobileCLIP2 research page: https://machinelearning.apple.com/research/mobileclip2
- Meta DINOv2 model card: https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md
- Meta DINOv2 licence: https://raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE
- Supabase HNSW index guide: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- Supabase pgvector guide: https://supabase.com/docs/guides/database/extensions/pgvector

## Required Metrics

The benchmark report records these fields for every candidate. A model cannot be selected while any production-required metric is missing.

- Model source and licence.
- Input dimensions.
- Embedding dimensions.
- Model size.
- iOS latency.
- Android latency.
- Server CPU latency.
- Memory usage.
- Clean-image top-1 and top-5 retrieval.
- Real-camera top-1 and top-5 retrieval.
- Foreign-language retrieval.
- Cropped-card retrieval.
- Sleeved-card retrieval.
- Glare and blur retrieval.
- Same-artwork card discrimination.
- ONNX or ORT export compatibility.
- Quantisation impact.

Upstream-reported values are stored separately from Stackr measurements and are not used as proof of Stackr production readiness.

## Measurement Evidence Contract

The real benchmark generator accepts measurements only from `ml/measurements/model-measurement-evidence-v1.json`, or the path supplied through `STACKR_MODEL_MEASUREMENTS_PATH`. The file is deliberately absent until real measurements exist.

`lib/modelBenchmarkEvidence.ts` validates all evidence before it can affect selection:

- benchmark, dataset and benchmark-implementation checksums must match;
- every model and preprocessing artifact must have a SHA-256 checksum;
- each run records hardware, operating system, runtime, target and positive sample counts;
- iOS, Android and server latency values must come from their matching targets;
- accuracy values must be finite and between zero and one;
- duplicate or conflicting metrics are rejected instead of silently overwritten;
- model-selection and protected final-test separation must be asserted;
- query images must be excluded from indexed references for the same evaluation;
- measurement evidence cannot override a model's licence or production eligibility.

Missing, malformed, stale or checksum-mismatched evidence contributes explicit benchmark blockers. Direct synthetic fixture values remain test-only and cannot feed the generated registry.

## Weighted Selection

The current weighting is defined in `lib/modelBenchmarkV1.ts`.

| Metric | Weight |
| --- | ---: |
| Real-camera top-1 | 0.16 |
| Same-artwork top-1 | 0.14 |
| Foreign-language top-1 | 0.12 |
| Real-camera top-5 | 0.08 |
| Cropped-card top-1 | 0.08 |
| Sleeved-card top-1 | 0.08 |
| Glare or blur top-1 | 0.08 |
| Clean-image top-1 | 0.06 |
| iOS latency | 0.06 |
| Android latency | 0.06 |
| Quantised top-1 delta | 0.05 |
| Clean-image top-5 | 0.04 |
| Model size | 0.03 |
| Server CPU latency | 0.03 |
| Peak memory | 0.03 |

This puts most weight on real capture performance and hard card-identity cases, not on clean catalogue images.

## Data Leakage Controls

The current report remains blocked until these controls can be proven:

- Physical-card sessions are not split across training, model-selection and protected final-test sets.
- Query images are not indexed as reference images for the same evaluation.
- Synthetic transformations are labelled as synthetic supplement only.
- Real Stackr captures are separated from clean reference imagery.

The benchmark selection function now treats both isolation assertions, accepted measurement evidence and a clean source tree as mandatory gates. Previously, complete fixture metrics could select a candidate while the report still showed both isolation assertions as false; that fail-open path is covered by regression tests.
- Same-artwork and near-identical variants are represented in a protected test set.

## Database Objects

Migration:

`supabase/migrations/20260728064400_embedding_model_registry_and_index_gates.sql`

Private tables:

- `ml.embedding_models`
- `ml.embedding_benchmark_runs`
- `ml.embedding_benchmark_results`
- `ml.embedding_index_versions`
- `ml.embedding_generation_jobs`
- `ml.embedding_activation_events`

Backend-only projection:

- `api.embedding_index_manifest`

Guard functions:

- `ml.card_embedding_vector_table_sql(p_model_id text)`
- `ml.activate_embedding_index_version(p_index_version_id uuid, p_request_id text default null)`

The migration does not create a concrete `vector(n)` table. The vector dimension is chosen only after a model is selected. The `ml.card_embedding_vector_table_sql` function returns dimension-specific SQL for a selected, production-allowed model and includes a HNSW index using cosine distance.

## Activation Rules

An index version cannot be activated unless:

- the model is selected or already active;
- the model licence status is `production_allowed`;
- the index status is `validated`;
- reference embeddings exist;
- missing embedding count is zero;
- validation has completed before activation.

Activation is atomic through `ml.activate_embedding_index_version`, which retires the previous active index for the same language scope and records an activation event.

## Regeneration Command

The command is:

`npx tsx scripts/embedding-index-command.ts --scope=full`

Supported scopes:

- `--scope=full`
- `--scope=language --id=ja`
- `--scope=set --id=<set-id>`
- `--scope=card --id=<card-id>`

Current output is intentionally blocked because no model has been selected by a complete benchmark.

## Generated Reports

- `ml/reports/model-benchmark-v1.json`
- `ml/reports/model-benchmark-v1.html`
- `ml/models/embedding-model-registry-v1.json`
- `ml/reports/embedding-index-regeneration-plan.json`

The 2026-07-30 run remained blocked. It measured no model performance: it rebuilt a governed manifest with 51 metadata/reference classes and 1,020 explicitly synthetic views, selected no model, selected no dimension, and refused to create an inactive index. Evidence is recorded in `deploy/evidence/stage6-capture-readiness-2026-07-30.json` and `deploy/evidence/staging-readiness-2026-07-30.json`.

## Prioritised Gaps

1. Export approved real Stackr phone captures with consent and provenance metadata.
2. Add Korean and Simplified Chinese benchmark coverage.
3. Separate physical-card sessions across training, model-selection and protected final-test splits.
4. Materialise legally approved reference images for all evaluated card variants.
5. Run MobileCLIP2 only as a research comparison unless production rights are obtained or an alternative licensed checkpoint is selected.
6. Export and benchmark DINO-family ONNX or ORT variants on server and mobile targets.
7. Measure float and quantised variants on iOS, Android and server CPU.
8. Generate a complete inactive index for the selected model and validate completeness and nearest-neighbour health.
9. Activate only through the database gate after validation passes.

## Go/No-Go

No-go for production model activation.

Go for collecting benchmark data, testing export paths, and building an inactive index once a model is selected by the weighted benchmark.

## Rollback

Run:

`supabase/manual/rollback_20260728064400_embedding_model_registry_and_index_gates.sql`

This removes only the Stage 6 benchmark registry and index gates. It does not drop shared schemas or earlier-stage catalogue objects.
