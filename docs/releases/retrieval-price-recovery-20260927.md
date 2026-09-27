# Retrieval and mixed-folder pricing recovery — 27 September 2026

Base: `76fadecbf61f065ca4c714d469be86c89bcc7804`. Implements the owner's accepted retrieval, unpriced-holding and existing-worker recovery priorities.

## Scope

- Selected-set numeric multipart searches retain Chinese collector `01 03` as one number. Global parsing and language/set boundaries remain unchanged.
- Variant-only card-image manifests use the existing bounded identity RPC, retaining pagination and derivatives. No migration or asset rewrite.
- Custom folders are language-neutral. Saved card prefixes, exact existing card metadata and unambiguous published identities supply per-card language. No holding or folder is rewritten. The owner's recollection of VSTAR is not confirmation that unprefixed saved English references represent physical Japanese cards.
- Existing TCGdex refresh accepts Japanese holo only when the exact provider record explicitly has holo and explicitly excludes every other finish. Existing Cardmarket conversion, canonical snapshot writer, source timestamp and six-hour freshness rule remain in use. No source activation or competing pricing lane.

## Local evidence

Against the previously captured 333 saved records / 366 copies, replay retains all 298 previously priced copies and resolves two more from exact saved card metadata: 300 priced, 66 unpriced, GBP 679.34 versus GBP 679.24. These are stored-snapshot preview results, not a production refresh receipt. All 300 quotes remain older under the existing six-hour policy.

Read-only provider evidence for Japanese `S12a-012` and `S12a-225` has unique holo flags and dated Cardmarket quotes. Quote availability is checked again during the actual worker run; it is not inferred from this sample for the entire collection.

Validation covers selected-set search identity/language negatives, bounded manifest pagination, mixed folders, metadata conflicts and failures, unchanged inputs, real isolated SQL preparation/publication, strict Japanese finish proof and original provider age, and existing owner refresh/general-price identity tests. TypeScript and lint gates also apply.

## Delivery and remaining exceptions

At implementation time this change is not merged or deployed. Release uses the existing protected backend-only workflow and existing owner-provider refresh workflow (dry run before apply). Railway worker schedules and billing remain unchanged. Railway previously rejected deployment because its trial expired; verify again using the reviewed revision.

PBL conflicting aliases, unsupported grades, missing aliases and provider gaps remain explicit exceptions until exact evidence resolves them. Do not replace completed catalogue metadata or override conflicting printing/finish identities to manufacture prices.

Build 47 and installed-device haptics, gyro, loading and value verification remain separate delivery checks. The user reported installed build 46. Rollback is the previous reviewed backend/worker source; additive price snapshots retain provenance and no ownership rollback is needed.
