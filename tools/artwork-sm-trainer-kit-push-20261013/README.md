# Sun & Moon Trainer Kit artwork: 30 eligible fronts

This release publishes 30 verified HD fronts from the original 44 saved targets
in EN-CARDS-019 through EN-CARDS-021. Delivery is partial. Fourteen energy fronts
were available only at 253×359 or 320×448 and remain unapproved research files
while sharper exact originals are sought. They are excluded from the archive,
plan and production writes. This release does not claim whole-batch completion.

The saved targets are nonconsecutive references from the Lycanroc and Alolan
Raichu kits. `identity-table.json` separately freezes the exact 30 eligible
printing UUIDs, variants, canonical names/references, source URLs/provider IDs,
observed names, footer numbers/deck symbols and original image hashes/dimensions.
Every publication row must match that table. It cannot expand into a whole deck,
an omitted saved reference or one of the tiny research fronts.

Source `tk10a` maps to canonical `tk-sm-l`; `tk10b` maps to `tk-sm-r`. Actual
English printed faces, numbers out of 30 and the different deck symbols were
checked. Four shared shopping references cover Hau 19/23 and Great Ball 21/25
in both decks. They were excluded from identity. The public-safe
`source-reference-conflicts.json` retains the observed groups and the checked
source-receipt hash. Matching names or shopping IDs cannot justify reuse across
decks; the exact printing/footer/original table remains authoritative.

Three provider text discrepancies are retained as source facts: Zubat 11's
Astonish Psychic cost, Togedemaru 26's Discharge Lightning cost, and Pikachu 29's
printed Spark damage of 20 versus metadata 10. They do not change this supported
front identity, and no canonical text or pricing metadata is repaired here.

The owner authorised sourcing and production delivery without another human
batch review. `approval.json` records the exact 30-front business decision. It
does not assert an independent vendor licence, physical capture or certified
foil. Existing Scrydex stays inactive and under review. Production source
insertion is explicitly rejected; a missing staging fixture exists only in the
rehearsal that rolls back. No provider refresh occurs.

All 30 originals are unmodified 728×1018 PNGs and meet the recorded HD dimensions.
Their grid, search and detail WebPs never enlarge them. The explicit quality
gate rejects either tiny research size even if its table dimensions are changed.
Canonical names, numbers, variants, edition fields and prices stay unchanged.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Public source/object manifest | `e0138457817da8284a56c7764e966d141bf81f622c96c463fdef0f26f0b3b350` |
| `plan.json` | `92df998eae88050520a202f3c68a45c28158dae12e27886ca1464c7d97d856ed` |
| `approval.json` | `8ea05cf12cee82b546dcfe4e39afc685c547af56471004a68a8f6fa413d161f9` |
| `identity-table.json` | `c979669f074cd5d3e51a0dc60807bf7a68621e638c82ba70e343a8828b907324` |
| Source-reference conflict evidence | `cd3d440ecdaa2b201d48f156c6030a26e90419212d450bd5a5bdd8d9bbfefb1c` |
| Release ZIP, 35,408,502 bytes | `be73d17379657b1128eb5f01b9666c53026e0b2289e015ae324f18344d457370` |

Release asset `638165691` belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`. Its 123 exact members contain 30 originals,
90 WebPs and three public-safe metadata files. The downloader streams archive
hashing, buffers at most one image, and rejects duplicates, unsafe paths,
symlinks, altered sizes and altered hashes. Every image is then fully decoded
without database, storage or provider requests.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-sm-trainer-kit-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-sm-trainer-kit-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-sm-trainer-kit-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-sm-trainer-kit-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs this same plan, table and
decision from the hash-pinned public manifest, reference-conflict evidence and
matching saved API bindings. It performs no database or network requests.
Additional eligible fronts need a separate frozen cohort.

## Protected production execution

The route directly reuses the accepted 48-front metadata guard/source resolver
and Stackr's existing immutable transfer/transaction publisher.
`publish.mjs --execute` requires the exact main SHA, a manual GitHub workflow,
both verified database projects and
`STACKR_ARTWORK_SM_TRAINER_KIT_CONFIRMATION=PUBLISH ARTWORK SM TRAINER KIT`.
Set `STACKR_ARTWORK_SM_TRAINER_KIT_PACKAGES` to extracted packages and
`STACKR_ARTWORK_SM_TRAINER_KIT_OUTPUT` to public receipts. The coordinator owns
the protected workflow and shared production concurrency.

The transaction guard preserves all 30 printings, 30 variants, 60 names, two
sets and every scoped existing asset/link/source. It rejects drift or scope
growth before commit, and an idempotent repetition creates nothing. Public
receipts contain hashes/counts, never full private metadata. Optional
`STACKR_ARTWORK_SM_TRAINER_KIT_PRIVATE_OUTPUT` stays outside public receipts and
must remain unset in hosted production. Keep `before-query.sql` output private.

Rollback files are prepared but never executed automatically. They hide only
new asset UUIDs bound to this exact printing/hash/cohort and retain immutable
objects, links, previous artwork and source policies. The coordinator must
verify the configured production card/manifest responses and every served image
before closing any eligible item. The fourteen quality holds remain explicit.
