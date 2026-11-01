# Build 63 feedback reconciliation: performance and delivery consumers

Reviewed 1 November 2026 using the performance specialist brief and audit protocol. Current remote main is `0bf2e60222644682d600deb7cc0e94862fd2a71a`; the inspected PR #451 candidate is `d258004a2adc56ca6c5b8b05ad3c0d9890e62770`. Source files below were read through GitHub at that candidate, not inferred from the dirty, older `D:/Stackr-1` checkout. Implementation is isolated under `work/reconcile-20261101/build63-performance/`; the original checkout source remains untouched. Root owns integration, full checks, queue and release actions.

## Prioritized bounded findings

| ID | Priority | Current behavior and evidence | Smallest repair / status |
| --- | --- | --- | --- |
| B63-BINDER-SOURCE-01 | P2 | `app/(tabs)/binder.tsx:540-541` suppresses the URL whenever a bundled mark resolves. `components/BinderArtwork.tsx:82-90,250,301` also selects local artwork before an explicitly supplied logo URL. Thus the new published rendition can remain invisible on binder surfaces. `getBinderLogoUrl` at line203 also selects a persisted saved URL before the current shared lookup. | Prepared and independently reviewed: shared `getSetArtworkPresentation` in existing `localSetArtwork.ts`, used by grid labels and BinderArtwork. Current canonical lookup wins over saved/local ordinary marks; bundled absence/error fallback, custom/magazine roles and two reviewed crop exceptions remain. |
| B63-PRODUCT-URL-01 | P3, dormant defect | `lib/productSearch.ts:214-216` derives `_400w` from `_200w`, at both product fallback and media enrichment. No returned metadata establishes the fabricated object exists. Crucially, `lib/pricing.ts:899-923` currently returns no sealed-product provider rows until canonical sealed identities exist; this is not an observed current network failure or latency bottleneck. | Prepared: remove the rewrite and retain the exact supplied URL in both image fields. Existing explicitly stored `image_large_url` survives when no provider replacement exists. No identity, price, provider activation or database changes. |
| B63-SOURCE-EXCEPTIONS-01 | Explicit remaining contract work | Pokemon species art still uses GitHub sprites/official-artwork URLs, with optional PokeAPI detail metadata; products still use `market_products` and legacy pricing; missing foreign card art still permits the bounded controlled TCGdex overlay. | Do not label all app artwork/data centralized. Exact species/form publication and canonical sealed-product identities are prerequisites to those consumer changes; the artwork specialist owns supplied-source reconciliation. These are not fixed by rewriting URL hosts. |

`productSearch.ts` at d258 has blob `21d73d5f4e96bee1e6d6e9532f3c4a28aa5cba50`; `pricing.ts` is `6808626d657a3c9c1dd37959226e222f10fb806a`; binder screen is `95d2e3ad8d1c9cc4868f220697aacf4df08f877d`; BinderArtwork is `db86e94b87a50a12f5c217d9e5ab3c5493f91f07`. These paths match main; PR451 has not already resolved their source-order/URL behavior.

## Historical feedback reconciled against source

Issue [304](https://github.com/tberridge86/Stackr/issues/304) remains the phone acceptance register. Issue [434](https://github.com/tberridge86/Stackr/issues/434) requires real shared-lifecycle adoption, five-language correctness, request/deadline/account tests and measured cold/warm rendering. Neither is closed by a new URL or green workflow.

| Historical requirement | Present source evidence at candidate | Remaining evidence |
| --- | --- | --- |
| Cold public reads must not wait forever on device storage | `lib/stackrApiV1.ts:700` retains the optional 25ms device-ID budget; `lib/resilientCatalogueRead.ts` owns cancellable bounded shared reads. | Installed cold/warm journeys; 25ms is a configured budget, not measured device performance. |
| Home should expose facts independently of price/local extras | `features/home/HubScreen.tsx` contains progressive complete/partial facts, independent prepared valuation and request/account publication guards. | Signed-in actual collection completeness, save/remove/quantity/account-switch and measured first useful content. Old Home handoffs marked local-only are not proof this code is absent. |
| Pokédex cold cache must not block first page | `app/(tabs)/pokedex.tsx:80,310` retains optional 25ms cache handoff and complete-only persisted results; species index is central API. | Phone startup/network and supplied species artwork selection. |
| Pokédex ownership/pagination must be complete and recoverable | `lib/pokedexCollection.ts:423,499-504,537-593` retains incomplete/error progress, separate ownership read budget, cursor checks and empty-page completion rather than treating a short page as terminal. | Actual account-scoped ownership, partial Retry and declared population. Historical 16-result Wartortle sample is not proof current code stops at16. |
| Search must work from first interaction and retain honest errors | `app/(tabs)/search.tsx` retains early cached results, current-request suppression, independent sources, continuation status and partial-result wording. | First-attempt query and rapid query/account/retry phone tests. Nonempty public search samples alone do not close the historical failure. |
| Saved binder totals and art must survive navigation | Current binder screen, shared artwork recovery and existing tests retain known totals/source identity and exact saved-card recovery. PR451 adds optional summary persistence ordering and declared logo renditions. | Installed standard/master denominators, quantities, images and cold/warm rendering; no new broad loading defect demonstrated by this bounded read. |

Named existing regression coverage is tracked in main: `scripts/test-client-card-retrieval-runtime.ts`, `test-home-startup-runtime.ts`, `test-pokedex-cache-handoff.ts`, `test-pokedex-ownership-bounds.ts`, `test-pokedex-partial-results.ts`, `test-search-settlement-runtime.ts`, `test-binder-library-progress-runtime.ts`, and `test-binder-library-value-recovery.ts`. The current package already wires `test:build60-feedback`, retrieval, saved artwork and search recovery tests. Their existence is source evidence; this pass did not rerun every aggregate.

The Build55/Build60 handoffs and many queue entries contain historical local/unreleased flags. They must not be replayed wholesale over later merged work. Root has separately observed successful29October native and gateway workflows on current main and is reconciling actual Build62 delivery. This report does not independently attest Expo/Apple processing or installation. The dated PR451 reconciliation already distinguishes merged PR439, completed eligible R2 migration, source-identical PR203, resolved PR204 file transfer, and overlapping PR436. Preserve narrower current evidence rather than treating open/stale PRs as automatically missing code.

## Product patch and validation

Candidate files:

- `work/reconcile-20261101/build63-performance/lib/productSearch.ts`
- `work/reconcile-20261101/build63-performance/scripts/test-product-image-delivery.mjs`
- Exact remote baseline retained under `work/reconcile-20261101/build63-performance/baseline/`.

From repository root:

```powershell
node work/reconcile-20261101/build63-performance/scripts/test-product-image-delivery.mjs
```

PASS. The test transpiles the actual complete module and invokes public search/list/detail functions with synthetic dependency fixtures. It covers lower/upper suffixes, query/fragment preservation, opaque immutable URLs, null, product identity, and retention of explicitly supplied large imagery when the provider has no result. The same test against the saved baseline fails on `_400w.jpg` versus the recorded `_200w.jpg`, proving the regression. These are local public-function tests, not live API/network checks.

Independent artwork/reviewer agent reran the test and reviewed the two callers: no actionable finding. Suggested existing CI hook: append `node scripts/test-product-image-delivery.mjs` to `test:integration-repair`; root owns package changes and full typecheck/lint.

| Candidate file | SHA-256 |
| --- | --- |
| `lib/productSearch.ts` | `aa3c406c929fcbd6969b3f64978ecbb1e1fc3713d44fb1e79c8fa15b5ed2b0ac` |
| `scripts/test-product-image-delivery.mjs` | `ed141623bfbec474638b1cc9e4666e999a6267e20d3bd8ce4bff466924162186` |

No deployment, remote write, image publication, price refresh, performance benchmark or phone verification was performed by this pass. No measured speedup is claimed. Build63 should carry the reviewed source corrections while retaining explicit artwork/identity and installed-device acceptance gaps.

## Binder selection repair

Additional changed files in the same isolated candidate: `lib/localSetArtwork.ts`, `app/(tabs)/binder.tsx`, `components/BinderArtwork.tsx`, and `scripts/test-binder-artwork-source.mjs`. Existing canonical lookup and production/staging mapping boundaries are unchanged. No network layer, manifest refresh, host replacement or saved metadata mutation was added. URL-specific failure state lets a newer URI render even if an old callback reports failure; failed remote artwork recovers the existing local mark.

The artwork specialist verified real quality exceptions against main and the published capture:

| Exact set | Reviewed bundled original | Current published detail | Decision |
| --- | --- | --- | --- |
| SoulSilver L1b, `e8e16a23-fc7a-4ec8-abfe-b74448fa5f27` | 1000x472, SHA256 `7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383` | 720x600, different image | Preserve reviewed bundled crop explicitly. |
| Lost Link LL, `7dbeff79-cfb7-4ac8-8a4f-d7c73a523349` | 1000x541, SHA256 `f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add` | 720x407, different image | Preserve reviewed bundled crop explicitly. |

The existing Japanese exact lookup supplies language/code/name aliases; canonical UUID exceptions are scoped through the same Japanese language guard. Independent review found that a stale name on another UUID could select the wrong exception; this is corrected: explicit canonical UUIDs permit crop precedence only for the two exact reviewed IDs, including supported `ja:`/`jp:` prefixes. Added conflicting UUID/name/code tests pass. Unpublished Traditional Chinese marks retain local fallback. Explicit custom covers, magazine covers and custom name designs retain their separate rendering roles. This repair does not claim to publish the two reviewed crops.

`node work/reconcile-20261101/build63-performance/scripts/test-binder-artwork-source.mjs` passes. It executes the actual selection module, actual Japanese lookup/runtime URL policy and BinderArtwork renderer with local React/native fixtures. Assertions cover ordinary canonical/saved priority, denied provider handling, UUID/code/name crop exceptions, wrong-language rejection, absent/failed sources, late old errors and custom/magazine preservation. Substituting the untouched baseline BinderArtwork fails its canonical-selection assertion. React Native image decoding and physical phone appearance are not established by these tests.

The unmodified Japanese lookup and runtime policy were copied into the isolated tree to execute its tests; they are not changes to integrate. Root owns full application typecheck/lint and CI wiring.

Final independent re-review passed after the UUID correction; the reviewer independently reran the binder suite and found no remaining actionable finding. Remote baseline snapshots and the two unmodified dependency copies have been byte-checked against their exact Git blob IDs. Six runtime/test files are frozen for root integration:

| Additional candidate file | SHA-256 |
| --- | --- |
| `lib/localSetArtwork.ts` | `0aa13608ee42872c2255bd5c55bcf9c29b610aa707e28f09ad3072e02e133af7` |
| `app/(tabs)/binder.tsx` | `81cb78fe971bb019ea521968466303a41f20e0df766a811efab81f0c8bffcf96` |
| `components/BinderArtwork.tsx` | `3543151a92ebfdcfb2d7577c7752e62e23609968f4c328f619f4f8594d2f006d` |
| `scripts/test-binder-artwork-source.mjs` | `f44f00eeb101dd21f21fef18ffee306d27359559bb584872be808256337c2ef1` |
