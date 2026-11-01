# Stackr runtime source of truth

Observed against main `0bf2e60222644682d600deb7cc0e94862fd2a71a` and production on 1 November 2026. PR #451 is merged as `d2c052ac2ae98470661f1ff283084257a4e4b408`; the final two published-logo mappings are in its bounded follow-up until merged and delivered. A passing PR is not an installed-phone result.

| Responsibility | Authoritative source | Client contract |
| --- | --- | --- |
| Card, set and Pokemon index identity | Versioned API at https://api.stackrtcg.com/v1 | Shared configured client and version-aware adapters; no per-screen identity store. |
| Public catalogue artwork | Approved published asset records in `api.asset_manifest`; immutable R2 objects at https://assets.stackrtcg.com | Select recorded original/derivative URLs. Do not construct rendition filenames or substitute hosts. |
| Collection holdings and valuation | Authenticated collection APIs and account-scoped summary/cache layers | Compact live reads remain usable when optional disk persistence stalls. Disk writes must not restore older account/version snapshots. |
| Authentication and private data | Production Supabase project `oakdbbzdqwurpjnoqhmu` | Keep collector boundaries, private uploads and existing policies. A missing public image is not a reason to broaden access. |
| API service | Railway behind the configured gateway | Origin authentication stays in place. Client consumers use the public configured contract. |

## Published logo and cover fallback snapshot

`lib/publishedSetLogoFallbacks.ts` reads the generated registries as a local snapshot of the published mapping, not a separately maintained provider catalogue. The production snapshot now has 280 exact logo and 43 exact cover URLs from the same production asset view used by the API. Of the logos, 134 select a recorded detail-page rendition; 146 retain the recorded original. Explicit old-to-new receipts reconcile 147 already-published replacements, preserving former pointers and all set/language identities.

`scripts/reconcile-published-set-assets.mjs` consumes captured evidence without network writes. Publication approval, exact set/type/hash, explicit supersession and unique delivery must agree. Unknown or ambiguous matches remain explicit. The generated evidence records that this pass used a database snapshot normalized through the unchanged API implementation, independently cross-checked against the public manifest; it does not mislabel the capture as a raw HTTP export.

The production capture only applies in the production runtime. Staging needs its own verified mapping and is not redirected to production. Crown Zenith Gallery aliases are presentation parents only. Covers cannot replace logos.

## Existing exceptions still to reconcile

| Consumer | Current exception | Remaining condition |
| --- | --- | --- |
| Binder and set presentation | Shared presentation selection prefers current published logos to saved pointers and recovers with bundled marks on failure. Published SoulSilver/Lost Link replacements, custom covers/name designs and magazine covers retain their roles. | The two repaired crops and six renditions were published and API-verified on 1 November; the matching local snapshot uses those same recorded URLs. Verify actual screen rendering. |
| Pokemon artwork and optional detail metadata | GitHub sprites and PokeAPI detail requests | The October31 four-record archive is verified locally but unpublished; its implementation/source-rights evidence must be recovered. Exact species/form mapping and publication remain open. The species index already uses the central API. |
| Missing foreign card artwork | Bounded TCGdex reference overlay after canonical fetch | Replace only with verified published assets for the exact language/identity. |
| Product images and legacy pricing | Supabase product records and the legacy Railway pricing route | Canonical sealed-product identities and matching gateway/auth/error contracts before switching consumers. |
| SVP1 native title | Completed on 1 November: exact original and three renditions published and selected by the configured API | Installed-phone appearance remains to check. Observed CDN cache is max-age=14400; the one-year policy is not claimed. |

These exceptions are explicit remaining work, not evidence that all app surfaces already use R2. The historical Stage 4 document describes the original Supabase baseline; it is not the current public delivery topology.

## Release evidence

- [Build63 feedback and release reconciliation](../audits/20261101/build63-reconciliation.md)
- [Collection and rendition repairs](../audits/20261101/collection-logo-reconciliation.md)
- [Published fallback reconciliation](../audits/20261101/published-set-assets-reconciliation.md)
- [Known artwork batch reconciliation](../audits/20261101/artwork-approval-reconciliation.md)
- [Owner continuation receipt](../audits/20261101/owner-artwork-continuation-approval.json)
- [Shared repair queue](../audits/20261010/repair-queue.json)

The October 27 R2 closeout records 62,098/62,098 assets in its eligible scope. Preserve that completed migration; investigate new exact gaps rather than replaying it. Before another native release, reconcile each promised artwork batch and verify signed-in collection saves, removal/quantity changes, account switching, private uploads and actual API image selection. Public image samples alone cannot certify authenticated permission acceptance.
