# Japanese Neo1 artwork publication

This artwork-only release contains exactly 25 inspected Japanese Neo1 card
fronts from fixed batch `JP-CARDS-003`, plus 75 display derivatives. It is
prepared locally; preparation and a successful workflow do not establish live
app delivery. The release owner must verify the current API response and every
returned image before completing any tracker entries.

## Exact identity and quality

The immutable source manifest, saved fixed targets, per-printing identity table,
plan, owner decision and hosted archive are pinned by SHA-256. Every row binds
the existing printing UUID, variant UUID, current native label, canonical
collector alias, observed Scrydex ID and original image hash.

Japanese National Dex numbers printed on these cards are separate from the
catalogue aliases: for example, catalogue `001` is inspected Oddish `No.043`.
Provider IDs are frozen observations, not calculated from those printed
numbers. Nineteen existing native labels have retained defects. The verified
printed Japanese names are separate cross-references; this publisher performs
no native-name or other catalogue correction.

The exact current variants are 20 normal and five holo in both environments.
Only the Japanese catalogue version differs: production
`1a23b7a7-c50e-4601-9180-a25c950d27ea` and accepted legacy staging
`d560cd01-de2a-4713-9518-b967fb4c5ac9`. These are source-supported metadata
bindings, not certificates of the physical material or foil.

All originals are unmodified, readable detail images between 565 and 570 pixels
wide, below the 720-pixel HD threshold. No derivative is enlarged. Whole frames,
names, National Dex numbers and fine print were inspected. No copyright or date
line is visible; no copyright year is inferred from the expansion release date.
No physical edition, distribution, finish or independent vendor licence is
certified.

The finite owner store/resize/display decision applies to these exact 25 fronts
and 75 derivatives. Scrydex remains inactive and under review; no source-wide
licence or activation is asserted. Initial inspected-source receipts are
`e49d2affec749802d3c4e70b889d6b8815fe35750ab5ef7204a0949d4896d844`
and `8f780164af244de5af8e8a5df1bc14ed157f4fdccff87aead2184505f072f105`.

## Existing publication path and preservation

The protected `artwork-neo-fronts-production.yml` workflow requires the exact
main revision and `PUBLISH ARTWORK NEO FRONTS`, uses the existing production
environment and shared production deployment concurrency, and publishes only
artwork. It retrieves immutable GitHub release asset `639568745`: 21,448,691
bytes, SHA-256
`ee849164f5f744038105d95c3fbbfc9774068b2488e5f4678398a383bf5da5e9`.
Its exact 104 members are 100 images and four metadata files. The downloader
rejects extra, duplicate, traversing, encrypted, symlink, oversized or altered
members and checks every image and all four metadata files before extraction.
No provider request occurs during publication.

The accepted transaction core and metadata guard remain unchanged. They reread
and lock all scoped printing, variant, name, set, asset, link and source fields;
check the current API card bindings; and allow only journalled new card assets
and links. Production already has two immutable set assets and two links;
staging has the same two assets with no links. No existing card front is visible
in either baseline, so this batch has no staging artwork visibility fixture.
Staging's absent Scrydex provenance row is inserted only in its rollback
rehearsal. Existing source policies and all old assets and links remain intact.

The existing core rehearses both environments with serializable transactions,
always rolls back rehearsals, verifies all package bytes before upload, uses
immutable storage, persists failure journals and confirms the current manifest
and public image bytes. It retains its existing connection, statement and lock
timeouts. Production source insertion, pricing, ownership, native names,
permissions and schema are outside this publisher.

After successful verified publication, a receipt and prepared SQL can hide only
this cohort's newly created assets using exact UUID, printing, asset identity,
content hash and cohort hash predicates. They retain immutable objects, links,
previous assets and provenance. Rollback is prepared, not automatically run.
Raw before/after snapshots remain private; hosted artifacts are scanned for
secrets before upload, and private output is unset in the hosted workflow.

## Offline checks

Run from the repository root, using existing locked dependencies:

```text
node --test tools/artwork-neo-fronts-push-20261014/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
node --test tools/artwork-neo-fronts-push-20261014/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs
python tools/artwork-neo-fronts-push-20261014/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-neo-fronts-push-20261014/download-package.py <packages> --archive <frozen-local-zip>
node tools/artwork-neo-fronts-push-20261014/verify-packages.mjs <packages>
```

`freeze-local.mjs` regenerates the pinned public plan from the retained exact
manifest, package receipt and private current binding/baseline files. It is an
offline coordinator helper and is never called by the protected workflow.
`before-query.sql` contains separate bounded read-only constant-array queries
for private before/after evidence, rather than a combined catalogue CTE.

The local validation receipt records actual results and file/dependency hashes.
Independent review, hosted checks, merge, production publication, current live
API/image proof and installed-device acceptance remain separate delivery gates.
