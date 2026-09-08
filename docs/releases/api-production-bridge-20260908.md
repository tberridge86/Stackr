# Production API bridge for owner iPhone testing

The bridge uses `tberridge86/Stackr` and the existing production services: Cloudflare `api.stackrtcg.com`, Railway `pocketvault`, and Supabase `oakdbbzdqwurpjnoqhmu`. Staging (`lmwfhvexfcoyeuoyrlco`) is a comparison source, not the phone's data destination. Existing dirty worktrees are preserved.

## Captured data compared

The read-only comparison found equal published membership in production and staging: **751 set records, 56,964 printings and 75,797 variants**. Of those variants, 75,677 have finish codes in both environments. Membership counts include incomplete sets; they do not mean every card has art, a price or a translation.

Production already contains all **513 approved staging set visuals** by exact asset ID (295 logos, 173 symbols, 45 covers). Current-version links also match. Sparse set artwork is therefore not repaired by recopying staging. Production has more populated English metadata than staging; replacing it would lose existing work.

Following the earlier 3,908 official Japanese image recovery, this bridge adds the existing approved `pokedata_japanese` image source and **129 exact Japanese images with 129 current-version links**. The set distribution is M3: 4, M1L: 26, CP1: 22, CP2: 18, M2a: 5, M5: 11, M-P: 6, M1S: 33, M2: 3 and S10a: 1. A fresh production API read verified M5/Abyss Eye at **70 image-bearing variants out of 118**. Execution counts and rollback identities are recorded in [the promotion receipt](../../deploy/evidence/api-bridge-pokedata-20260908.json); its execution status is authoritative.

The transaction requires a single current Japanese version, exact set/printing/variant membership, matching language/collector/finish, an approved image source and public asset policy, and no existing target image/link. It inserts only recorded IDs. No storage object, existing asset, catalogue version or model index is replaced.

## Search repair

Variant-specific names and provider identifiers now fetch their exact variants without a second request that expands sibling finishes. Printing-only names still return published finishes, and mixed variant/printing requests run their independent reads together.

The same regression checks found that name-plus-set searches converted records to API-shaped results and then discarded them during deduplication. The deduplicator now recognises the API variant ID. Tests cover exact provider IDs, aliases, names with set codes, fuzzy names, printing-level finish expansion, mixed identities and language boundaries.

Baseline production samples before this repair: uncached English Pikachu search (19 results) 2,875 ms; Bulbasaur 1,184 ms; Prismatic set lookup 410 ms. `Pinsir sv08.5` returned a gateway timeout in a separate sample. These are individual operational observations, not a device benchmark or a guarantee of later latency.

## Existing phone and recognition release

The compatible owner iOS update remains `01a082ae-63af-7253-a903-de306a2a5c65`, runtime `1.0.3-owner-recognition-v1`, on `owner-recognition` for TestFlight 1.0.3 (27). Backend and catalogue changes do not require another native build or identical app/server commit IDs.

This owner profile already enables the Stackr API, image fallback and private recognition. Settings → Private recognition and the flask action in Scan reach the private SigLIP workflow: photo, candidate review, language/set/collector/card/finish correction, then private teaching upload. The deployed private gallery contains 48,011 reference entries. Reference smoke results do not establish camera accuracy; corrections do not automatically retrain or promote a model.

The existing 81 magazine covers, shared UI, English presentation, collection-loading repairs and supported private price refresh remain in the served iOS update. The unpublished batch Scan workspace is a separate navigation/inventory integration and is not imported from the older dirty scanner tree, which also removes released owner components.

## Remaining gaps

- 750 Simplified Chinese image candidates share bytes with Traditional Chinese assets without positive printed-language evidence; they remain held. A source language path alone is insufficient to decide which artwork to serve.
- 15 eBay rows belong to a private recognition-evidence source, not an approved public catalogue image source. Other excluded staging rows have unpublished, mismatched or duplicate identities.
- Card imagery, English names/rules and set artwork are still incomplete. The bridge does not invent missing translations or silently substitute a different card language/finish.
- The owner provider price refresh currently supports proven TCGdex normal-card identities in raw near-mint GBP scope. It is an estimate with provider timestamps, not verified sales or universal live pricing.
- Generic experimental scanner models and seller/batch mutation flows remain separate. Commerce fulfilment stays disabled. Device loading, scrolling, camera accuracy and signed-in refresh still require iPhone acceptance.

## Validation and rollback

Focused search and API integration checks, backend type checking, lint and the protected release workflow validate the code. Final production probes and workflow IDs belong in the release receipt. For artwork rollback, delete only recorded current-version pairs, then inserted asset IDs, then the new source only if it has no remaining references. Do not delete by set or provider predicates.
