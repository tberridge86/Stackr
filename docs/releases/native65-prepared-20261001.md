# 65 reviewed fronts and 53 precise native-name corrections

Prepared, not yet published. This batch contains **58 Japanese and seven Korean fronts**, with **195 derivative references / 260 unique image files**. It is a strict subset of the [3,449 remaining cases](artwork3449-exceptions-20261001.json.gz), disjoint from all eight completed recovery cohorts.

## Why 53 names need correction

Root independently read each card face and collector number. **46 Japanese and seven Korean saved native names disagree with their exact card fronts**. Examples: E1/062 says マルチワザマシン01; E2/089 says 無人変電所; the seven Korean conflicts are SV4K 091/092, SV4M 091/092 and SV5K 090/091/092. The [frozen correction plan](../../tools/native65-publish-20261001/native-name-corrections.json) contains every old/new name, printing ID, language, set, collector, image checksum and native search-name row ID in both databases. Twelve other fronts require no metadata change; E2/009 retains its explicitly accepted collector suffix.

The existing publisher now supports this bounded correction inside the same serializable transaction as artwork association. It locks each printing and all its name rows, verifies exact old or already-repaired state, updates only the printing's native name and its existing native search name/normalization, and compares all other columns and aliases afterward. Exactly 53 printing names and 53 corresponding search-name rows may change. Existing card/variant IDs, aliases, prices, holdings and existing artwork are preserved. The immutable image files may upload before the final transaction; files uploaded and cards published remain separate counts.

## Preserved files and review evidence

- [65-front archive](https://github.com/tberridge86/Stackr/releases/download/artwork-residual-recovery-20260930/stackr-native65-reviewed-20261001.zip): **16,416,458 bytes**, SHA-256 **`d45475488fb64603bb15abc3ed9c68a9de65672a18d16d1cfecd96d5c1b0dd7b`**, release asset **602279940**. Downloaded again from GitHub, digest verified, safely extracted, then all 260 images independently hash/format/dimension/decode checked.
- Frozen cohort SHA-256: **`618b3edb22c5511a665a4adbcd7ed1ec4f2bf549fb340124173fd8ad499838f9`**.
- Frozen 53-correction JSON SHA-256: **`f0b49a4bcd9c70e3127ab342f5c57074d99492f1795a46ccbff81b054cc7e9a9`**.
- [Complete 65-card pre-publication records in both environments, plus plan and archive verification](native65-before-evidence-20261001.json.gz), compressed evidence SHA-256 **`f7219118e83a2efb1f97443864c8a276507bc69adfc8f2fac564effc1ecfaa88`**. Fresh readbacks confirm all names are still in their reviewed old state. No metadata writes have occurred during preparation.

No images were reacquired. Existing originals and source watermarks are preserved. Both provenance sources remain inactive and under review; per-cohort owner permission is retained. This is printing-front artwork, without a new exact-finish or recognition claim.

## Validation and publication boundary

**59 focused tests passed**, covering fixed cohort membership and visual evidence, wrong source/name/number/file rejection, exact native-name row identity in each environment, idempotence, preservation of aliases and unrelated columns, rollback after later artwork failure, prior SH33 behavior and protected-workflow isolation. Deployment-tooling checks passed. A read-only production EXPLAIN confirmed the separate native-name lock query parses against the actual schema; it currently uses a sequential scan, which is retained without an unrelated schema/index change.

The new native65 scope uses the existing protected production workflow. Both staging and production rehearsals must roll back successfully before immutable uploads and the final atomic production publication. No app/API deployment, migration, source activation or broad release flag is enabled. Completion requires the final downloaded receipt, independent 65-card/260-file public verification and a fresh preservation readback. The separate checklists, logos, pricing and phone gates are unchanged.
