# English trainer-kit continuation: 35 fronts

This bounded release adds the final five Gyarados Trainer Kit fronts (26–30)
and all thirty Raichu Trainer Kit fronts (1–30), covering the saved
EN-CARDS-016, EN-CARDS-017 and EN-CARDS-018 batches.

It directly reuses the accepted 48-front route's scoped metadata guard, source
resolver and protected configuration checks, and Stackr's existing immutable
storage, paced transfers and serializable transaction publisher. The reused
guard takes this cohort's frozen rows/counts and queries only Scrydex. Earlier
release scopes and source files are unchanged.

The owner authorised sourcing and production delivery without another human
batch review. `approval.json` records that exact business decision. It does not
assert a vendor licence, foil certification or physical capture. Existing
Scrydex policy stays inactive and under review; production source insertion is
explicitly rejected. A missing staging Scrydex fixture exists only in the
rehearsal that rolls back. No provider refresh occurs.

Gyarados source `tk4b` maps to canonical `tk-hs-g`, and Raichu `tk4a` maps to
`tk-hs-r`. Every actual English name, collector footer and deck symbol was
inspected. A provider shopping reference, `88222`, was reused for two different
cards: Gyarados 27 Pokémon Communication and Raichu 27 Pokémon Collector.
Their different names, art, rules and deck symbols resolve the match. That
shopping reference was excluded from identity, and no pricing metadata was
changed. Its source conflict evidence remains explicit in the frozen plan.

All originals remain unmodified 598×823 PNGs, meeting detail resolution at their
actual source dimensions. The three WebP display sizes never enlarge them.
They are below the recorded HD dimensions. Physical corner geometry and foil
are not certified. Canonical names, numbers, variants, edition fields and prices
stay unchanged.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Authoritative public source/object manifest | `a6ab05c2933bd6d06fefef8452b7ab70d4f56f1bad2af7cab9644226d2ba51ec` |
| `plan.json` | `0bc7b51cfd6bde6c878b9b3674751c6c079b5af99d18c3f8c9410eed84f80f45` |
| `approval.json` | `1b8879eb856915a3407ce7970f68aac5e2e60ef2b0ea94e82dce314a3383b28a` |
| Release ZIP, 32,119,253 bytes | `9bcc979f0ddb70dc64544c8cc592667fa19d570a12e295834600e459132ad862` |

Release asset `638107947` belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`. Its 143 exact members contain 35 originals,
105 WebPs and three public-safe metadata files. The downloader streams archive
hashing, buffers at most one image, and rejects unsafe paths, symlinks,
duplicates, wrong sizes and hashes. `verify-packages.mjs` fully decodes all 140
images without database, storage or provider requests.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-trainer-kit35-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-trainer-kit35-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-trainer-kit35-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-trainer-kit35-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs the same frozen plan and
decision from the hash-pinned public manifest and matching saved API bindings.
It performs no database or network requests. Additional rows require their own
bounded cohort and cannot expand this release.

## Protected production execution

`publish.mjs --execute` requires the exact main SHA, a manual GitHub workflow,
both verified database projects and
`STACKR_ARTWORK_TRAINER_KIT35_CONFIRMATION=PUBLISH ARTWORK TRAINER KIT35`. Set
`STACKR_ARTWORK_TRAINER_KIT35_PACKAGES` to extracted packages and
`STACKR_ARTWORK_TRAINER_KIT35_OUTPUT` to public receipts. The coordinator owns
the workflow, protected production environment and shared release concurrency.

The reused transaction guard compares all 35 printings, 35 variants, 70 names,
two sets and every scoped existing asset/link/source. It rejects drift and
scope growth before commit. Only journalled front assets/links and the
rolled-back staging fixture are permitted. An idempotent rerun creates nothing.
Public receipts contain preservation counts/hashes, never full private
metadata. Optional `STACKR_ARTWORK_TRAINER_KIT35_PRIVATE_OUTPUT` must stay outside
public receipts and remain unset in hosted production. Keep any output from
the read-only `before-query.sql` private.

Prepared rollback files hide only new asset UUIDs bound to this exact printing,
immutable hash and cohort. They retain objects, links, previous artwork and
source policies, and never execute automatically. The coordinator must verify
the configured production card/manifest responses and every served image before
closing these batches; preparation or a successful job alone is insufficient.
