# English artwork follow-up: 57 fronts

This bounded release adds the missing fronts in EN-CARDS-008 through
EN-CARDS-012: one Ancient Mew, 27 Pokémon TCG Pocket Promo-A fronts, 24 Scarlet &
Violet Energy fronts and five Scarlet & Violet promos. It reuses the reviewed
immutable storage, paced transfers and serializable transaction publisher.
The earlier ten-front release is unchanged.

The owner authorised internet sourcing and production delivery without another
human batch review. `approval.json` freezes that exact business decision. It
does not assert an independently issued source licence or certify physical
foil. Existing Scrydex policy remains inactive and under review. The only new
production provenance record is Limitless TCG, also inactive and under review,
with notes restricted to these 27 Pocket fronts. Missing staging source fixtures
exist only inside a rehearsal that rolls back. No provider refresh occurs.

Ancient Mew's international Nintendo/Wizards/2000-style source face is bound
to the existing singleton English printing by the explicitly recorded source
inference. Its runes and unprinted catalogue number remain explicit; no canonical
edition is invented. Pocket collector references are bound by exact saved source
pages and observed image URLs, rather than a physical card footer. SVE and SVP
fronts retain their observed English set and collector footers and distinct
portraits/backgrounds. Names, numbers, variants, edition fields and prices are
unchanged. All originals remain unmodified and all derivatives avoid enlargement.
Twenty-one originals meet the recorded HD dimensions; 36 meet detail resolution
at their actual smaller source dimensions.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Authoritative public source/object manifest | `5a806a662c540a79090e91e76143ea143f03d5dafb7299d91fea4d9832df7d59` |
| `plan.json` | `1cf5f02c64dcdda97e5e3fffbaf053e467d3fed554d416750f854cf6acea5e81` |
| `approval.json` | `8775125627e8e5bcaac94fc5b06e950a10e5eeaac87b3f09eb3e86d6fa7922c8` |
| Release ZIP, 53,091,723 bytes | `af5cd84113f391caffa0383aab60163820cbc06c56d7bad02f4cadfca015dcaa` |

Release asset `638042830` belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`. Its exact 231 members contain 57 originals,
171 WebPs and three public-safe acquisition/preparation metadata files. The
downloader validates the archive digest and sizes, rejects unsafe extraction
paths, duplicates and symlinks, and checks all image hashes before extraction.
It streams archive hashing and buffers at most one image. `verify-packages.mjs`
fully decodes every image without database, storage or provider requests.

## Local checks

Run from the repository root, with installed dependencies:

```powershell
python tools/artwork-followup-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-followup-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-followup-push-20261013/publish.test.mjs tools/artwork-next-push-20261013/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork-vs1-native97-20261012/publish.test.mjs
python tools/artwork-followup-push-20261013/download-package.test.py
```

`freeze-local.mjs <handoff-directory>` reconstructs this same frozen plan and
decision from the hash-pinned public manifest and matching saved API bindings.
It performs no database or network requests. Newly sourced rows cannot be added
to this cohort; they require their own scoped preparation.

## Protected production execution

`publish.mjs --execute` requires a manual GitHub workflow on the exact main SHA,
the staging and production database projects, and
`STACKR_ARTWORK_FOLLOWUP_CONFIRMATION=PUBLISH ARTWORK FOLLOWUP`. Set
`STACKR_ARTWORK_FOLLOWUP_PACKAGES` to the extracted package root and
`STACKR_ARTWORK_FOLLOWUP_OUTPUT` to the public receipt folder. The root-owned
workflow uses the existing protected production environment and shared release
concurrency. It must upload only public receipts, never private before images.

The in-transaction guard retains full before/after images in memory, compares
all 57 printings, 81 variants, 162 names, four sets and every scoped existing
asset/link/source, and rejects drift before commit. It permits only journalled
artwork inserts and the exact planned inactive source records. Sentinel limits
reject unexpected scope growth. Idempotent repetition creates nothing new.

Public receipts contain counts and hashes. Optional
`STACKR_ARTWORK_FOLLOWUP_PRIVATE_OUTPUT` writes raw metadata only to a separate
private location outside public receipts; hosted production should leave it
unset. `before-query.sql` is read-only and returns private scoped metadata for
independent local verification. Preserve its output privately.

After publication, `rollback-receipt.json` and `rollback.sql` are prepared,
never executed automatically. They bind only new asset UUIDs, printing IDs,
immutable source hashes and this cohort, and hide those assets without deleting
objects, links, earlier artwork or inactive provenance. A successful job alone
does not establish the actual app journey: the coordinator must independently
verify the configured production card/manifest responses and every served image
before closing any batch.
