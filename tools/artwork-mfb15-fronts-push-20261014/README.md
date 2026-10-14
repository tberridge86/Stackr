# Exact My First Battle15 artwork publication

This finite lane publishes fifteen individually inspected, unchanged English
My First Battle fronts and forty-five WebP derivatives. Seven originals meet
720 × 1008 dimensions; eight are detail-only. The accepted catalogue aliases are
2, 3, 4, 10, 12, 13, 14, 15, 18, 19, 20, 21, 22, 28 and 30.

These cards are **unnumbered**. Catalogue aliases and printed National Dex
numbers are separate. Both EN-CARDS-006 and EN-CARDS-007 remain partial: nine
captured candidates with historical holds and ten ambiguous source choices
remain outside this publication. Magikarp29's historical hold observation is
being reconciled; it stays excluded here, without a new crop or language claim.
Original and rejected evidence stays retained.

The pinned source body contains the actual name, language, frame, deck
silhouette, HP, stage/evolution, artist and ordered attacks/cost/damage/effects,
plus the independent TCG Collector and Bulbapedia metadata. Magneton's visible
Dex is `0082`, matching source metadata; numeric Dex82 and internal alias20 remain
distinct. Independent review corrected the earlier observation `082`. The v1
source, package and code receipts remain preserved; this v2 package reuses all
sixty image bytes unchanged. The retained inline Lightning glyph resolves an
earlier plain-text HTML extraction omission. No card metadata is repaired.

The owner attests permission from the supplied sites. Per-file TCG Collector or
artist links and image-specific fair-use statements stay in source evidence.
Voltorb's file description supplies an official-database fair-use tag and no
separate attribution link; its empty attribution array is preserved. A generic
site-footer licence is not treated as an artwork licence. Independent vendor or
underlying copyright licence, physical edition/finish verification and
source-wide approval remain false.

The only new provenance is one inactive `under_review`, attribution-required
`bulbapedia` row. Existing full source rows, canonical data, variants, set artwork
and links must survive byte-for-byte. Staging's temporary source rows and image
metadata are inside rollback rehearsal. The production rehearsal also rolls
back before the immutable objects and exact artwork rows are published.

The protected manual workflow requires exact main SHA, dedicated confirmation
`PUBLISH ARTWORK MFB15 FRONTS`, production environment and shared deployment
concurrency. It checks all sixty full images before opening a database, retains
failure journals, verifies the public manifest/bytes and prepares scoped rollback
receipts/SQL. It does not deploy the application or alter source-wide policies.
Root additionally verifies the configured API and four served files per card;
preparation and hosted publication do not establish installed-device delivery.

Offline checks from the repository root:

```text
node --test tools/artwork-mfb15-fronts-push-20261014/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs
python tools/artwork-mfb15-fronts-push-20261014/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-mfb15-fronts-push-20261014/download-package.py PACKAGE_ROOT --archive LOCAL_FROZEN_ZIP
node tools/artwork-mfb15-fronts-push-20261014/verify-packages.mjs PACKAGE_ROOT
```

`freeze-local.mjs` only projects pinned local evidence and is never a workflow
step. The package has exactly sixty image members and four frozen metadata
members. Full private before/after rows remain outside public artifacts.
