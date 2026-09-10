# Captured artwork restored to production — 10 September 2026

**5,271 variants across 105 sets now have their captured artwork reconnected in production.** The source files were already in Stackr's Supabase storage. The public API now returns images for the previously image-less verification cards.

| Language | Restored variants | Affected sets |
|---|---:|---:|
| English | 4,809 | 93 |
| Japanese | 366 | 7 |
| Traditional Chinese | 96 | 5 |
| Total | 5,271 | 105 |

The [per-set restoration ledger](captured-artwork-restored-sets-20260910.csv) includes all **696 currently published sets**, including Simplified Chinese and Korean sets with zero changes in this repair. Zero restored variants means this repair did not change that set; it does not mean all its artwork is complete.

The fresh [696-set artwork coverage report](captured-artwork-coverage-20260910.csv), with [definitions and full identities](captured-artwork-coverage-20260910.json), counts 75,752 published variants: 51,289 have direct public variant images, 10,277 have explicit shared images in their current language publication, and 14,186 have neither. These are variant-level link counts, not unique cards or a pixel test of every image. Printing-only assets and cross-language references are excluded; the missing count must not be presented as the number of blank cards on screen.

## What caused these gaps

The ingestion pipeline had retained approved capture records with a `duplicate_content` marker when their bytes matched an image already stored. Some associated variants were still marked `available`, but had neither a public image of their own nor an explicit link to that stored image. The API correctly refused to substitute arbitrary sibling finishes.

The repair uses Stackr's existing `same_artwork_reference` model. Each selected capture has an identical recorded SHA-256 to a current published, approved image of the **same printing, set, language and collector number**. Artwork keys match, or the records are ordinary normal/holo/reverse-holo finish siblings. The original plus grid, search and detail objects exist for every candidate.

Only the variant's image status and explicit artwork pointer changed. All 5,271 original variant IDs, canonical identities, languages, collector numbers and finish codes were checked unchanged afterwards. Shared provider artwork represents the card; it is not a claim that the physical holo or reverse finish has a distinct photographed appearance.

## Production path and verification

Existing Supabase project `oakdbbzdqwurpjnoqhmu` remains authoritative: catalogue identity in `catalog.card_variants`, approved asset metadata in `catalog.assets`, immutable images in `stackr-catalogue-public`, and publication through the current catalogue snapshots. Railway serves these through Cloudflare at `https://api.stackrtcg.com/v1`. No service URL, bucket, source approval or publication membership changed.

The [deployment receipt](captured-artwork-recovery-receipt-20260910.json) records the pinned scope, all 16 successful batches and post-write counts. The first full transaction exceeded its time limit and rolled back completely; the zero audit count was confirmed before the smaller batches started. Production completed at **17:29:31 UTC**.

Public API checks cover English normal, Japanese reverse-holo and Traditional Chinese reverse-holo examples. Before repair all three returned no image; afterwards all returned the explicit image and retained their exact finish and language. Twelve original/derivative downloads decoded successfully and matched their recorded hashes. These samples have 600 × 825 originals/detail images, 240 × 330 grid images and 96 × 132 search thumbnails.

The [before](captured-artwork-before-20260910.json), [after](captured-artwork-after-20260910.json), and [cached request](captured-artwork-cached-20260910.json) receipts retain the measured results.

Observed initial post-repair card requests took **2,698 / 825 / 756 ms**. Later cached requests took **830 then 124 ms (English), 187 then 130 ms (Japanese), and 215 then 126 ms (Traditional Chinese)**. These are workspace measurements, not iPhone timings or a catalogue-wide latency guarantee.

The app preview successfully displayed Ascended Heroes and Totodile 041. Its first set request timed out; reloading succeeded. Fast cold loading is still unresolved. Browser screenshots remain in the conversation, not this public repository.

## Client fix included in the release candidate

An official binder's live catalogue image used to displace the saved row's image in the display fallback chain. The matched row now retains its own stored/captured image as a fallback if the catalogue URL fails. Grid, top-loader, graded and enlarged-detail displays use it. Existing identity matching and image-source policy remain enforced.

This client change is in the release candidate, **not a newly uploaded TestFlight build**. The production artwork links above are live independently of that client update. On an affected binder, use **Refresh catalogue** to clear the app's catalogue cache and request the updated records. iPhone confirmation is still pending.

Validation: binder catalogue/identity/image-fallback tests and app typecheck passed; app lint and changed-file lint have zero errors with existing warnings. The Japanese same-printing artwork tests, printing manifest tests, batch scope checks and production postconditions passed.

## Remaining artwork gaps

- Abyss Eye M5 **004, 015 and 019** have no captured image in either production or staging. Staging retains 24 approved metadata revisions for these cards, all with a null image. Current TCGdex checks for 004 and 019 also returned no image; the 015 recheck failed to connect. New source artwork is required.
- The 2,180 approved Japanese official images without current links belong to historical identities: none matched current published variants or printings. They were not attached to different cards.
- The previously identified Simplified Chinese image candidates still lack positive printed-language evidence; byte equality with Traditional Chinese images is not enough to publish them as Simplified Chinese.
- Existing logos, symbols, comic/magazine covers and all other captured source records were preserved. This card-art repair does not establish complete coverage of those categories.
- Full native visual, haptic, scanner and pricing acceptance remains separate; build 34 is still the last verified TestFlight release.

Rollback is recorded in [the exact compensating SQL](../../supabase/manual/rollback_captured_same_printing_artwork_20260910.sql). It uses this repair's audit IDs and refuses to overwrite later variant edits.
