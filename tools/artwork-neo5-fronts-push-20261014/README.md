# Japanese Neo1 batch five artwork

This publisher freezes 22 individually inspected Japanese Scrydex fronts from
`JP-CARDS-005`, catalogue aliases `051`–`072`. The fixed batch has 25 tasks.
Trainer aliases `073`–`075` lack exact canonical-to-source identity evidence and
remain excluded. Whole-batch completion is false.

Each exact printing, singleton variant, source URL, original hash, printed name
and National Dex number is retained. Aliases are separate from printed Dex
numbers: Sudowoodo alias `051` has printed `No.185`. Eighteen current native
labels differ from the inspected printed names. Current labels remain unchanged;
their correction proposals remain separate evidence. Production uses Japanese
version `1a23b7a7-c50e-4601-9180-a25c950d27ea`; staging uses
`d560cd01-de2a-4713-9518-b967fb4c5ac9`. The catalogue version is their sole
binding difference. Exact metadata scope is 18 normal and four holo variants.

All originals are unchanged `image/webp`, 567–570 pixels wide, fully decoded and
readable at the detail minimum. All 22 fall below the HD threshold. The accepted
Sharp 0.35.5 pipeline creates 240px/Q82 grid, 96px/Q78 search and at-most-720px/Q86
detail derivatives without enlargement. The unchanged pipeline hash is
`642eb05d57c921901cfa6241e1f0d32a71da602ea3594693b8d63247a05b0bb0`.

Body evidence preserves actual artist, stage, ordered costs, damage columns,
attack names and observed effects. Donphan `054` has no separate numeric damage
glyph for Flail; the actual body prints its own-damage-counter ×10 formula.
Scrydex's `10×` damage field and TCGdex's null remain separate from the observed
null column. Only this exact printing, original hash, source metadata hash and
attack hash can use that formula witness. Cleffa `070` retains the visible Baby
rule box as an explicitly labelled paraphrase where provider `rules` is empty.
Clefairy `063` retains observed `おうふくビンタ` separately from the source's
`おうふくびんた`. Printed holo rarity stars remain separate from provider `★H`
conventions and rendered foil-like backgrounds. Physical material, finish,
edition and distribution are uncertified. No copyright/date line was observed;
no copyright year is inferred.

The new exact owner decision is pinned independently at
`f795788f88483f5be7cc8403b8a353f38e23a91416dd60d5c3f8da526f0f7e6d`.
The separate local reader recovery decision is
`f4b732955ec07b9f0544cdf9cff255d1a2c01225efc72cdb50f2173a2b6d55b8`.
The original nine local-reader failure receipts remain unchanged. The completed
source handoff records 31 requests including those nine failures, 13 first
requests and nine controlled single recovery requests; no automatic network
retry, redirect, access denial or rate limit. Failed-request HTTP 200 evidence is
control-flow evidence, not retained headers, and was not backfilled. The frozen
source handoff hash is
`aae43f61c4ec4e402dedb589478aff839d8a700480d4b70406fa50c0876d37c9`.
Scrydex's provided-image application/local-hosting documentation is retained in
the finite decision metadata. Independent vendor licence and source-wide
approval remain false; Scrydex remains inactive and under review.

Immutable release asset `641447526` contains
`stackr-ja-artwork-neo-card-fronts22-20261014.zip`, 11,890,305 bytes, SHA-256
`748d784ec52b09b818095d8504faa1e14433a12aafdc8272efbc8ed8f17281f7`.
Its exact 92 members comprise 22 originals, 66 derivatives and four metadata
files. The downloader checks all hashes and sizes and rejects duplicate, extra,
traversing, encrypted, symlink and oversized entries. Publication makes no
artwork-provider requests.

The protected `artwork-neo5-fronts-production.yml` workflow requires the exact
main revision, `PUBLISH ARTWORK NEO5 FRONTS`, the production environment and
shared production deployment concurrency. It reuses the accepted transaction
core, source resolver and metadata guard with eleven unchanged dependencies.
Staging and production rehearsals roll back. The private full baselines contain
94 production rows and 91 staging rows: 22 printings, 22 variants, 44 names,
one set, two immutable set marks, two production links and one production source.
No scoped card image exists. Staging's single missing Scrydex row is a
rollback-only source fixture; no artwork visibility fixture is required.

Production inserts only journalled new card-front assets and links. All existing
metadata, set marks, links and source policy rows remain. Existing request,
connection, statement and lock bounds, immutable storage, failure journals and
public manifest/byte verification are retained. Pricing, ownership, native-name
repairs, schema and permissions are outside this publisher. Private snapshots
stay outside hosted evidence; a secret scan must succeed before artifact upload.

After verified publication, prepared rollback receipts and SQL can hide only
newly created cohort assets with exact asset UUID, printing UUID, content hash
and cohort predicates. Immutable objects, predecessor assets, links and source
policies remain. Rollback is prepared, not executed.

Run the focused checks from the repository root with existing dependencies:

```text
node --test tools/artwork-neo5-fronts-push-20261014/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs
python tools/artwork-neo5-fronts-push-20261014/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-neo5-fronts-push-20261014/download-package.py <packages> --archive <frozen-local-zip>
node tools/artwork-neo5-fronts-push-20261014/verify-packages.mjs <packages>
```

`freeze-local.mjs` is offline and is never invoked by the production workflow.
`before-query.sql` contains bounded read-only evidence queries.
`validation.json` records actual checks and dependency/file hashes. Independent
review, hosted checks, production publication, current API/image proof and
installed-device acceptance remain separate delivery evidence.
