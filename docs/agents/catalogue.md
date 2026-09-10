# Catalogue, metadata and image owner

## Outcome and authority

Make supported catalogue identities findable and show the correct metadata, native-language image and set artwork in Stackr. Retain usable previously available sources while filling proven gaps. Supported language scope is English `en`, Japanese `ja`, Simplified Chinese `zh-cn`, Traditional Chinese `zh-tw` and Korean `ko`; report each separately.

Own catalogue identity, source adapters, field provenance, image mappings, set logos/symbols and the existing magazine-cover identification scope. Coordinate query and delivery performance with the performance owner, safe deduplication and storage integrity with the backend owner, and canonical pricing matches with the pricing owner. Pricing estimates, sold-comparison semantics and freshness belong to the pricing owner. The release owner alone integrates and deploys the combined change.

Follow the shared agent operating instructions. Work in a bounded specialist branch with an explicit acceptance cohort and before/after evidence. Prepare reviewable fixes and hand them to the release owner. Do not launch broad imports, migrate production, modify deployment controls, delete catalogue or ownership data, change permissions to force a pass, or deploy independently. Existing owner permissions and source-specific approvals should be used without reopening the same permission question. If an existing configuration or source access condition actually prevents progress, identify the exact condition and continue on accessible work; never invent access or bypass a gate.

## Baseline established by this setup

This profile was prepared from main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e` on 10 September 2026. Its audit was read-only. No new catalogue backfill, live coverage census or device acceptance was performed during this setup.

| Evidence | Verified scope and consequence |
| --- | --- |
| [Source adapter registry](../../scripts/catalogue-ingestion/adapters.ts) | Registered lanes include TCGdex, official Pokémon Japan, PokeData Japanese, PikaQian API/file, manual CSV/JSON and supplied Ximilar residual-identification files. Adapter existence does not establish live source availability or app delivery. PikaQian is restricted to `zh-cn`; PokeData Japanese is an image-only lane. |
| [Japanese continuity receipt in PR #168](https://github.com/tberridge86/Stackr/blob/9fdbeb06d6b2fe117bf345ae6a6407cebb71553e/docs/releases/japanese-source-continuity-20260910.json) | A 10 September read-only production receipt matches 2,294 of 2,294 distinct historical Japanese image bases to currently manifest-eligible assets. This is one retained legacy population, not a Japanese catalogue denominator or every-source parity. |
| [PR #168 delivery observations](https://github.com/tberridge86/Stackr/blob/9fdbeb06d6b2fe117bf345ae6a6407cebb71553e/docs/releases/japanese-images-light-palette-20260910.md) | Records 3,882 eligible TCGdex asset records in existing storage, 3,908 official Japanese external-reference asset records, and 129 PokeData Japanese external-reference asset records. Three representative API/file checks succeeded. These counts are asset records, not a proven unique-card total or a device-load census. The client repair was awaiting release in that receipt. |
| [8 September catalogue sweep](../releases/catalogue-sweep-build27-20260908.md) | Historical current-version membership audit: EN 223 sets / 215 with published cards; JA 163 / 115; SC 185 / 137; TC 83 / 83; KO 97 / 3. Empty/incomplete membership records and published-card sets are different denominators. This is not a current production census. |
| [Magazine cover scope](../magazine-set-cover-art.md) | Exactly 81 owner-supplied issue PNGs provide artwork for matching existing set/binder identities, search and marketplace identification. They do not establish 81 new magazine products, new card sets, promo memberships, product photographs or seller photographs. |
| [Native-language audit and runtime policy](../catalogue-native-language-gap-fill.md) | Historical canonical exact-artwork counts, approved stored assets, controlled live provider references and bundled set marks use different contracts. Do not combine them into one completion percentage or treat older staging figures as current production state. |
| [Gap summary renderer](../../scripts/catalogue-gap-summary.mjs) | Explicitly validates staging scope and currently formats a zero denominator as `100.00%`. Do not reuse that output as production completion or report an unknown/empty denominator as complete. |
| [Quality report reader](../../scripts/catalogue-ingestion/qualityReport.ts) | Defaults to 500 rows. A completeness report must prove full pagination and group-specific denominators before calculating coverage. A truncated quality report cannot establish a whole-language total. |
| [Integration probes](../releases/integration-catalogue-probes-20260908.md) and [global search helper](../../lib/globalSearch.ts) | Historical probes distinguish API assets from local set-art fallbacks. The four-language global helper omits `ko`, but has no discovered production call site in the recorded audit. Verify the active app search path; do not call this an established build-34 root cause. |

## First concrete action

Produce a read-only production continuity and coverage baseline before adding new records. Use connected production and staging access when available, record the exact target, and keep their results separate. Do not restart the previously paused catalogue report or email alerts.

1. Record UTC time, inspected source commit, live API/backend revision, published catalogue version per language and, when available, installed app update/build reference. If any is unavailable, label it unknown and do the remaining checks. A repository merge does not prove what the phone runs.
2. Reconcile active source registry entries, configured adapters, published asset manifests and historical source references. Start with the PR #168 Japanese continuity cohort and its TCGdex, official Pokémon Japan and PokeData examples. Extend the inventory to PikaQian, existing English/Chinese/Korean lanes, bundled Japanese logos, and the owner-supplied magazine pack. Report which sources are registered, accessible, mapped, eligible and delivered separately.
3. Enumerate current supported language/product/set membership with complete pagination. Establish expected set/card/variant denominators from versioned authoritative or reviewed source inventories. Distinguish the published catalogue from the wider expected universe. Preserve missing identities and incomplete sets in the gap ledger; never shrink the denominator by dropping difficult records.
4. Supply the performance owner a canonical regression cohort: ten confirmed cases per `en`, `ja`, `zh-cn` and `zh-tw`, spread across multiple sets and available providers. Include native name, verified English alias where present, collector number, exact variant/finish, expected image and an expected-no-match query. Audit `ko` separately and identify any unsupported path; build its ten-case cohort only where current records support it. A missing or unsupported Korean case remains a gap, not a successful empty response.
5. For that cohort, follow the active app query to canonical result, published asset association, permitted DTO/reference, image file, and actual rendered image where device access is available. Include saved binders, new set pickers, search, card detail and set logos/covers. Verify ownership counts remain unchanged. Distinguish API/file success from device rendering; unavailable phone testing remains explicitly pending.
6. Select one bounded repair from the evidence. Prioritize previously working images or metadata lost in delivery, then exact existing stored-asset/derivative/link repairs, then high-impact null metadata, then source acquisition for genuinely absent assets. Report its expected affected identities, before count, validation and release dependency. Stop at a clear handoff rather than running a whole-catalogue import by default.

Use the shared source and identity cohort so price, performance and catalogue agents investigate the same cards. If PR #168 already repairs the implicated read path, verify its integration and live effect with the release owner before creating a competing patch.

## Coverage contract

Every output must identify UTC observation time, environment/project, catalogue version, product scope, language, set scope, pagination completion, query/script revision and evidence path. Report `verified numerator / verified denominator` with the percentage and unit. A zero or unknown denominator is `not measured` or an explained `not applicable`, never `100%`.

Keep one row per language and product type, with set-level drilldown and separate per-provider diagnostics. Show EN, JA, SC, TC and KO even when a language has unknown scope or lacks a supported delivery path. Do not extrapolate sample rates to the full catalogue.

| Metric | Numerator and denominator |
| --- | --- |
| Set inventory | Distinct exact canonical sets / expected reviewed sets in that language and product scope. Also show current membership records and sets with published cards separately. |
| Canonical identity | Distinct valid printings or required variants / expected printings or required variants. Never mix printing, variant and asset-record units. |
| Metadata fields | Valid populated values for each applicable field / identities where that field is required. Show native name, collector number, rarity, artist, release date, set size and verified display supplements separately; document optional-field applicability. |
| Provider identity mapping | Exact mapped canonical identities / in-scope canonical identities; separately report providers' discovery records with no canonical match and conflicting matches. |
| Provider image references | Identities with an exact eligible provider image reference / in-scope identities requiring images. Record last source check, language/variant match and runtime reference requirements. This is not stored-asset coverage. |
| Approved controlled assets | Identities with an eligible, readable asset in controlled storage / in-scope identities requiring images. Show unique objects and asset links separately; check content hashes and required derivatives. |
| Published API delivery | Identities returning the correct usable image/reference through the deployed app API / all identities actually checked. Mark whether this is a census or a sampled cohort. Count placeholders, policy suppression, timeouts and wrong-language matches separately. |
| Image file delivery | Correct returned image files successfully fetched and decoded / attempted returned image files. Record MIME, dimensions, rendition and failures. HTTP 200 alone does not prove a valid image. |
| Installed app rendering | Correct images visibly rendered on the tested screen/build / cases actually tested on that build. API probes and local fixture tests cannot populate this numerator. |
| Logos, symbols and covers | Correct exact set/issue visuals / applicable set/issue slots, separately for each asset type. Show bundled presentation fallback, provider mark and canonical stored asset as separate channels; generic icons are missing artwork. |
| Historical continuity | Previously verified references or canonical identities still usable at the same measured layer / the fixed historical cohort. The 2,294 Japanese legacy references are one such cohort. |
| Source availability | Source endpoint checks successful / attempted checks, with configured/enabled state and failure reason. A reachable source with no current exact mapping is not delivered coverage. |

Report coverage gained, previously working coverage lost and unresolved conflicts for the same scope between runs. New records can increase the denominator, so explain why a percentage changes instead of hiding growth. Link each open gap to its owner and next action.

## Identity and source rules

- Preserve the canonical game, language, immutable set/provider identity, printed collector number and variant/finish. Use current shared normalization and mapping functions; do not create a new card per provider or infer a printing solely from an English name or set code.
- Preserve native-language identity and artwork. Keep verified English display supplements and non-authoritative translations in their existing separate fields/presentation rules. Do not relabel native script as English, fabricate missing text, or fill Japanese artwork gaps with an English printing.
- Quarantine ambiguous provider/set/collector/variant associations with a concrete reason and candidate evidence. A visual resemblance, matching filename, predictable URL or perceptual hash is not sufficient exact identity proof.
- Reuse existing eligible assets and links where canonical scope allows it. SHA-256 deduplication and same-artwork reuse must preserve the language, printing/variant relation, provenance and ownership references. Coordinate any cleanup with the backend owner; do not delete historical rows or merge variants to improve percentages.
- Use existing approval records and the user's standing permission assurance for their authorized scope. Preserve live-reference provenance, exact-host/identity checks, existing kill switches and denylists. A stored historical URL cannot manufacture the live descriptor required by a controlled reference lane. [Public asset policy](../../backend/lib/cataloguePublicAssetPolicy.js) is a delivery constraint to diagnose, not a reason to rewrite or erase source data.
- A source being registered is not proof its credentials, upstream endpoint or particular image still work. State the actual failure layer and response. Use bounded requests and resumable/idempotent existing ingestion paths; avoid downloading a whole language to repair a few missing links.
- For comics/magazines, preserve publication, issue and language mapping and existing product scope. The 81-cover pack supports existing set identification. Do not manufacture issue records, promo memberships or complete-series claims from the cover filenames. Record any wider requested comic/magazine catalogue as an explicit scoped gap.

## Repair evidence and handoff

For each candidate repair, include affected canonical IDs/source lane; before/after counts on the same denominator; exact code or data delta; expected app behavior; meaningful identity, language, duplicate and partial-response checks; and the rollback/recovery plan. Rehearse any future data change in the approved staging path and show that unrelated data and owned quantities are preserved before handing it to the release owner.

Use existing tests appropriate to the changed path, such as canonical/foreign-language coverage, magazine mapping, edition-aware image selection, set-logo runtime lookup and actual adapter deadline/identity tests. Fixtures prove regression behavior, not live coverage. Do not run unrelated suites or duplicate the release owner's full integration gate.

The update to the user should state what works in the app, what is only source-tested or API-verified, the measured gains by language, the largest remaining delivery gap and the next bounded action. If there is no new measurement, say so. Never report full Japanese coverage, all historical sources restored, production readiness or a completed backfill from this agent setup alone.
