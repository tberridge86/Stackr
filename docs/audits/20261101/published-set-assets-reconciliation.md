# Published set artwork source reconciliation — 1 November 2026

The reviewed client candidate's production fallback registry selects recorded R2 delivery URLs for **280 set logos and 43 Simplified Chinese cover images**. It previously rebuilt all those URLs under the configured Supabase storage host. This is a client mapping correction to already-published assets; no catalogue publication, permission change, asset rewrite, or database mutation was performed.

## Result

| Registry | Entries mapped | Delivery selection | Original consistency |
| --- | ---: | --- | --- |
| Set logos | 280/280 | 134 recorded detail-page URLs; 146 original-only URLs | 135 match the previously selected original hash; 145 explicitly reconcile already-published replacements |
| Simplified Chinese covers | 43/43 | Recorded original URLs | All 43 match the previous original hash |

All 323 recorded original URLs use `assets.stackrtcg.com`. No hostname replacement or fabricated storage/rendition path was used. The 145 replacement records comprise 139 English and six Japanese logos. Every replacement has the same canonical set ID and asset type, one currently published approved candidate, and an explicit previous-hash → current asset-ID/hash/URL record bound to its capture identifier and timestamp. Previous storage pointers remain available for rollback. Language, set code, membership, and ownership identities are unchanged.

The existing reviewed Crown Zenith override was moved into its generated registry row without changing its reviewed `dcc01afe…627c92` content hash. Crown Zenith/Galarian Gallery presentation-parent aliases retain their previous behavior. A cover remains a cover; it cannot fill a logo slot.

## Evidence basis

Source revision: `0bf2e60222644682d600deb7cc0e94862fd2a71a`. The resolver baseline is blob `ad80e3254c90180f19c72b1958d59f6d8493a75e`; the prior logo and cover registries are blobs `c6fe569522e982facf8f2b7860a156dec2fb538c` and `384790894d905a0acf6ec2f98b36118a74735c8a`.

The complete public logo-manifest page was independently read in the browser: 460 rows, no next cursor, request `9f2d9387-fe61-43ed-84e3-7d158e21c0a5`, generated `2026-11-01T19:17:52.795Z`. Browser export was unavailable. **The generated registry was therefore reconciled from a read-only production `api.asset_manifest` database snapshot normalized through the unchanged current-main `toCatalogueAsset` and `createPublicAssetStorageReaders` implementations. It is not a raw HTTP-response export.** The independently observed R2 public base and bucket were used by that existing normalizer; replacement paths were not invented.

The normalized logo capture contains 460 rows and is labeled `logo-readonly-db-snapshot-20261101`, generated `2026-11-01T19:22:16.322Z`. The cover capture contains the 43 exact existing set IDs with asset type `sealed_product_image`, labeled `cover-readonly-db-snapshot-20261101`, generated `2026-11-01T19:22:16.332Z`. Their source descriptions, revision and capture identifiers are retained in the generated registry evidence. Raw and normalized captures and the exact normalizer are preserved in `source-captures.json.gz`, with per-file hashes and extraction instructions in `source-captures-receipt.json`. Restore their documented relative locations under `work/reconcile-20261101/` to reproduce.

Public cross-check: the Crown Zenith manifest request `ac29aa70-95ea-441c-890c-bf68664250f1`, generated `2026-11-01T19:17:15.354Z`, independently returned the same approved asset ID, content hash and exact R2 URL as normalization. Its record declares 1710×664, 1,256,238 bytes and no derivatives:

`https://assets.stackrtcg.com/public/set_logo/ff9a66a8-eb6f-4f35-957d-32d6425fb826/38b2f73ebcefaa1937a018d658dc23cd393faf2dcb144a05e7064166fe1b6ab2/dcc01afe69d851972c3c5a05a64fb9c939d1a5df6906e8d0b4be33f682627c92/original.png`

This verifies the sampled mapping, not public GET/hash/decode acceptance of every generated URL. No full-population image download or phone performance measurement is claimed.

## Implementation and checks

Eight candidate files are isolated under `work/reconcile-20261101/current-main/`: the fallback resolver, the logo/cover/supersession generated JSON files, the local reconciliation generator, its runtime regression, and the two existing published-logo/Crown tests. The generator performs no network requests. It rejects unapproved, unavailable, wrong-set, wrong-type, wrong-hash, unrecorded-host and ambiguous deliveries. Different hashes require explicit captured supersession evidence. Detail URLs must be recorded by the same approved asset; paths are never extrapolated.

- Generator output: 280 matched logos, 145 explicit supersessions, zero unresolved; 43 matched covers, zero unresolved.
- Existing identity tests pass for all 280 logos and 43 covers. All nine Crown/Gallery/language/parent regressions pass.
- Actual-module delivery tests pass, including exact matching, rejected mismatches, recorded rendition selection, immutable inputs, explicit supersession guards and environment isolation. Unchanged main fails the recorded-central-URL regression.
- Independent final review reran the full narrow suite and checked all 145 supersessions against the captured exact asset ID, same set/type, new hash/URL, approved/available state and preserved previous hash/language/code. No actionable findings remained.
- New regression runs inside the existing `test-published-set-logo-fallbacks.ts` entry point, already reached by `test:integration-repair` in platform CI.
- Candidate resolver/test and actual-main runtime-config semantic diagnostics: zero. This is a focused TypeScript check, not a full-main application build.
- Direct lint in the old partial checkout reported its missing current-main `mobileRuntimeConfig` dependency and an existing CJS `__dirname` configuration mismatch. Those results are not represented as a clean full-main lint run. Root owns integrated CI.

After applying the candidate to current main, reproduce from the repository root using the retained captures:

```powershell
node scripts/reconcile-published-set-assets.mjs logos lib/generated/publishedSetLogos.generated.json work/reconcile-20261101/current-main/logo-manifest.normalized.json work/reconcile-20261101/reproduced-logos.json lib/generated/publishedSetAssetSupersessions.generated.json
node scripts/reconcile-published-set-assets.mjs covers lib/generated/publishedSimplifiedChineseCovers.generated.json work/reconcile-20261101/current-main/cover-manifest.normalized.json work/reconcile-20261101/reproduced-covers.json
node --import tsx scripts/test-published-set-logo-fallbacks.ts
```

## Scope and remaining source exceptions

Recorded production mappings are selected only in the production runtime. Staging retains its own existing storage pointers until separately reconciled; production evidence cannot redirect staging. Bundled artwork remains available: 36 custom binder covers, nine custom name designs, reviewed local set marks and magazine covers are unchanged. Binder-grid consumers still prefer local marks where available; this change does not alter that UI precedence.

Other source exceptions remain explicit: Pokédex grid/detail artwork uses GitHub sprites, detail metadata can query PokeAPI, and controlled missing-art TCGdex references remain a bounded runtime fallback. The Pokédex species index itself already uses the central API. Product records still come from the app's Supabase product tables and its legacy pricing route; the old TCGCSV product-media function currently returns no results pending canonical sealed-product identities. This repair does not establish complete app-wide source consolidation or authenticated-device acceptance.
