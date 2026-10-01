# 84 Japanese Mysterious Mountains fronts published and independently verified

[Production run 36836610892](https://github.com/tberridge86/Stackr/actions/runs/36836610892) published **84 fronts, 252 derivative references and 336 distinct image files**, all newly created. It used [PR287](https://github.com/tberridge86/Stackr/pull/287), source `645f567a30d52f756143624a306574411e146871`, after all eight applicable CI checks and 81 focused local tests passed. The separate release-candidate gate was skipped. Both database rehearsals passed and rolled back before publication.

Exactly **81 printing native names and their 81 existing native search-name rows** were corrected in the artwork transaction. Correct names for E5/077, E5/085 and E5/086 remained unchanged. Independent full before/after comparisons confirmed other printing fields, aliases, variants and API identity fields were preserved; staging remained unchanged. No price, holding, source-policy or existing artwork changes were included.

Independent public verification finished at **2026-10-01T08:45:33.774Z**. All **84/84 cards and 336/336 image files** passed identity, native-name, attribution, URL, SHA-256, MIME, dimensions and full-decode checks. All **84 card checks and 336 image checks passed on the first attempt**, with no failed requests or retries. Earlier recorded API reliability failures remain open even when this batch passes.

The [downloaded receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36836610892/artifacts/11149547959) matches GitHub SHA-256 `62b6f56d364cfe43163757071923d09e3f7858cc7b20f2d31982542d3e486063`, **30,514 bytes**. The cohort SHA-256 is `aebd6a7cfddb25a7d00e5b2f3a579eec84fd963380e4c553d37a19fc06757d26`; the correction-plan SHA-256 is `e7da42da31bda12eb289ad119c9e58690178a3880ddd66cb39ddc62f37a35530`.

All fourteen recovery batches remain present: **9,154 fronts / 27,462 derivative references / 36,549 distinct stored objects**. The original **4,201-case queue has 1,194 resolved and 3,007 remaining**. The historical 4,250-case register has 1,243 resolved; its additional 49 were published before this queue began.

Final successful HTTP response-body median/p95: card detail **422/693 ms**, manifest **316/527 ms**, image **353/613 ms**. These measurements exclude deliberate pacing and retry waits; full attempt evidence is retained. They do not establish universal sub-0.5-second or installed-phone performance.

Remaining artwork: **English 465; Japanese 1,706; Korean 0; Simplified Chinese 829; Traditional Chinese 7**. Of these, **2,268** need matching sources or independent review, **97** have a verified front awaiting native-name correction, **two** have a verified front ready for publication, **605** have Chinese identity conflicts and **35** have other exceptions. The separate **94 missing checklists**, logo, pricing and phone gates remain open.

The next prepared work contains **99 Japanese PCG4 fronts and 297 derivatives**. All 396 image files passed independent hash, MIME, dimensions and full-decode checks against retained originals. Exactly 97 need precise native-name corrections; PCG4/105 and PCG4/106 already have correct names. All 99 remain outstanding until protected publication. [Independent review and preparation evidence](japanese-next99-reviewed-20261001.json). Korean zero applies only to this frozen artwork queue.

The [downloadable 99-front archive](https://github.com/tberridge86/Stackr/releases/download/artwork-residual-recovery-20260930/stackr-native99-reviewed-20261001.zip) is independently downloaded and checksum-verified: **18,455,055 bytes**, SHA-256 `e43d7e41f72ba00d310ec56b7cefbc8f70479bbae2059b66ca33a132d052d587`, GitHub asset **602830673**. Its 396 images and 402 ZIP entries passed integrity and path checks. [Archive evidence](japanese-next99-archive-20261001.json).

TestFlight **1.0.4 (48)** is already Apple-approved and available to both existing tester groups. This data publication requires no new mobile build. Installation and values, artwork, haptics, gyro and camera acceptance still need checking on the phone.

[Summary and checksums](artwork84-published-20261001.json), [production receipt](native84-production-receipt-20261001.json), [complete verification](artwork84-verification-20261001.json.gz), [after snapshots](native84-after-evidence-20261001.json.gz), [exact 3,007 remaining cases](artwork3007-exceptions-20261001.json.gz).
