# Prompt 19: Exact Variant Resolver

Date: 2026-07-26

## What Was Found

- The current local catalogue is still blocked and has zero embeddings.
- Current local search candidates do not yet include production artwork/layout/family IDs.
- Hard-negative manifests explicitly call out blocked variant groups such as standard versus reverse holo, stamped versus unstamped and Poké Ball versus Master Ball.
- Existing rectification provides a full-resolution rectified image and ROI mapping that can support high-resolution variant-region extraction.

## What Changed

- Added a versioned variant-family register:
  - `assets/catalogue/card-variant-families.json`
- Added the resolver:
  - `lib/recognition/variantResolver.ts`
- Added independent tests:
  - `scripts/test-variant-resolver.ts`
- Added an independent accuracy report command:
  - `scripts/report-variant-resolver-accuracy.ts`
- Connected `local_on_device_v1` diagnostics so base identity and variant resolution are reported separately in candidate raw diagnostics.

## Resolver Behaviour

The resolver separates:

- base identity: card/artwork/set/language identity from embedding search
- exact variant: finish, edition, stamp, pattern or texture resolution

Outcomes:

- `resolved_variant`
- `unresolved_variant`
- `not_variant_family`

`unresolved_variant` is intentional and safe. It prevents an uncertain finish from becoming a false exact match.

## Candidate Families

Candidate families are keyed by:

- artwork
- collector number
- set
- layout
- language

The current register contains templates only because production catalogue rows do not yet expose all required IDs. Future ready rows must come from approved catalogue data.

## Evidence Supported

The resolver supports discriminators for:

- edition stamp
- promo stamp
- regulation mark
- rarity symbol
- set symbol
- collector-number formatting
- reverse-holo pattern
- Poké Ball pattern
- Master Ball pattern
- texture
- foil area
- copyright line

High-resolution extraction is represented by a region extraction plan over the rectified full-card image using the existing ROI manifest. No full image is returned through JavaScript as base64.

## Safety Rules

- Valuable special variants are never assigned from base artwork alone.
- Special variants require explicit positive evidence.
- Non-special variants such as unlimited or unstamped may resolve only when high-confidence absence evidence exists.
- Reflective/pattern families recommend short tilt capture when unresolved.
- If family data is missing, the candidate remains base identity only with unresolved exact variant.

## Classifier Status

A classifier manifest is defined, but the classifier is blocked:

- no reviewed variant training set
- no approved variant classifier weights

The resolver therefore uses rule/template evidence only today.

## Accuracy Report

Run:

```bash
npm run report:variant-resolver
```

Current status is blocked because no reviewed validation rows exist at:

```text
ml/data_manifests/variant-resolver-validation.jsonl
```

Metrics remain null until that file exists.

## Exit Criteria Status

- Base identity and exact variant are reported separately: met.
- An unresolved finish does not become a false exact match: met by resolver outcome and tests.
- Variant accuracy measured independently: not met; validation rows are missing, so the report is blocked.
