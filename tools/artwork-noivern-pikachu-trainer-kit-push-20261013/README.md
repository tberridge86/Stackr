# Noivern and Pikachu Libre Trainer Kit artwork: 52 verified fronts

This route prepares 52 verified English fronts from the original 53 saved targets
in EN-CARDS-028 through EN-CARDS-030. Delivery is partial. The original references are nonconsecutive:
Noivern 1–11,13–22,24–30 and Pikachu Libre 1–23,25–26. This release cannot expand
into either whole deck or claim whole-batch completion.

Noivern 30/30, printing `d89afd62-12a3-4e5e-80bb-31424367afa9`, remains held:
the canonical variant is normal, while exact Scrydex `tk6b-30` supports only
holofoil. It was not downloaded and is excluded from approval and publication,
even if a row and identity table are relabelled together. The earlier Bisharp
finish hold and 14 Sun & Moon energy quality holds remain outside this route.
Corrected Rhyhorn inspection history belongs to the separately frozen Latios
release; this route changes no prior evidence.

`saved-targets.json` fixes all 53 original identities. The separately frozen
`identity-table.json` selects only the eligible printing UUIDs, singleton normal
variants, source aliases, inspected titles, collector references, deck symbols,
actual copyright years and original hashes/dimensions. It also pins each full
actual pixel-observation object, including printed attacks/rules. Source `tk6b`
maps to canonical `tk-xy-n`; `tk9b` maps to `tk-xy-p`. Actual copyright is 2014
on these Noivern fronts and 2016 on Pikachu Libre. Footer/deck/year facts come
from original inspection, never release-year inference.

Professor’s Letter 24 keeps its canonical curly apostrophe and current identity;
the provider calls it Professor's Letter. The actual printed title is recorded
as Professor’s Letter, and both observations are retained as source facts. Energy type symbols likewise
remain distinct from catalogue titles. No native name, number, text, variant,
finish, edition field or price is rewritten. Shopping references are excluded
from identity.

Noivern 13's Sonic Bazooka symbols appear Psychic/Darkness/Colorless; provider
metadata orders them Darkness/Psychic/Colorless. Required symbols and counts are
equal. Pikachu Libre Potion 21 actually prints “Heal 30 damage from 1 of your
Pokémon.”; the provider transcribes the quantity as I and drops the final period.
A separate full-original recheck confirmed the printed rule. These facts remain
in the evidence without a card hold or canonical metadata repair.

All 52 originals are unmodified 728×1018 PNGs. The quality gate requires an
original at least 576×800, readable names/numbers/symbols and fine print, and a
complete printed face/frame. Three WebP derivatives
per front never enlarge the original. Immutable display paths may deduplicate
only when their hash, size, dimensions, role, MIME and artifact identity agree;
originals cannot be shared across printing identities. No generated replacement,
physical corner certification or certified foil is asserted.

The owner authorised exact artwork sourcing and production delivery without
another human batch review. The frozen `approval.json` records that bounded
decision. Independent vendor licence evidence remains unestablished. Existing
Scrydex stays inactive and under review; production source insertion is rejected.
A missing staging source fixture exists only in the rehearsal that rolls back.
No provider refresh or canonical metadata/pricing repair occurs.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Public source/object manifest | `d7d4f740e7018fe71c636c66e3eb701657c5a1150adddec020c5c2d6d8cd5a2a` |
| Checked source handoff | `02c279a22cf014d713ec17e82f3a00a8acd5614bba8990f617a2b36a951dac67` |
| `plan.json` | `f352c01af18d9f11695ec40f5f62db4d391f321d769508d5dd95de9e96dd8ac5` |
| `approval.json` | `5e8310541c8cb081888dbe5a2f4874417c904fdd1350e816f70e3e0b311cb4f4` |
| `identity-table.json` | `24a14c29827f592e2f9c726e4756c9eb93c9158c6adbec2ff1c96ebf14814cab` |
| Release ZIP, 50,267,364 bytes | `940d42afa6d371dd94da7cc42a0276f40f50f3297f6556174d2e68fc6a0c4656` |

Queue `STACKR-EN-FRONTS-20261013-NP052` uses release asset `638364582`, repository
`tberridge86/Stackr`, tag `artwork-residual-recovery-20260930`. The exact ZIP has
209 members: 206 unique images and three public-safe metadata files. Every one
of the 208 per-printing image references remains validated.

Two pairs share only the same 96-pixel-wide search image:

| Printing pair | Search SHA-256 |
| --- | --- |
| Noivern Darkness Energy 26/28 | `f21eedba6a685103f4cef8a613c3b564cffd711455aaa6885ce80d90ccdb6437` |
| Pikachu Libre Lightning Energy 3/5 | `f56d701d4ad33462ff0f4b7fe94b0308f072f3b15955468c70ac6eae07d0280b` |

All 52 original hashes and full-size detail images remain distinct. No images
were altered to manufacture unique hashes, and original fronts are never reused.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-noivern-pikachu-trainer-kit-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-noivern-pikachu-trainer-kit-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-noivern-pikachu-trainer-kit-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-noivern-pikachu-trainer-kit-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs this same plan, table and
decision from the hash-pinned descriptor, public manifest, actual checked
source observations and matching saved/current API bindings. It rejects the
held printing and identity/quality/finish drift, without database or network
requests. Additional fronts require a separate frozen cohort.

The downloader reuses the accepted Latios32 archive validators/extractor and
suppresses imported bytecode writes. It passes only this cohort's byte-frozen
plan, limits archive/expanded bytes to 64 MB, streams archive hashing and buffers
at most one image. It rejects duplicate ZIP members, unsafe paths, symlinks and
altered sizes/hashes. Every unique image is fully decoded and every printing's
four bindings validated without database, storage or provider requests.

## Protected production execution

The route reuses accepted48 metadata/source guards, accepted32 immutable object
indexing and Stackr's existing immutable transfer/transaction publisher.
`publish.mjs --execute` requires the exact main SHA, a manual GitHub workflow,
both verified database projects and
`STACKR_ARTWORK_NOIVERN_PIKACHU_CONFIRMATION=PUBLISH ARTWORK NOIVERN PIKACHU`.
Set `STACKR_ARTWORK_NOIVERN_PIKACHU_PACKAGES` to extracted packages and
`STACKR_ARTWORK_NOIVERN_PIKACHU_OUTPUT` to public receipts. The coordinator owns
the protected workflow and shared production concurrency.

The guard preserves all 52 printings, 52 normal variants, 104 names, two sets and every existing
asset/link/source. It rejects drift or scope growth before commit; an idempotent
repetition creates nothing. Public receipts contain hashes/counts, never full
private metadata. Optional `STACKR_ARTWORK_NOIVERN_PIKACHU_PRIVATE_OUTPUT` stays
outside public receipts and must remain unset in hosted production.
Keep `before-query.sql` output private.

Rollback files are prepared but never executed automatically. They hide only
new asset UUIDs bound to this exact printing/hash/cohort, retaining immutable
objects, links, previous artwork and source policies. The coordinator must
verify configured production card/manifest responses and every served image
before closing eligible items. Local validation does not establish publication.
