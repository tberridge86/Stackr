# XY Trainer Kit artwork: 53 eligible fronts

This route prepares exactly 53 English fronts from the original 54 saved targets
in EN-CARDS-022 through EN-CARDS-024. Bisharp 30/30, printing
`ecaa0fee-22a2-4cda-82e9-278ec886c7b8`, remains held: its canonical variant is
normal, while Scrydex `tk7b-30` supports only holofoil. It was not downloaded and
is excluded from the archive, plan and production writes. This delivery does
not claim whole-batch completion. The earlier 14 Sun & Moon energy quality holds
also remain outside this route.

`saved-targets.json` fixes the original 54 identities. The separately frozen
`identity-table.json` selects the exact 53 eligible printing UUIDs, singleton
normal variants, source aliases, observed names, collector numbers, deck symbols,
actual copyright years and original image hashes/dimensions. The Bisharp subset
is 1–19 and 21–29; the Latias subset is 1–25. Neither subset authorises the rest
of a deck. Source `tk7b` maps to canonical `tk-xy-b`; `tk8b` maps to
`tk-xy-latia`. Both decks print numbers out of 30. Copyright 2014 and 2015 was
observed on the respective original faces, rather than inferred from release
dates. Energy faces identify their type with a symbol and may simply print
“ENERGY”; their observed titles and Metal, Grass or Psychic symbols are retained
without inventing literal catalogue titles on the face.

Two provider text omissions remain source facts: Bisharp 16 omits Metal Claw,
and Tangrowth 25 omits the Colorless symbol in Grass Knot text. Actual source
fronts were inspected. Shopping references and prices are excluded from
identity. This route changes no canonical names, numbers, text, variants,
edition fields or prices.

All 53 originals are unmodified 728×1018 PNGs. The quality gate requires at
least 576×800, readable names/numbers/symbols and fine print, and a complete
printed face/frame. Three WebP derivatives per front never enlarge the original.
No generated replacement, physical corner certification or certified foil
finish is claimed.

The owner authorised exact artwork sourcing and production delivery without
another human batch review. `approval.json` records that bounded decision.
Independent vendor licence evidence remains unestablished. Existing Scrydex
stays inactive and under review; production source insertion is rejected.
A missing staging source fixture exists only in the rehearsal that rolls back.
No provider refresh occurs.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Public source/object manifest | `be22233ea3bae8bd5aebf882ce2701cf59400f5bac7082aa147cb8ab0d3844f2` |
| Checked source/quality handoff | `a820451e96ed321c6a9cf77856f04782d0a9f07cf818dcee33074a265ce3172d` |
| `plan.json` | `f5b9cbbea6e8b1b4f61d9739d3785abf01439228ca61f9088329aca6fdd7ac9e` |
| `approval.json` | `523c5a76993fa376874f0f6a6503a3dee9c976c53dd233a859482fe1f0331ffe` |
| `identity-table.json` | `11eab0a530e0358407b90e1b66d949d4184005054b91c8e6ffb0cb90dd61c5ab` |
| Release ZIP, 66,689,774 bytes | `ba83ea3accf161a7129370edff9f77697e34295369f3df7ce3efed452b40b262` |

Release asset `638239382` belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`. Its 215 exact members contain 53 originals,
159 WebPs and three public-safe metadata files. The downloader limits archive
and expanded bytes to 96 MB, streams archive hashing, buffers at most one image,
and rejects duplicate/unsafe paths, symlinks, altered sizes and altered hashes.
Every image is then fully decoded without database, storage or provider requests.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-xy-trainer-kit-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-xy-trainer-kit-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-xy-trainer-kit-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-xy-trainer-kit-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs this same plan, table and
decision from the hash-pinned input descriptor, public manifest, actual checked
source observations and matching saved/current API bindings. It rejects the
held printing and source/quality/finish drift. Private delegated inspection paths
are removed while their digests remain. It performs no database or network
requests. Additional eligible fronts require a separate frozen cohort.

## Protected production execution

The route directly reuses the accepted 48-front metadata guard/source resolver
and Stackr's existing immutable transfer/transaction publisher.
`publish.mjs --execute` requires the exact main SHA, a manual GitHub workflow,
both verified database projects and
`STACKR_ARTWORK_XY_TRAINER_KIT_CONFIRMATION=PUBLISH ARTWORK XY TRAINER KIT`.
Set `STACKR_ARTWORK_XY_TRAINER_KIT_PACKAGES` to extracted packages and
`STACKR_ARTWORK_XY_TRAINER_KIT_OUTPUT` to public receipts. The coordinator owns
the protected workflow and shared production concurrency.

The transaction guard preserves all 53 printings, 53 variants, 106 names, two
sets and every scoped existing asset/link/source. It rejects drift or scope
growth before commit; an idempotent repetition creates nothing. Public receipts
contain hashes/counts, never full private metadata. Optional
`STACKR_ARTWORK_XY_TRAINER_KIT_PRIVATE_OUTPUT` stays outside public receipts and
must remain unset in hosted production. Keep `before-query.sql` output private.

Rollback files are prepared but never executed automatically. They hide only
new asset UUIDs bound to this exact printing/hash/cohort, retaining immutable
objects, links, previous artwork and source policies. The coordinator must
verify configured production card/manifest responses and every served image
before closing eligible items. Local validation does not establish publication.
