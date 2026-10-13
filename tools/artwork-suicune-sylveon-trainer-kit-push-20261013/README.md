# Suicune, Sylveon and Pikachu Libre artwork: 60 verified fronts

This route prepares an exact eligible subset of 60 fronts from the original 62
English targets in EN-CARDS-031 through
EN-CARDS-035: Pikachu Libre 27–30, Suicune 1–29, and Sylveon 1–13,15–30.
Sylveon 14 is absent from the saved inventory; 20 is present. No whole-deck or
whole-batch completion is claimed.

Two source-finish mismatches remain excluded, even with joint row/table
relabelling:

| Printing | Source | Current/source finish |
| --- | --- | --- |
| `20201198-462c-4883-97ed-e828c88a602d` | Pikachu Libre `tk9b-30` | normal / holofoil only |
| `c846ec98-8db7-4532-a2a2-1e6a23eab9fc` | Sylveon `tk6a-30` | normal / holofoil only |

Neither held front was acquired. The source handoff verifies all 60 eligible
originals individually, including actual English body/footer/deck/year, unchanged
728×1018 PNG bytes, hashes, full decodes and current normal bindings. The earlier
16 quality/finish holds remain outside this cohort; 18 named holds remain total.

`saved-targets.json` pins the actual 62 canonical identities. The separately frozen
identity table must match the exact eligible subset, current singleton normal
variants, source aliases, inspected titles, collector numbers, deck symbols,
actual copyright years and original hashes/dimensions. Source `tk9b` maps to
`tk-xy-p`, `tk9a` to `tk-xy-su`, and `tk6a` to `tk-xy-sy`. Actual copyright is
2016 for Pikachu Libre and Suicune and 2014 for Sylveon, observed on the originals
without release-year inference. Observation fields and types remain unchanged.

Suicune 14's Spiral Drain rule prints Pokémon with the accent omitted by provider
transcription. Potion 15 actually prints “Heal 30 damage from 1 of your Pokémon.”;
provider text uses I and drops the period. Separate whole-original rechecks
confirmed both rules, blue Suicune badges, exact 14/30 and 15/30, and copyright 2016.
These source text facts are retained without any canonical metadata repair.

The route reuses accepted48 metadata/source guards and accepted32 immutable
object indexing/archive validation. Original fronts cannot be shared across
printing identities. Repeated display paths must have identical hash, size,
dimensions, role, MIME and artifact identity. Derivatives never enlarge the
original; minimum detail dimensions are 576×800 with actual readability and a
complete printed face/frame. No independent vendor licence, physical capture,
corner certification or certified foil is asserted. Existing Scrydex remains
inactive and under review; production source insertion is rejected. A missing
staging fixture exists only in a rolled-back rehearsal.

`approval.json` records the owner's exact store/resize/display business decision
for these 60 originals and 180 derivative references, without further human batch
review. It grants no source-wide acquisition approval and establishes no
independent vendor licence or physical finish certification.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Public source/object manifest | `def3ac20fdb222217376ae5ad52d1a1fb62bde3e386d68aa34279ae29f8d8279` |
| Checked source handoff | `fc0b7440d9cb64bf0427681ea177136f4cfe0fa0fd3b84339989c6f8e8170161` |
| Exact60 target receipt | `4b57b0a71c3a3497b52f15239460d148d74866f4a60c5cb0b25c85f084b5f61e` |
| `plan.json` | `2a8937ffa6b164728ed295e49a6297687ac4d947a9b600d5c01d25936889b26f` |
| `approval.json` | `366b42ddfc1eb11e200705d3c29362820a3b126bb161afa5758ecbc34e48c1f7` |
| `identity-table.json` | `56f558754257f70c0c94356fb5019fda34fbc35fbad726be0c222d3647bc6c87` |
| ZIP, 56,995,023 bytes | `1f06df02a94f68cdd71115f0144809a95ea05e869a6f556a5f4d7d07d94c87a2` |

Queue `STACKR-EN-FRONTS-20261013-SS060` uses release asset `638434423` from
`tberridge86/Stackr`, tag `artwork-residual-recovery-20260930`. Its 242 exact
members contain 239 unique images and three public-safe metadata files, retaining
all 240 printing/image references. Only Water Energy Suicune 3/5 share the same
96×134 search preview, 2,282 bytes, SHA
`5a3780f97223cf7f9f80dd998e9f19ba2ae9a460823d47c3a73384481e2c3600`.
All originals and full-size detail images remain distinct. No images are altered
to manufacture unique hashes. Archive and expanded bytes are capped at 64 MB.

## Final local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-suicune-sylveon-trainer-kit-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-suicune-sylveon-trainer-kit-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-suicune-sylveon-trainer-kit-push-20261013/publish.test.mjs tools/artwork-trainer-kit-push-20261013/publish.test.mjs
python tools/artwork-suicune-sylveon-trainer-kit-push-20261013/download-package.test.py
```

The offline freezer preserves exact source observations and canonical metadata,
with private local paths removed and receipt hashes retained. The downloader
uses only its own byte-frozen plan, suppresses imported bytecode writes and
reuses the accepted archive path/symlink/size/hash checks. Unique ZIP members
and every printing's four image references are validated separately. No
database, storage or artwork-provider request occurs in local validation.

## Protected production route

`publish.mjs --execute` requires exact-main/manual-workflow/two-project guards
and `STACKR_ARTWORK_SUICUNE_SYLVEON_CONFIRMATION=PUBLISH ARTWORK SUICUNE SYLVEON`.
Packages/public receipts use `STACKR_ARTWORK_SUICUNE_SYLVEON_PACKAGES` and
`STACKR_ARTWORK_SUICUNE_SYLVEON_OUTPUT`. Optional private output remains outside
public artifacts and must stay unset in hosted production. Full before-query
results remain private. The coordinator owns workflows, Git and live operations.

The transaction preserves every scoped printing, variant, name, set and existing
asset/link/source; unexpected changes abort before commit. Reruns create no new
rows. Rollback files hide only newly created exact-cohort assets and retain
immutable objects, links, old artwork and source policies. Configured production
API responses and served image bytes must be verified before items are closed.
