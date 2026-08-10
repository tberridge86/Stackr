# Prompt 16: Native Embedding Search Engine

Date: 2026-07-26

## What Was Found

- `StackrCardVision` already exists as an Expo native module with Swift and Kotlin implementations for runtime diagnostics, frame analysis and card rectification.
- `assets/catalogue/card-embeddings.bin` currently contains only a valid 64-byte FP16 header and zero embeddings because the approved ONNX model and reference embedding pack are still blocked.
- `assets/catalogue/card-catalogue.sqlite` records canonical card metadata, but every card row has `embedding_status = 'missing'`.
- The current SQLite catalogue has `language`, `set_id` and `collector_number`; it does not yet contain an `era` column, so the native engine accepts an `era` filter but current packs have no era metadata to match.

## What Changed

- Added an exact native flat-search engine to `StackrCardVision` on iOS and Android.
- Added typed React Native bridge methods:
  - `loadNativeCardIdentitySearchCatalogue`
  - `searchNativeCardIdentityEmbedding`
  - `benchmarkNativeCardIdentitySearch`
  - `resetNativeCardIdentitySearchCatalogue`
- Added a dependency-free TypeScript reference implementation plus a separate Python reference check for deterministic top-K parity.
- Added a benchmark report command that records native benchmark unavailability instead of fabricating device latency.

## What Was Left Untouched

- Existing scanner screens and camera behaviour.
- Existing legacy recognition route.
- Supabase integration, marketplace, binder and portfolio features.
- Package versions and Expo SDK versions.
- Blocked model/catalogue status from Prompts 14 and 15.

## Native Search Behaviour

The native engine loads `card-embeddings.bin` from disk using platform-native file access:

- Android uses a read-only `FileChannel.map`.
- iOS uses `Data(contentsOf:options: .mappedIfSafe)`.

The engine validates:

- binary magic: `STKR-EMB-FP16`
- binary version: `1`
- dimensions: `128`
- bytes per value: `2`
- expected file length
- optional SHA-256 checksum
- optional model-version compatibility
- ready metadata count matching embedding count

The catalogue is built in temporary native memory and swapped into service only after validation succeeds.

## Query Contract

Input:

```ts
{
  queryEmbedding: number[]; // 128-dimensional, finite, L2-normalised
  topK?: number;
  filters?: {
    language?: string | string[];
    setId?: string | string[];
    collectorNumber?: string | string[];
    era?: string | string[];
  };
}
```

Output candidates:

```ts
{
  canonicalCardId: string;
  similarity: number;
  rank: number;
  language?: string | null;
  setId?: string | null;
  collectorNumber?: string | null;
  era?: string | null;
}
```

Similarity is the dot product between normalised vectors, equivalent to cosine similarity.

## Safety Cases

- Empty packs return `empty`, never a fake nearest neighbour.
- Missing native module returns `skipped`.
- Corrupt headers, incompatible dimensions, checksum mismatches and model mismatches return `failed`.
- Query vectors with the wrong dimension, non-finite values or a non-normalised norm return `failed`.
- Approximate indexes such as HNSW were not added.

## Benchmark Status

Required benchmark targets are recorded by:

```bash
npm run benchmark:card-identity-search
```

The current shell cannot execute the Expo native module or measure a real Android device, so the generated report marks all native timings unavailable. The pilot catalogue row is additionally blocked because the current reference pack has zero embeddings.

Real-device target remains:

- p95 native search below 75 ms for 100,000 embeddings on the agreed reference Android device.

## Validation

Run:

```bash
npm run test:card-identity-search
```

This always verifies deterministic TypeScript top-K ordering and metadata filter semantics. It also compares against `scripts/reference-card-identity-search.py` when a usable Python interpreter is available.

Native top-K parity against Python still needs an installed development build plus an approved non-empty embedding pack.
