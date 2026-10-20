# Japanese Neo1 batch four artwork

This publisher contains 24 previously inspected Scrydex originals and 72 display
derivatives from fixed `JP-CARDS-004`. The saved batch has 25 tasks. Slowpoke
alias `045`, printing `494725ee-70bf-41d3-a6b7-2a7bb6180287`, remains excluded
because the source and retained catalogue evidence disagree on HP 40 versus 50.
Whole-batch completion is explicitly false. No artwork from the newly supplied
TCG Collector or Pokellector galleries was acquired for this package.

Each printing, variant, source URL, original hash, observed printed name and
National Dex number is frozen independently. Catalogue `026`, for example,
binds the inspected Wooper `No.194`; its current native label `ウーパー` remains
unchanged while the printed name `ウパー` is retained as separate evidence.
Twenty-one current native labels differ from the inspected printed names.
Those defects remain explicit; this publisher makes no metadata corrections.
Provider IDs are retained observations, not calculated from printed numbers.

The exact current metadata scope is 18 normal and 6 holo variants. Production
uses Japanese version `1a23b7a7-c50e-4601-9180-a25c950d27ea`; staging uses
accepted legacy version `d560cd01-de2a-4713-9518-b967fb4c5ac9`. This is their
sole binding difference. Provider variant labels support those metadata
bindings but do not certify physical foil, finish or edition. The retained
body, attack costs, damage and provider discrepancy witnesses remain separate.

Every original is unmodified and readable at the detail minimum of 360 by 504
pixels. These fronts are below the HD threshold. Derivatives are never enlarged.
No copyright/date line is visible, and the expansion release date is not
inferred as a printed copyright year. No physical material, edition,
distribution or independent vendor licence is certified. The owner's finite
store, resize and display decision applies only to these exact fronts and
derivatives. Scrydex remains inactive and under review, with no source-wide
licence or activation claim.

The original inspected-source handoff is pinned at
`fabeb68000ad8205ae65614d6352c566af77a4dfb01163d0028a6a92644b7249`, and its
exact 24-target subset at
`ecc90a6b569f49a67f3d7d38059c36a9827db957205effd4ccf7d8e13fa38cf6`.
The immutable archive asset is `641256222`, with 20,461,026 bytes and SHA-256
`9918ceb7090bed46f9c9583468f9ddf016a6de2199a9a2719ed9b6b862283fc4`.
Its exact 100 members comprise 96 images and four metadata files. The safe
downloader checks every member hash and size before extraction and rejects
extra, duplicate, traversing, encrypted, symlink or oversized entries.
Publication performs no provider request.

The protected `artwork-neo4-fronts-production.yml` workflow requires the exact
main revision and `PUBLISH ARTWORK NEO4 FRONTS`, the existing production
environment, and shared production deployment concurrency. It uses the
accepted transaction core, metadata guard and eleven unchanged dependencies.
Both environment rehearsals roll back. Production inserts only journalled new
card-front assets and links; it inserts no source policy. Staging's absent
Scrydex row is a rollback-only provenance fixture. Neither environment has an
existing scoped card image, so no artwork visibility fixture is needed.

The scoped private baselines contain 101 production rows and 99 staging rows:
24 printings, 24 variants, 48 names, one set and two existing set-mark assets,
plus two production links. Every old row is preserved. The existing statement,
lock and connection bounds, immutable storage, failure journals and public
manifest/byte verification remain intact. Native names, HP, pricing, ownership,
schema and permissions are outside this publication. Private snapshots are
excluded from hosted evidence, which must pass a secret scan before upload.

After verified publication, the prepared rollback receipt and SQL can hide
only newly created cohort assets, using exact asset UUID, printing UUID,
content hash and cohort predicates. They retain immutable objects, old assets,
links and source policies. Rollback is prepared and is not executed here.

Run the narrow checks from the repository root with existing dependencies:

```text
node --test tools/artwork-neo4-fronts-push-20261014/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs
python tools/artwork-neo4-fronts-push-20261014/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-neo4-fronts-push-20261014/download-package.py <packages> --archive <frozen-local-zip>
node tools/artwork-neo4-fronts-push-20261014/verify-packages.mjs <packages>
```

`freeze-local.mjs` is an offline helper and is never run by the workflow.
`before-query.sql` contains bounded, read-only constant-array queries for
private before/after evidence. `validation.json` records checks actually run
and file/dependency hashes. Independent review, hosted checks, publication,
current API/image proof and installed-device acceptance are separate gates.
Preparation never establishes live delivery; only the coordinator's final
verified API/image proof may complete the 24 eligible tracker tasks.
