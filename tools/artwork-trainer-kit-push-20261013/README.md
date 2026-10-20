# English trainer-kit artwork: 48 fronts

This bounded release adds eleven Diamond & Pearl Lucario Trainer Kit fronts,
twelve Manaphy Trainer Kit fronts and the first twenty-five HeartGold &
SoulSilver Gyarados Trainer Kit fronts. These are the saved EN-CARDS-013,
EN-CARDS-014 and EN-CARDS-015 batches. Gyarados references 26–30 belong to the
next batch and remain outside this release.

The route reuses Stackr's reviewed immutable storage, paced transfers and
serializable transaction publisher. It also reuses the earlier binding,
source-policy and preservation comparison helpers, with a local snapshot reader
scoped only to the 48 printings and Scrydex. Earlier cohorts are unchanged.

The owner authorised internet sourcing and production delivery without another
human batch review. `approval.json` records that exact business decision; it
does not assert an independently issued vendor licence or certify foil. Existing
Scrydex remains inactive and under review. Production source insertion is
explicitly rejected. The missing staging Scrydex fixture exists only inside a
rehearsal that rolls back. No provider refresh occurs.

The source uses different set identifiers from Stackr: Lucario `tk3b` maps to
`tk-dp-l`, Manaphy `tk3a` to `tk-dp-m`, and Gyarados `tk4b` to `tk-hs-g`. Actual
English names, printed numerators, denominators (11, 12 and 30) and deck symbols
were inspected on every original. The saved metadata hashes and collector-alias
evidence remain attached. Canonical names, collector numbers, variants, edition
fields and prices are unchanged. All originals are unmodified 598×823 PNGs;
their three WebP display files never enlarge them. These fronts meet detail
resolution at their actual source dimensions; HD dimensions and physical corner
geometry are not certified.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Authoritative public source/object manifest | `01acf8a1962ece4abe50b4f5e72b4d26422d0f56bc9c048143d11e88d3fd7035` |
| `plan.json` | `3bcd61083e3be105e2cb1480d4e5ae7d3d64199fc287a05de372be8c25e5d4fb` |
| `approval.json` | `fc62fbe643b43d1c94029a0f6cd5da525d10c893c957d4c8ebcc4a0383bf8647` |
| Release ZIP, 42,961,975 bytes | `ef56173edc2e4a097b9115d0a76284393b1f07a0c9e7f81d18e5ef116a920471` |

Release asset `638073079` belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`. Its 195 exact members contain 48 originals,
144 WebPs and three public-safe preparation/binding metadata files. Archive
hashing is streamed and extraction buffers at most one image. The downloader
rejects duplicates, unsafe paths, symlinks, altered sizes and altered hashes.
Every image is then fully decoded by `verify-packages.mjs` without database,
storage or provider requests.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-trainer-kit-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-trainer-kit-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-trainer-kit-push-20261013/publish.test.mjs tools/artwork-followup-push-20261013/publish.test.mjs
python tools/artwork-trainer-kit-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs this same frozen plan and
decision from the hash-pinned public manifest and matching saved API bindings.
It performs no database or network requests. Additional source rows require a
separate bounded cohort; they cannot expand this release.

## Protected production execution

`publish.mjs --execute` requires the exact main SHA, a manual GitHub workflow,
both verified database projects and
`STACKR_ARTWORK_TRAINER_KIT_CONFIRMATION=PUBLISH ARTWORK TRAINER KIT`. Set
`STACKR_ARTWORK_TRAINER_KIT_PACKAGES` to the extracted package root and
`STACKR_ARTWORK_TRAINER_KIT_OUTPUT` to public receipts. The coordinator owns the
protected production workflow and shares existing release concurrency.

The transaction guard compares all 48 printings, 48 variants, 96 names, three
sets and every scoped existing asset/link/source. It rejects unexpected changes
or scope growth before commit. Only journalled front assets/links and the
rolled-back staging provenance fixture are permitted. An idempotent rerun creates
nothing. Public receipts contain preservation counts and hashes, never full
private metadata. Optional `STACKR_ARTWORK_TRAINER_KIT_PRIVATE_OUTPUT` must stay
outside public receipts and remain unset in hosted production. Keep any
`before-query.sql` output private.

Prepared rollback files hide only new asset UUIDs bound to this printing/hash/
cohort, and retain immutable files, links, previous artwork and provenance. They
are not executed automatically. Before closing a batch, the coordinator must
independently verify the configured production card/manifest responses and all
served image bytes; a prepared archive or successful job alone is insufficient.
