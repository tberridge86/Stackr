# Native-language catalogue gap-fill path

Last reviewed: 2026-09-04

## Goal and display contract

Japanese, Traditional Chinese, and Simplified Chinese cards must use the printed-language card and set names as the primary identity. A verified English name may appear only as supplemental copy labelled `English:` or `English set:`. A non-authoritative translation may appear only as display copy labelled `English translation:` after an exact identity match and a recorded source- and feature-specific amber approval; it never populates `english_display_name`. Until that review is approved, missing English metadata stays null and the candidate lookups remain outside the public runtime. Native text must never be copied into an English field.

When an exact, approved native card image or set mark is unavailable, the app renders a language-aware identity placeholder containing the native name, set code, collector number, and language. Set-mark placeholders are code-native UI, not imitations of official logos. The app must not substitute an English printing's artwork or turn a provider URL into a permanent approved catalogue asset. The separately recorded controlled-provider route below may display only its exact low-resolution card reference while all of its controls remain satisfied.

All work in this path is governed by [`docs/stackrtcg-ip-operating-boundary.md`](stackrtcg-ip-operating-boundary.md). Green factual, native-first, and neutral-placeholder work may proceed. Amber source lanes require a completed approval record before activation, while red acquisition or display lanes remain quarantined unless the required permission is recorded. The older `pending_unapproved` CJK record continues to govern only lanes not superseded by a later source-specific review. The set-mark, bundled-logo, and CJK editorial-translation lanes below now have their own active recorded decisions.

## Controlled low-resolution TCGdex card references

The recorded green decision `catalogue/rights-reviews/tcgdex-low-resolution-card-reference-green.2026-09-04.json` activates a narrow provider-served reference route for Japanese, Traditional-Chinese, and Simplified-Chinese cards. Its SHA-256 is `1b83900633ef06878ec15f58337741dadf44fcb5d7fc5a81b549ac440c0f770b`; the bound evidence record SHA-256 is `c54a029c4470e3e6c4b0bbc8653bb728ac7495bdb1146bc82683f8aff9d6d905`, and the preserved third-party notice SHA-256 is `e3d997e8cbd5dd4ac5d601682125ef25fa7b3b9a0a1a46dc02910e3f6a1a718b`.

The runtime accepts only an exact image field returned with a live or ten-minute TTL-cached TCGdex card record whose language, provider set ID, provider card ID, local collector ID, and URL path all agree. The backend emits an explicit provenance descriptor instead of raw CJK image fields. The client revalidates that descriptor, registers the reference in memory, and permits only the provider's `245x337` `low.webp` rendition from the exact HTTPS `assets.tcgdex.net` host. URL shape alone, a stored database URL, an extension-less base, a high-resolution rendition, a query or fragment, credentials, a custom port, or a set-mark path is insufficient authority.

Rendered references use memory-only caching and carry the visible label `TCGdex reference`. Every general image surface applies a final guard, while search, card detail, binder/checklist, recognition-match, collection, inventory, and product-identification mappings fall back to a neutral placeholder when the live descriptor is absent or invalid. Exact-host TCGdex references are stripped from binder, collection, seller-inventory, scan, listing-media, listing-draft, RPC, database, and local-cache payloads, including nested JSON-shaped draft data. No high/zoom URL is exposed and no card-reference URL becomes catalogue data.

Historical provider URLs and Stackr-hosted mirrors already present in catalogue tables are not deleted by this development tranche. They remain internal provenance or repair hints only: CJK public catalogue DTOs suppress them regardless of host, and they cannot mint a controlled reference. The parallel legacy Japanese sync endpoint is retired with HTTP 410 so it cannot add high/low card URLs, set marks, product art, or raw asset payloads. Existing stored values can be considered later by an explicitly approved cleanup or migration; this task performs neither operation.

The global switches `EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES=true` and `STACKR_DISABLE_TCGDEX_CARD_REFERENCES=true` disable issuance and rendering. `EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST` removes an exact `language:providerSetId:providerCardId`; an oversized denylist fails closed. Set logos and expansion symbols are governed by the distinct owner-attested review below. Rarity symbols, pack/product art, listing photos, disk persistence, mirrors, derivatives, recognition corpora, and model training remain outside the card-reference decision. The route does not improve the closure ledger's exact-artwork score or activate any pending CJK editorial review.

## Owner-attested CJK set marks and bundled Japanese logos

On 4 September 2026 the review owner expressly represented that StackrTCG holds the permissions required for the app's outstanding Japanese and Chinese images and directed the implementation to proceed. That representation is recorded in `catalogue/rights-evidence/cjk-app-image-permission-owner-attestation.2026-09-04.json` (SHA-256 `0afd34fee2453ca87bf50383ce5aac3519439308297f9200855c57cc49bea0ad`) and supplies the approving-person record for two bounded amber decisions.

The TCGdex decision `catalogue/rights-reviews/tcgdex-cjk-set-marks-owner-approved.2026-09-04.json` (SHA-256 `6f8152e827d70b8a8ee09c023620332815f9a2183017c822dc5f86d60411c072`) activates provider-served `logo.webp` and `symbol.webp` set marks for Japanese, Traditional Chinese, and Simplified Chinese. Its evidence SHA-256 is `e33913070b820fd3fe25ecc7c0cf27112f3116e3073a4a4518fb63c0deb93845`. Both backend and client require HTTPS, the exact `assets.tcgdex.net` host, four safe path segments, an approved CJK or universal scope, webp, no credentials/query/fragment/custom port, and a working kill switch and denylist. The marks remain runtime-only and do not rewrite or clean catalogue rows.

The local-pack decision `catalogue/rights-reviews/stackr-japanese-set-logo-pack-owner-approved.2026-09-04.json` (SHA-256 `0352029e6d78fd5a093a5e7ff9cfb016057febadc66bc9d61470504312a8ff52`) activates only the 204 files bound by `assets/rev2/11-japanese-set-logo/manifest.json` (SHA-256 `699a5c571703d76456b3bd67f0c9c44be3c31c424b57636a9f86707004e8c543`) and aggregate file-ledger SHA-256 `9dc0dca09918262a0e1fca9bc3c1fe5fdc3829bb54a44f537c1ca72de4c5b236`. Exact Japanese identity remains mandatory and ambiguous cross-language matches remain forbidden. `EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS`, `STACKR_DISABLE_TCGDEX_SET_MARKS`, `EXPO_PUBLIC_DISABLE_JAPANESE_SET_LOGOS`, and `STACKR_DISABLE_JAPANESE_SET_LOGOS` provide immediate source-level shutdown.

The final display guard deliberately distinguishes TCGdex-hosted values from existing Stackr/catalogue values. Exact TCGdex-hosted set marks must pass the reviewed HTTPS allow-list. Existing non-TCGdex set logos, covers, artwork, and Stackr delivery paths pass through unchanged; the provider gate is not a cleanup mechanism and never writes, nulls, or rewrites their stored fields.

## Owner-approved CJK English set supplements

The separate metadata attestation `catalogue/rights-evidence/cjk-app-metadata-permission-owner-attestation.2026-09-04.json` has SHA-256 `13e9bc1ffa4635cdc10110f0e8dc7356dcb7433d73e60755cc019ba075137d11`. The source-specific amber decision `catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json` has SHA-256 `756deba35b402b9714937a84f0db88b858945af6d861320dcdca71374630c205` and activates 11 Japanese, 49 Simplified-Chinese, and 77 Traditional-Chinese editorial translations at runtime.

The printed-language name remains the title. An admitted editorial value is separate copy labelled `English translation:`, is explicitly non-authoritative, and requires exact language, normalized set code, and normalized native title. Client and backend apply the same generated lookup and the same kill switches: `EXPO_PUBLIC_DISABLE_CJK_EDITORIAL_SET_TRANSLATIONS=true` or `STACKR_DISABLE_CJK_EDITORIAL_SET_TRANSLATIONS=true`. No value is written to `english_display_name`, `english_set_name`, or another canonical field.

The current Japanese audit covers 394 sets: 153 manual supplements, 102 exact identity-bound TCGdex supplements, and 11 owner-approved editorial supplements are active, leaving 128 unresolved. Its row and fully runtime-bound audit SHA-256 values are `20f3575644d6ffd7fa4249a740f02356a877d47110f5aaa7859d3f56ebf6bfda` and `2be513a890fdfcaf8f59443217c56d86deb78f3f60a79eb1dca9da05c373a114`.

The current Chinese audit covers 220 set rows. It proves 84 exact provider-baseline native-name matches and three current rows reached through the two approved identity rules. Forty additional rows have an active draft keyed by their current set code but lack a native-name proof in the older bound provider snapshot, so they remain conservatively reported as source-name-unverified even though the runtime will still require an exact native-name match. The remaining 93 rows have no supplement candidate. The rows and fully runtime-bound audit SHA-256 values are `5a5564a7caa89a8b596fc24386487dbbddbe93cf79cc9932a093ad8d066c934d` and `85b3ef9ddc1591d931e674a623c1a14fa101758b2d323f0d6180486c72cfc131`.

## Current image and set-mark coverage audit

The hash-bound read-only image audit accounts for all 14,051 current CJK native-image gaps without changing catalogue data. It found 356 exact current provider URL candidates, 5,424 rows without an exact provider identity, and 8,271 exact mappings whose frozen snapshot has no image URL. A strict HTTPS `HEAD`-only live probe then confirmed all 356 candidates available: 253 Japanese and 103 Traditional-Chinese; Simplified Chinese currently contributes none. The queue/report SHA-256 values are `9b7ae35470649cc74dfdecb71487671bc7be034578d04e1e0699ff86ad7163a9` and `95a4406ebd5996debd593aba02031482845019495100e04c2859a819de76da75`; the live result/report SHA-256 values are `04b31e0b304097bc9923e495c953f18581371785d4d39c89857df3e2af03eda4` and `64a62128c3217b667ad4e578da104a331d0679ab619f1fa4345dd0627ec85a3f`.

The bundled Japanese logo coverage audit resolves 177 of 394 current sets: 142 exact keys, ten existing aliases, and 25 unique manifest-code fallbacks. It leaves 216 sets with no manifest-bound identity and one deliberately ambiguous `MG` identity; no speculative alias was added. Thirty-three pack assets have no current exact set identity. The coverage, unused-assets, and audit SHA-256 values are `d56d79ec5ec353c1d4a6818d16d2a52b3020e37c08198e25b5feb4095daee0bb`, `ad1003d3ed1ca713167bdaae34a9c149fc7ebab590ec1571bcfd0f99c3e7502c`, and `fc2c9f61d0c95c61273496a2c0a2f1eaeb48204ac427832d3f215a25be547703`.

A fresh provider-field audit found no Chinese logo or symbol values to activate: all 83 exactly mapped Traditional-Chinese set records and all 48 exactly mapped Simplified-Chinese set records omit both fields, while 89 Simplified-Chinese canonical sets lack a current exact provider identity. The resolver therefore returns no mark instead of fabricating a predictable URL. This is a source-data gap, not a permission challenge.

## Eight reviewed Japanese scalar supplements

A separate green decision activates exactly eight Japanese set facts as labelled display supplements: release dates for `DS`, `SM3p`, `M6`, `SM4p`, `SC`, and `XY`, plus positive printed set sizes for `DP2` and `DP3`. The tracked frozen source SHA-256 is `fa9fd6e81342a5c26b60366be1109d00f15e4afc10a8875cd36f52b3edc13c5d`, the evidence SHA-256 is `dff3d8facbbeb7a440ef79462b3a36cdb42b7870ab8da399f7bffd3a21931828`, and the green display decision SHA-256 is `ba0f258c40720b6270e8d440990eee730f8b5cb2d1c74521f75109cd1e20d405`.

The resolver requires an explicit Japanese language, one non-conflicting normalized provider set code, and a literal native Japanese set-name match. The set page renders the values separately as `Release date:` or `Set size:` beneath the native-primary title. It does not populate or overwrite `releaseDate`, `total`, `printedTotal`, `release_date`, or any database field. `EXPO_PUBLIC_DISABLE_TCGDEX_METADATA=true` and `STACKR_DISABLE_TCGDEX_METADATA=true` fail the lookup closed. The temporary audit pack that identified these rows is recorded only as non-authorizing provenance; activation depends on the tracked frozen source, evidence, and decision. Chinese metadata, translations, series mappings, creative text, artwork, marks, assets, derivatives, embeddings, and training remain excluded. Consequently, this tranche improves eight visible Japanese set details but leaves canonical closure-gap counts unchanged.

## Checked-in evidence and current read-only staging audit

The latest checked-in canonical evidence (`reports/catalogue/canonical-evidence/2026-08-21-v4`) records these strict native-image gaps:

| Language | Variants | Exact native images | Missing |
|---|---:|---:|---:|
| Japanese | 15,952 | 3,882 | 12,070 |
| Traditional Chinese | 8,223 | 2,146 | 6,077 |
| Simplified Chinese | 20,408 | 19,431 | 977 |
| **Total** | **44,583** | **14,065** | **30,518** |

The corresponding Asian set-art gap is 621 slots: Japanese has 24 missing logos and 159 missing symbols; Traditional Chinese has 83 and 83; Simplified Chinese has 136 and 136.

The largest metadata gaps are:

| Language | Missing rarity | Missing artist |
|---|---:|---:|
| Japanese | 4,985 | 2,237 |
| Traditional Chinese | 4,217 | 208 |
| Simplified Chinese | 4,342 | 12,102 |

Release dates are complete in the baseline.

That checked-in evidence is now historical. A complete, read-only canonical evidence run against staging at `2026-09-03T21:20:14.027Z` found substantial catalogue growth. Unlike the earlier provisional direct query, this run excludes incomplete or conflicting canonical identities and verifies the complete evidence contract:

| Language | Active variants | Exact active native-image variants | Strict technical gap |
|---|---:|---:|---:|
| Japanese | 24,603 | 16,856 | 7,747 |
| Traditional Chinese | 8,223 | 2,146 | 6,077 |
| Simplified Chinese | 20,408 | 20,181 | 227 |
| **Total** | **53,234** | **39,183** | **14,051** |

The earlier direct query reported an 11,871-image gap, but 2,180 additional Japanese variants were excluded once canonical identity and exact-link checks ran. The fresh report has no canonical-key collisions. Its local report and row-ledger SHA-256 values are `2ae15996b55cb11e5e16f42822de4b50f61cc951e0605c89e675c44aea17c061` and `6754a23306d5570a3f71db5ab0d67d8c5909f01027f7a94282048992b6539d3e`.

The same run found 394 Japanese, 83 Traditional-Chinese, and 137 Simplified-Chinese sets. Under the strict canonical, checksum-valid set-art contract, all 1,228 Asian set logo/symbol slots remain open. The later owner attestation activates bounded runtime app display through TCGdex and the exact bundled Japanese pack; it deliberately does not rewrite those canonical closure rows or claim that every slot now has a provider asset. The 39,183 count above remains a measurement of exact canonical technical matches, while runtime provider coverage is evaluated live and separately.

Metadata also changed materially: Japanese now has 13,778 missing rarities and 11,030 missing artists, while Traditional Chinese remains at 4,217 and 208 and Simplified Chinese remains at 4,342 and 12,102. The fresh repair plan has explicit reviewed queues for 24,469 missing printing English names (23,592 Japanese and 877 Simplified Chinese), 443 missing set English names (394 Japanese and 49 Simplified Chinese), 116 invalid/missing positive set totals (29 Japanese, 85 Simplified Chinese, and two Traditional Chinese), and 198 Japanese release dates. Missing series links affect 342 Japanese, 136 Simplified-Chinese, and 83 Traditional-Chinese sets. Its plan and manifest SHA-256 values are `e1d2a0630987ca952c636984d3f99bf9198bb2842c06232f6781a7f1f307c09d` and `9e31d42258e57d72df1587fde00c88a5976cf2e6e3664048b846f8f4b781905c`.

The audit also found mislabeled supplement data: 7,439 Traditional-Chinese card and 77 set `english_display_name` values contain native script or duplicate the native name. They are suppressed at read time rather than exposed as English and are emitted as blocked non-null-cleanup diagnostics, not fed into the null-only repair queue. Per printing, only one distinct, Latin-script, high-confidence supplement is accepted; native-script, ambiguous, low-confidence, and native-duplicate candidates remain null.

## New pinned snapshot lane

The converter and adapter support a local checkout of `type-null/PTCG-database` pinned to commit `90e28f12dde837353c3f4d231edfe236cfe9ba80`. They never crawl the official Pokémon sites. The checkout commit must match exactly, incomplete identities are retained as rejected records, and metadata records are separate from asset-pointer records. Approved metadata additionally requires a matching SHA-256 entry in `catalogue/ptcg-database-snapshot-manifest.json`; an altered local JSON file is rejected even when it claims the reviewed commit.

The local snapshots generated during this work are deliberately ignored build artifacts:

| Snapshot | Sets | Cards | Artist facts | Rarity facts | Asset pointers |
|---|---:|---:|---:|---:|---:|
| Japanese | 308 | 21,341 | 20,849 | 12,266 | 21,649 |
| Traditional Chinese | 116 | 12,079 | 11,737 | 0 | 12,195 |

The hardened snapshots regenerated from the exact pin on 2026-09-03 passed the adapter health check and a field-level audit. Their local review hashes are:

| Language | Snapshot SHA-256 |
|---|---|
| Japanese | `4f00269c3c86d519fb00003f5b890bc32d36c1ef99f4d08ee976bd3e38b134d8` |
| Traditional Chinese | `3e4c7cf34e111f2cd25c5b6855a26ad972eee4801e266d000b5759e5c171d3d5` |

The asset-pointer totals include card-image and set-symbol candidates. They are discovery evidence, not approved assets and not guaranteed canonical matches. The source-rights registry prohibits automated asset retrieval, storage, public display, derivatives, embeddings, and model training from this source.

## Reproducible workflow

1. Check out the exact reviewed commit locally and verify that `git rev-parse HEAD` equals the 40-character pin.
2. Convert each language without fetching image bytes:

   ```text
   npm run catalogue:convert-ptcg-snapshot -- --snapshot-root=.tmp/ptcg-database-source --upstream-commit=90e28f12dde837353c3f4d231edfe236cfe9ba80 --language=ja --output=.tmp/ptcg-snapshots/ja-90e28f.json
   npm run catalogue:convert-ptcg-snapshot -- --snapshot-root=.tmp/ptcg-database-source --upstream-commit=90e28f12dde837353c3f4d231edfe236cfe9ba80 --language=zh-tw --output=.tmp/ptcg-snapshots/zh-tw-90e28f.json
   ```

   The CLI writes to a process-specific pending file and promotes it only after the full JSON write succeeds, so an interrupted conversion cannot replace a valid snapshot with a partial file.

3. Validate the adapter and inspect counts with a no-write run:

   ```text
   npm run catalogue:ingest -- run-language --source=ptcg-database-snapshot --file=.tmp/ptcg-snapshots/ja-90e28f.json --language=ja --licenceStatus=under_review --assetLicenceStatus=under_review --limit=100 --dryRun
   npm run catalogue:ingest -- run-language --source=ptcg-database-snapshot --file=.tmp/ptcg-snapshots/zh-tw-90e28f.json --language=zh-tw --licenceStatus=under_review --assetLicenceStatus=under_review --limit=100 --dryRun
   ```

4. Produce a local, review-only reconciliation report against the checked-in provider baseline. This joins only exact language, set code, collector number, and native-name matches, resolves one active TCGdex external identifier to a canonical variant, then proves that variant's active canonical printing and set identity. It deliberately excludes all artwork URLs and asset records:

   ```text
   npm run catalogue:reconcile-ptcg-snapshot -- --snapshot=.tmp/ptcg-snapshots/ja-90e28f.json --baseline=reports/catalogue/provider-baseline/2026-08-14/canonical-provider-mapping-snapshot.json --raw-cards=reports/catalogue/provider-baseline/2026-08-14/raw/ja.cards.json --language=ja --output=.tmp/ptcg-reconciliation/ja-review-v2.json --jsonl-output=.tmp/ptcg-reconciliation/ja-review-v2.jsonl
   npm run catalogue:reconcile-ptcg-snapshot -- --snapshot=.tmp/ptcg-snapshots/zh-tw-90e28f.json --baseline=reports/catalogue/provider-baseline/2026-08-14/canonical-provider-mapping-snapshot.json --raw-cards=reports/catalogue/provider-baseline/2026-08-14/raw/zh-tw.cards.json --language=zh-tw --output=.tmp/ptcg-reconciliation/zh-tw-review-v2.json --jsonl-output=.tmp/ptcg-reconciliation/zh-tw-review-v2.jsonl
   ```

   Fresh hardened reconciliation results:

   | Language | Input cards | Exact card reviews | Exact set identities | Rejections | Reviews with rarity | Reviews with artist |
   |---|---:|---:|---:|---:|---:|---:|
   | Japanese | 21,341 | 4,965 | 111 | 16,573 | 3,934 | 4,913 |
   | Traditional Chinese | 12,079 | 5,748 | 56 | 6,391 | 0 | 5,592 |

   Every accepted v2 card review has a non-null canonical printing ID. The four regenerated review artifacts are hash-bound locally as follows:

   | Artifact | SHA-256 |
   |---|---|
   | Japanese JSON | `b9d7f4bc5e30eb2c971f83b86ade2e6b33d1c4a98a5fd9ab8b426db7edc0fe28` |
   | Japanese JSONL | `f90877930dcc960cc898e76b48f9489908f376a01fd4f055cf506d63400e51d0` |
   | Traditional-Chinese JSON | `1008fe8132308e9149802616ea21939cbaef3dbe8846b916e262dc7f0d2653b9` |
   | Traditional-Chinese JSONL | `97c861f84f0caff2197fef806252850bb0a9c36e86e6f316ff7a3078eec02625` |

   The baseline is a static 2026-08-14 canonical read, not proof that a row is still current. The report is review evidence only: refresh canonical evidence, re-check deprecation state, and obtain human approval before any staging import. A human reviewer must add the exact reviewed snapshot hash to the manifest before `licenceStatus=approved` is allowed. Set records are identity-only and require a separate native set-name review because provider set names can change while a set code remains the same.

5. Regenerate canonical evidence, then rebase every historical image-acquisition plan before treating a task as current. The rebase refuses evidence older than 24 hours by default, verifies report/ledger hashes, classifies every task as already complete, same-artwork reference, stale, or still missing, and emits only exact current local-file candidates. It also checks unmapped Japanese logo PNGs against missing set codes by exact identifier only:

   ```text
   npm run catalogue:rebase-asset-acquisition -- --plan=PATH_TO_PLAN.json --canonical-evidence-dir=PATH_TO_FRESH_EVIDENCE --output=.tmp/catalogue-asset-rebase.json
   ```

   Rebasing all eleven 2026-08-14 plan pages against the fresh evidence classified 5,118 tasks as follows: 19 already complete, 103 already represented by a same-artwork reference, 4,859 stale/ineligible, and 137 still missing. All 137 surviving candidates are hash-verified local Japanese set logos; no historical remote card-image download remains current. Of 204 local Japanese logo PNGs, 139 were already in the historical plans and none of the remaining 65 has a new unambiguous exact set-code match.

   The same report now accounts for every one of the 14,051 strict card-image gaps. It emits a provider-free, identity-safe capture queue for 10,874 current blanks: 4,950 Japanese (4,948 scan-required and two explicitly missing), 5,841 Traditional Chinese, and 83 Simplified Chinese. A second queue identifies 854 complete variants with checksum-bound historical TCGdex assets that are now inactive/unavailable: 617 Japanese, 96 Traditional Chinese, and 141 Simplified Chinese. Those rows need source permission and exact-SHA reacquisition rather than a new identity search. A third queue identifies 2,180 Japanese variants whose already-stored, checksum-valid image can be unlocked by reviewing the currently `unclassified` variant and missing finish identity. The remaining 143 gaps are explicit same-artwork references (140 Traditional Chinese and three Simplified Chinese).

   Every queue row binds the current canonical variant and set; dormant rows also bind existing asset IDs and content SHA-256 values without exposing provider URLs. Capture still permits only an owner-authorized scan or licensed asset, and dormant recovery still requires source permission. The temporary rebase report SHA-256 is `231537734963268c5d4fb43769767fefb101ec450e02bb3707ad90a8a88417a3`.

   The 2,180-row Japanese identity queue can be narrowed without executing upstream code or reading artwork. A local checker pins `tcgdex/cards-database` to commit `ccb9cef3f9a545be89cd5e716cc1c72f99070bac`, verifies the reviewed compiler and rights-evidence hashes, requires every card file to be tracked and unchanged, and accepts only cards with no explicit `variants` property. The pinned compiler's static defaults then support an unsigned `normal` / `normal` proposal:

   ```text
   npm run catalogue:tcgdex-ja-default-variant-review -- --generated-at=2026-09-03T22:15:00.000Z
   ```

   This produced 633 metadata-only review candidates and excluded 1,547 rows whose exact card source is absent at the pin. It authorizes no asset or database mutation. The local report SHA-256 is `e78e82ebaef2d64c5ee9781f7005e6ea1b38e5965ea52da9846f9095ef0c763f`.

   A separate fail-closed authorization audit proves that zero assets are currently promotable under the complete public-display contract. It classifies 48,530 as technically present but not authorized, 25,817 as technically ineligible, and all 1,662 set-art slots as not eligible. Its local report SHA-256 is `1c7a9973c295e67d286ba3f89c08a0a0e041f49cd7135aec9c54ec07262cf476`.

6. Reconcile metadata candidates by exact language, set identity, collector number, native name, canonical variant, and canonical printing. Quarantine ambiguity, conflicts, and non-null disagreements. Only fill null metadata after human review and retain the source commit and record URL as provenance.

   ```text
   npm run catalogue:metadata-repair-plan -- --evidence-dir=PATH_TO_FRESH_EVIDENCE --output=.tmp/canonical-metadata-repair-plan
   ```

   The local PTCG review-pack builder hash-verifies the fresh plan and its exact queues, binds both v2 reconciliation reports, and emits no importer-ready rows:

   ```text
   npm run catalogue:ptcg-metadata-review-candidates
   ```

   Against the 2026-09-03 evidence it produced 15 single-value artist candidates, one consistently observed positive set total, and 704 raw rarity-code candidates. Rarity rows remain explicit mapping-review work because no canonical rarity ID is inferred. The artist, set-total, rarity, and pack SHA-256 values are `81f6e7deb861efe159499dbd2e857d0a862fc9efced604244c35260f758dde64`, `a2495fa551b9cf60f8062b975d6cb474078e2a6ff8181591a7e13965ab38fbb3`, `9fc7251238fc9ffadb0f90c460312fad29f3020d95b87f92f8ebf017c8f4ff3f`, and `e54d691236d258f97352ee6a78ad45a3add7ff6e7fc7787cf68ec376f52e4587`.

   Set-specific local review packs make the remaining boundary explicit:

   ```text
   npm run catalogue:ja-set-review-candidates
   npm run catalogue:zh-set-review-candidates
   ```

   The Japanese pack found no safe row to propose. Of the 394 current English-name targets, 185 have no tracked exact set module at the TCGdex pin, 202 have a tracked path whose blob is not present in the local partial checkout, and the seven locally available exact modules contain no literal `name.en`. None of those seven sets intersects the current Japanese release-date or printed-total queues. The pack and exclusion SHA-256 values are `a60fc54135a76e92267852af3c0e4985d0c721b531c4c6735a10d79a9654ed4b` and `30016a291e80d6c9b06c8e2e5f64bf211104d8ae00c02d1ee0db5168ab6242df`.

   The Chinese pack independently reproduced the one Traditional-Chinese SP5 total of 13 already present in the general PTCG pack; it is the same candidate, not a second repair. It emitted no release-date, English-name, series, or set-mark proposal. The remaining blockers are 49 Simplified-Chinese English set names with no evidenced local English field, 83 Traditional-Chinese and 136 Simplified-Chinese sets with no canonical-series UUID mapping, 85 Simplified-Chinese total targets with no exact local identity reconciliation, one Traditional-Chinese source row without a positive total, and artwork rights that prohibit using snapshot pointers as set marks. The Chinese pack and total-candidate SHA-256 values are `5446aea91513cb367e3f8b7370df3397cc3c1b72ca0acd24c3570d325ddce76f` and `1ba077a7d7317d9e097bf5202de6034212cf02f3d0d27aecf64a91fce78fd971`.

   Additional metadata and English-supplement lanes now reduce the visible gap without weakening the native-first contract:

   - The existing application lookup was joined to exact Japanese reconciliation targets and the current hash-verified queues. It produced 178 distinct card candidates and 110 set candidates; 33 duplicate variant-level card records collapsed to their canonical printing and no conflicts were accepted. This is UI-derived evidence, not independent upstream provenance, so it remains unsigned and non-importer-ready. The card, set, and pack SHA-256 values are `b5383afd2167004c27a58414fe488f56b50d208cd2f0e83a6d7fbff458bea125`, `75b706bf0039304a52c8a9d12367698a470eb03baba771a24b51fc570ee1762d`, and `26ac00a4c77ad79d4834f221a085dd1e2e73f1c002f649a5c09b9521584e4232`.
   - A strictly read-only staging export found 84 current, distinct internal English-name candidates: four Japanese and 80 Simplified-Chinese printings. It accepts only concept-linked `english_display` records at confidence 1 or exact-printing records at confidence 0.95, rejects native-name duplicates and conflicts, and is bound to the current queue. The evidence-file, candidate, and pack SHA-256 values are `57aff806bd694f2bf3ac0b15427dd533ad797097a8396da5b1af238eccb3e115`, `f0cd771c935a4a5faf9f228665d0c152c51d34028fccc5dcbad6d5c93c634c8f`, and `98e48b972d63a92680f71b065fe0403009809f2f7c00c4180c67f61670be6fc8`.
   - A bounded Wikidata Pokémon-species label snapshot (CC0) was matched only by exact Japanese, Simplified-Chinese, or Traditional-Chinese native species label plus a small allow-list of literal card suffixes (`ex`, `GX`, `V`, `VMAX`, `VSTAR`, or `BREAK`). Against the current evidence it produced 3,222 Japanese null-fill reviews and 2,089 Traditional-Chinese invalid-value replacement reviews. The latter are explicitly blocked from ordinary null-only import and require an authorised current-value re-read and overwrite decision. The snapshot, candidate, and pack SHA-256 values are `ab9bd6ed70eb4fd8c22614401ce4befd179a3a1f7ecdd277f1ae0f470be530dc`, `3a6619ae62ee66fbad65692e9299587b5dfe498c9e582d201f940b13bf3f2c50`, and `6d197d7997d351548c48566bbf7b99ed2ebaa858c82cc656755b0764a519d9bc`.
   - The same hash-verified CC0 snapshot generates a review-only species candidate lookup containing 1,200 Japanese, 1,027 Simplified-Chinese, and 1,027 Traditional-Chinese exact native-label mappings. Two ambiguous `雷丘` rows are excluded, punctuation-only records are rejected, and only the literal suffix allow-list above may be detached before an exact base-species match. Because this is repeated extraction from a compiled third-party database, the operating boundary classifies activation as amber even though the labels are CC0. Both generated modules therefore embed `activationAuthorized: false` and `publicRuntimeImportAuthorized: false`; client/backend tests verify the candidate bytes and fail-closed runtime behavior, but the app does not currently consume the lookup. The generated client and backend SHA-256 values are `183f466d79a6c420b8a486ca6376a7e9359bdf14cc22df4f1a3e32e8546cc4cb` and `f75be448e1a672d0fc773a4186da4f5954f5324a41f045f9b613de5776e72dc7`.
   - [`tcgdex/cards-database`](https://github.com/tcgdex/cards-database/tree/dd4fc9460b54b91c25df750c68ca36b9946448e2) metadata was pinned to commit `dd4fc9460b54b91c25df750c68ca36b9946448e2`; its README, MIT license, and Japanese set-name map are hash-verified locally. At the earlier review-only stage, exact set-code lookup produced 210 Japanese English-name candidates and 184 misses, while the v3 runtime audit counted only 158 active manual matches and 236 unresolved. It separately identified 101 pinned TCGdex and 11 editorial candidates as then-quarantined. Those historical counts are superseded by the later green and owner-approved decisions described below; the historical v6 row and report SHA-256 values remain `857e0b9267943ec1814f6dc78cc64484793997957d1f71f74fd662a52f3f5669` and `ee9da0b1b84277991fd93efe42a3e0ffa978aedc3d77a8f492b3dbea16d7ed27`.
   - The later 2026-09-04 operating boundary expressly classifies TCGdex factual metadata and translations as green when the MIT notice, provenance, native-primary presentation, and source controls are present. The first exact-commit decision activated 158 manual and 101 pinned-TCGdex Japanese supplements. That historical v7/v4 audit reported 259 of 394 covered and 135 unresolved; it is superseded by the owner-approved editorial audit above, which adds 11 exact Japanese translations for current coverage of 270 and 124 unresolved. The historical row and report SHA-256 values remain `bf9928525d8c00f762ca828c147f874fff8613647312d5b9189fccba91e31e9c` and `9500fa934283586074ef57eb39c0e4b45a8bde125772aa31fc98bea091694d24`.
   - Eleven Japanese translation rows (`PCG1`–`PCG10` and `M6`) began as review candidates and are now active only through the later owner-approved runtime gate. They still carry `model_translation_draft` and `stackr_non_authoritative_editorial_translation_candidate`, remain labelled `English translation:`, and never populate `english_display_name`. The 26 records obtained through automated `pokemon-card.com` page collection remain red, removed, and inactive. Four code collisions (`DP4`, `DP5`, `SA`, and `MG`) and eight promo/category identities (`CLF`, `DP1`, `PPP`, `CLL`, `DPP`, `DPtP`, `CLK`, and `LP`) remain explicit fail-closed exclusions.
   - The same current TCGdex pin now supplies a separate Asian set scalar/series review pack. It accounts for all 1,318 CJK queue slots: 443 English-name targets, 198 release-date targets, 116 printed-total targets, and 561 series targets. Exact field-specific evidence produced six Japanese release-date candidates, two Japanese positive printed-total candidates, and 303 Japanese/Chinese source-series identity records; all 443 English-name rows remain exclusions because the Asian set modules contain native text rather than an English value. Series records carry a native same-language label but deliberately propose no canonical UUID. The other 1,007 rows are explicit exclusions. All 282 selected source blobs, every candidate set/series hash, the plan, all four queues, and the canonical ledger were independently rehashed against the exact pin. The v7 candidate, exclusion, source-inventory, and pack SHA-256 values are `2c4358e3f0a5c7f3f781c77bb4c9364265a47fd19cbd59c9b7c514c7d7017ea5`, `38ee7deb854318a7e23889fdc327a5ff28d62434468a9dc31d61536acd064f66`, `3b4ac76973e1ef74ea0d8a54b730afb3c1966d1c61b26336edaf7bb3f01dd317`, and `dc083ee718b3313bbc61340372763be8bac19c478e08d9f7e7d015e9fd2ddc97`. The pack is unsigned, non-importer-ready, human-review-only, and accessed no database, network, or artwork.
   - A separate Chinese wording pack supplies all 49 Simplified-Chinese and 77 Traditional-Chinese editorial rows. CSV1C must match `亘古开来`, while CBB1C must match `宝石包 第一卷`; the latter permits only the reviewed `data-asia/SV/CBB1C.ts` path-stem rekey of its pinned `CSV1C` internal-ID typo. The two-entry identity source SHA-256 is `bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629`. All 126 rows remain `model_translation_draft`, native-primary, non-authoritative, and write-unauthorised, but their generated client/backend maps are now imported through the later owner-approved active runtime gate. Exact language, code, and normalized native title remain mandatory; this approval does not turn the wording into canonical metadata or authorize a catalogue rewrite.
   - A local-only Japanese official-page review queue covers the broader fail-closed gap without fetching a page. From the v6 audit and pinned Japanese snapshot it identifies 190 unresolved sets and 8,431 distinct card-detail pointers by local record ID. Every row and report declares activation, public display, and network fetch unauthorised; automated official-site collection is a red stop condition, and any contemplated manual use remains amber. The queue and report SHA-256 values are `51dfabe7922e88bb3fb75dd68d3ccf2cf0642dcc384f29612b839006b19d0e46` and `f65a18c391f2d80b785a4c8a5f3f04a062ad33e02d44569bf64911e1f7039598`.
   - A staging-only TCGdex card-link exporter is ready for the missing artist, rarity, supertype, and English-supplement lanes, but it has deliberately not been executed without explicit remote-read approval. It pins the reviewed planner manifest SHA-256 and plan/evidence IDs, binds all nine planner queues, and narrows the future read to the 40,801 distinct Japanese/Simplified-Chinese/Traditional-Chinese printings that occur in those four metadata queues. A record is accepted only when the hash-bound queue language, active printing, set, active variant, exactly one active TCGdex source, and current `card` external identifier all join without conflict. Variant-bound identifiers must have all seven non-variant canonical target columns null, matching the database's exactly-one-canonical-target constraint. Reads use exact-count, ordered pagination; same-language identifier collisions and any identity mismatch are quarantined. Outputs are create-only beneath a real, non-symlinked `.tmp` path, carry an observation time and query/input hashes, and exclude images, asset fields, and URLs. This exporter gathers the fresh link proof needed to revisit the stale-provider overlap (2,409 artist and 7,290 rarity variant chains); it does not itself propose or write metadata.
   - The three high-volume Japanese rarity codes `rare_c_c`, `rare_u_c`, and `rare_r_c` now resolve to Common, Uncommon, and Rare before the canonical taxonomy lookup, while the original provider record remains in ingestion evidence. The shared UI rarity parser also handles these exact raw codes defensively, preventing `rare_r_c` from falling through to Common merely because its compound code contains `c`.
   - A generic reviewed-capture bridge now replaces the one-off assumption that only six Simplified-Chinese `151c` cards can be promoted. A v2 declaration binds the reviewed consent manifest, exact original capture ID/path/SHA-256, exact reviewed derivative path/SHA-256, native and English identity, variant/finish, and the source-rights registry. It normalizes `ja`, `zh-Hans`, and `zh-Hant` to canonical language codes and resolves exactly one same-language set, native-name printing, and physical variant. Dry run is the default and has no storage or database write path; application is adapter-only, staging-only, rechecks derivative bytes, and clears a stale same-artwork reference when the exact native image becomes available. The current queue contains 1,610 Japanese, 832 Simplified-Chinese, and 1,444 Traditional-Chinese scan-acquisition candidates.
   - The existing six `151c` captures are fully described by that v2 declaration and were previously published only in isolated staging. A real local dry run on 2026-09-04 rehashed all six originals and all six reviewed derivatives successfully. They deliberately remain non-promotable now: `stackr_owned_capture` is still `conditional`/`review_required` for retained originals, derivatives, and public display. The bridge reports those three blockers in its plan and refuses application until a newly hash-bound rights registry explicitly approves all three capabilities. Owner consent to the scan pixels is not treated as permission to commercially display the underlying card artwork.

   Reproduce the standalone CJK audit and review tooling into new, empty local output directories. These commands never write catalogue rows, storage, or image bodies; the optional probe sends HEAD requests only when its explicit `--probe` flag is supplied.

   ```text
   npx tsx scripts/build-japanese-set-display-draft-lookup.ts --check
   npx tsx scripts/test-japanese-set-display-draft-lookup.ts
   npx tsx scripts/build-tcgdex-chinese-set-identity-display-source.ts
   npx tsx scripts/test-tcgdex-chinese-set-identity-display-source.ts
   npx tsx scripts/build-chinese-set-translation-draft-review-pack.ts --output=.tmp/chinese-set-translation-draft-review-pack/NEW_OUTPUT
   npx tsx scripts/build-chinese-set-translation-draft-runtime-lookup.ts --check
   npx tsx scripts/test-chinese-set-translation-runtime-lookup.ts
   npx tsx scripts/audit-japanese-set-english-runtime-coverage.ts --rights-review=catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json --output=.tmp/japanese-set-english-runtime-coverage-audit/NEW_OUTPUT
   npx tsx scripts/test-audit-japanese-set-english-runtime-coverage.ts
   npx tsx scripts/audit-chinese-set-english-runtime-coverage.ts --evidence-dir=.tmp/canonical-evidence/current-gap-audit-20260903-v3 --provider-baseline-dir=reports/catalogue/provider-baseline/2026-08-14 --output=.tmp/chinese-set-english-runtime-coverage-audit/NEW_OUTPUT
   npx tsx scripts/test-audit-chinese-set-english-runtime-coverage.ts
   npx tsx scripts/audit-japanese-set-logo-runtime-coverage.ts --output=.tmp/japanese-set-logo-runtime-coverage-audit/NEW_OUTPUT
   npx tsx scripts/test-audit-japanese-set-logo-runtime-coverage.ts
   npx tsx scripts/audit-current-cjk-provider-image-coverage.ts --output=.tmp/cjk-provider-image-coverage-audit/NEW_OUTPUT
   npx tsx scripts/test-audit-current-cjk-provider-image-coverage.ts
   npx tsx scripts/probe-current-cjk-provider-image-urls.ts --source=.tmp/cjk-provider-image-coverage-audit/NEW_OUTPUT
   npx tsx scripts/test-probe-current-cjk-provider-image-urls.ts
   npx tsx scripts/probe-current-cjk-provider-image-urls.ts --probe --source=.tmp/cjk-provider-image-coverage-audit/NEW_OUTPUT --output=.tmp/cjk-provider-image-live-head-probes/NEW_OUTPUT
   ```

   After explicit approval for a staging read, collect the current card-link proof into a new output directory. The command has no write path and refuses any non-staging Supabase URL:

   ```text
   npx tsx scripts/export-tcgdex-card-metadata-bridge-evidence.ts --confirm-staging=lmwfhvexfcoyeuoyrlco --plan-dir=.tmp/canonical-metadata-repair-plan/current-gap-audit-20260903-v3 --output=.tmp/tcgdex-card-metadata-bridge-evidence/NEW_OUTPUT
   ```

7. Run a staging import only with the staging target guard and credentials present. Never enable image assets for this source. Refresh canonical evidence after import and compare before/after counts.
8. Fill real image gaps only from an owner-authorized capture or provider whose registry entry explicitly permits retrieval, storage, transformation, and public display. Validate identity and bytes before promotion.

## Current execution boundary

The converter, adapter, native-first display behavior, deterministic artwork fallbacks, locale-preserving set-mark resolution, dry-run path, printing-bound v2 reconciliation, fresh canonical evidence producer, and current exact-gap audits are implemented and tested. Search, market, offers, Pokédex, profile, community, duplicates, inventory, listing, value-history, card, set, sweep-review, and binder-page-review surfaces resolve native identity before separately labelled English; nested set metadata is isolated from card-level provider fields so an English card name cannot leak into a set title. The 49 Simplified-Chinese, 77 Traditional-Chinese, and 11 Japanese editorial set translations are active through the owner-approved, native-name-bound runtime gate. The 3,254 Wikidata species mappings remain inactive, and the 26 automatically collected official-site title records remain red and removed. Canonical/provider English, the pre-existing manual Japanese map, the green pinned-TCGdex supplement, and the approved editorial translations may supplement native titles, but editorial values never reach persistence-facing `english_set_name` or `english_display_name`. Missing or failed card art and set marks render named, language-aware placeholders instead of empty boxes. Existing non-TCGdex set visuals are preserved at display time; the exact-host TCGdex mark guard cannot null unrelated stored catalogue URLs. Simplified- and Traditional-Chinese language-prefix aliases share one identity normalizer across catalogue, binder, search, and cache paths, and set-asset cache keys remain language-scoped. The 204-file local Japanese set-logo pack is active only through its manifest-bound owner-attested decision, and exact TCGdex Japanese/Chinese marks are active only through the HTTPS runtime allow-list. The current activation is runtime-only and performs no catalogue row cleanup, rewrite, image mirror, or database mutation.

The official Traditional-Chinese [card search](https://asia.pokemon-card.com/tw/card-search/) was also evaluated as a possible first-party set-name/release-date source. Its [site terms](https://asia.pokemon-card.com/tw/policy/) reserve the site's content and prohibit copying, reproduction, transmission, distribution, and use outside the service, so it remains discovery-only unless The Pokémon Company grants Stackr separate permission. The official Simplified-Chinese site confirms that its complete card lookup is delivered through the Pokémon Card Member WeChat mini-program rather than a documented bulk web interface. Neither route currently supplies reusable English set names or artwork rights.

A second primary-source research pass on 2026-09-04 did not locate a public grant covering automated retrieval, persistent storage, and public commercial display as one bundle. That public-source result remains useful provenance, but it does not override the later owner attestations and recorded amber decisions for the bounded runtime routes in this document. TCGdex's [MIT database license](https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/LICENSE) supports the factual-metadata lane, while its [asset URL documentation](https://tcgdex.dev/assets) defines the provider delivery shape used by the separately reviewed card-reference and set-mark controls.

The owner attestations now authorize the bounded TCGdex runtime card-reference/set-mark routes and the manifest-bound Japanese logo pack without further permission challenge in this task. Gaps outside those exact routes still fall back to named native-language placeholders. A broader future agreement would be needed only for capabilities the attestation expressly excludes, such as permanent provider mirroring, bulk export, high-resolution delivery, or new unreviewed sources.

Simplified Chinese remains on the existing PikaQian/canonical lane; the pinned repository does not provide a Simplified Chinese dataset. `duanxr/PTCG-CHS-Datasets` was evaluated and rejected: its README limits use to non-commercial academic/research purposes and forbids redistribution, so it must not be ingested. The checked-in evidence recorded 977 strict image gaps; the fresh canonical audit records 227. Its 16,444 rarity/artist fields still require an authorized Simplified-Chinese source or reviewed first-party metadata.
