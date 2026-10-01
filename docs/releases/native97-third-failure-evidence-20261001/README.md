# Native97 third protected-publication failure — 2026-10-01

This directory preserves the exact evidence for [run 36878902269](https://github.com/tberridge86/Stackr/actions/runs/36878902269), revision `31f8c1cc5be68772f9a286bd76c25e06e53c5c3d`. It is a failure record, not a publication receipt.

The run stopped before publication after a public-object read returned HTTP 429. It checked 42 objects, verified or reused 41, and created 0 new objects. It made 0 asset, link, metadata, ownership, or pricing writes. The 114 immutable objects created during the first attempt remain retained.

`receipt.json` is the raw downloaded artifact member: 147,649 bytes and SHA-256 `d956156076744f0a5feac52b0647d3f4dfa043abc1dec7650edb7b8586f93c6c`. `receipt-artifact-download.json` binds it to GitHub artifact 11171171508, whose ZIP SHA-256 is `42515c488e5bb26e9cafca3416068af2aa206ec95d63381cb4e4a1014caec2be`.

The directory contains both preparation and post-failure snapshots as gzip files. The adjacent machine-readable evidence records each compressed-file SHA-256, each uncompressed snapshot SHA-256, and byte count. Each environment has 97 bound rows and 0 changed rows in the deep row-by-row comparison.

The one later HTTP 200 WebP read in `public-object-rate-limit-readback.json` only shows that one retained object became readable. It is not evidence for a blind rerun.
