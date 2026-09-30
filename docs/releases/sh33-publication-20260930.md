# SH33 exact artwork and printed-denominator repair

**Completed:** [production run 36773609955](https://github.com/tberridge86/Stackr/actions/runs/36773609955) published all 33 fronts and 99 derivatives and corrected the printed denominator to 53. Independent checks passed for all 33 card responses and 132 image files. All 59 printing identities and production's separate `total: 78` were preserved. The normal public set endpoint now returns `printedTotal: 53`. See the [production receipt](sh33-production-receipt-20260930.json) and [combined completion evidence](artwork278-completion-20260930.md). The preparation narrative below is historical.

The official Traditional Chinese Family Pokémon Card Game (`SH`) checklist
contains collectors 001/053 through 053/053 and six separately named energies.
Stackr's current `printed_total` is 38. This is a verified denominator error;
the existing 59 card identities remain valid and must be preserved.

This bounded release changes only `catalog.sets.printed_total` from 38 to 53
for set `929a6c13-5b43-4aba-b887-1f86cc94ce31` and publishes the 33 missing
official fronts for collectors 021–053, with 99 standard display derivatives.
The existing `total` differs between environments (staging 59, production 78).
It is preserved and remains a separate metadata discrepancy to investigate.

The [verified package](https://github.com/tberridge86/Stackr/releases/download/artwork-residual-recovery-20260930/stackr-sh33-review-20260930.zip)
contains original fronts, official identity pages, checklist evidence, proposed
correction, derivatives and per-file checksums. Archive SHA-256:
`628a56f3502eae5ee92d1f0ef6cb233b74cea4c428ea8a671b90eb7085fe8170`,
8,145,770 bytes. GitHub asset 601723494 was independently downloaded, verified
and extracted; all 132 image objects were rehashed and decoded. The frozen
cohort SHA-256 is
`5371389f17e55296787b644338db0893944f1812e1db89a38666f458b1a7f598`.

## Publication boundary

The existing protected production publisher performs the correction inside
each rollback rehearsal and the final artwork transaction. The correction
requires the exact set/version, snapshots all 59 printing identities before
and after, preserves every other set field (apart from the update timestamp),
and accepts an already-correct denominator idempotently. If binding or artwork
publication fails, the correction rolls back with it. Existing artwork,
prices, holdings and source activation are unchanged.

The frozen cohort is disjoint from the earlier 7,911, English49, TW200 and
English45 plans. The general platform deployment job cannot run for this
scope. No backend, gateway or mobile release is included.

Status at preparation: **33 fronts prepared, not published**. Successful
production receipt and independent API/image verification are required before
subtracting these cases from the remaining artwork register.

[Official checklist evidence](artwork4201-evidence/sh-official-checklist-20260930.md),
[frozen approval](../../tools/sh33-publish-20260930/approval.json), and
[frozen plan](../../tools/sh33-publish-20260930/plan-receipt.json).
