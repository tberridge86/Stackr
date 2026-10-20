# Beta safety review — 2026-10-04

## Scope and evidence

This review covers the native dependency audit saved in `.tmp/native-dependency-audit.json`, the existing iOS static export in `.tmp/startup-ios-final-export`, and the current foreign-card presentation and artwork safeguards. It is a source/export review, not evidence from an installed iOS or Android build.

Relevant checks passed on the release checkout:

- `npx tsx scripts/test-edition-aware-image-selection.ts`
- `PRICE_API_URL=https://example.invalid node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-foreign-pokemon-cache.ts`
- `npm run test:tcgdex-controlled-card-reference`
- `npm run test:native-language-display`
- `npm run test:foreign-card-presentation`
- `npm run test:card-localisation`

## Native dependency audit

The saved audit reports 54 advisories: 34 high, 19 moderate, one low and no critical. This is an npm dependency-tree finding count, not a count of modules shipped in the mobile JavaScript bundle.

The high-severity chain is predominantly Node build, test, or configuration tooling: Expo CLI/config/prebuild, Metro and its file map/transform worker, React Native Community CLI, Babel/Jest, PostCSS, xcode and their `micromatch`/`braces`/`node-forge` dependencies. These are present for development and native build work; they are not application request handlers in the installed app.

The audit also reaches packages used by the installed application: `expo-updates`/`expo-manifests`, `expo-router`/`expo-linking`/`query-string`, `expo-constants`, and the direct Stripe React Native integration. The current iOS Hermes export contained no literal identifiers for the audited build-tool modules or for `expo-manifests`, `query-string`, and `decode-uri-component`. That is useful static evidence that the named JavaScript modules were not emitted as ordinary bundle identifiers, but Hermes output cannot prove non-reachability or native-module safety.

**Beta decision:** the audit does not establish an exploitable shipped-app vulnerability, and most findings are build-tool-only. It also cannot clear the runtime-facing Expo/update/router chain. Before treating the native package as security-cleared, verify the signed candidate on a device with an update check, deep link, notification startup, offline startup, and the normal Stripe entry path. Record the installed binary/version and any update manifest source used. This is an installed-device release gate, not a reason to claim all 54 advisories affect users.

## Foreign-language cards, English presentation and artwork

The implemented catalogue scope is English, Japanese, Simplified Chinese, Traditional Chinese and Korean. `EditionAwareCardImage` keys cached art by language and card identity, accepts only supplied catalogue/local exact-art candidates, and disables foreign-card fallback candidates and English visual patches. `StackrImage` applies the controlled-reference policy. A foreign card therefore cannot borrow English artwork or acquire an English edition overlay.

`foreignCardPresentation` only exposes English descriptive fields—rules, attacks, flavour text, evolution text and related details—from payloads marked `authoritative_matched_counterpart` or `reviewed_translation`. Plain English-looking provider fields are withheld. Where no authoritative counterpart or reviewed translation exists, the truthful state is **translation pending** while native identity remains visible. This is acceptable for beta; it avoids inventing English descriptions.

There is one presentation-semantic limitation: English card *names* may be derived from the reviewed local Japanese name/Dex mapping or explicit display-name fields, and `translationStatus` becomes `verified` when such a name exists even when no verified descriptive translation is present. The code still withholds unprovenanced descriptions, but that status must not be presented as proof that all card text has an authoritative English translation. Treat this as a wording/UI follow-up before making a broad "fully translated" claim.

The source has no verified stored-art route or reviewed controlled-reference policy for Korean. Korean artwork is therefore not demonstrated. This is a blocker only for a five-language native-artwork promise. It is an acceptable constrained-beta gap if Korean cards visibly remain without artwork when no exact Korean candidate exists; they must never receive an English substitute.

## Read-only staging guide check

At 2026-10-04, the staging `market.catalogue_general_prices` table contained 13,433 TCGCSV English general-guide rows (latest recorded at 08:48:55 UTC) and 6,720 Japanese rows (latest recorded at 2026-10-03 23:34:04 UTC). This confirms that the guide is being stored separately from owned-card valuation. It does not establish complete provider coverage, Cardmarket backup availability, or pricing accuracy for a particular printing.

## Remaining release gates

1. Test the signed candidate on physical iOS and Android devices: cold/warm launch, network loss, the five catalogue languages, missing-art cards, update/deep-link/notification routes, and the Stripe entry path.
2. Do not claim complete Korean native-artwork coverage until a stored Korean asset source or reviewed controlled reference is implemented and exercised.
3. Do not claim all foreign card descriptions are translated. Keep the existing pending state for cards without authoritative counterpart or reviewed translation.
4. Resolve or qualify the `translationStatus: verified` name-only wording before marketing the foreign-language experience as fully verified English text.



## Defensible constrained-beta stopping point

The user authorized a **truthful constrained catalogue beta** as the next TestFlight stopping point. Signed-artifact and server checks gate upload; handset checks remain acceptance work to perform on that beta before any general release. It must not be presented as complete provider coverage, complete artwork coverage, or complete English translation coverage.

The current source evidence supports these beta behaviours:

- General guide prices are separate from owned-card exact valuations. A card with no stored guide quote can remain unavailable or stale with its source/update state; it must not trigger a fabricated exact, condition, finish, grade, or sold price.
- TCGCSV stored-guide coverage exists for some English and Japanese catalogue rows. The 4 October staging read recorded 13,433 English and 6,720 Japanese guide rows. These are row counts, not a claim that every published card or provider product is covered.
- Cardmarket now has 9,224 reviewed mappings and 9,223 fresh production general estimates. A real production backend service-role read proved the general fallback and exact-mode exclusion. Coverage remains incomplete and the public guide is never holdings or exact finish/condition evidence.
- Native artwork is exact-language only. Missing foreign artwork may be visibly absent; it must not fall back to an English rendition. Korean still lacks verified stored-art/controlled-reference evidence.
- English descriptive text is only shown with authoritative-counterpart or reviewed-translation provenance. Cards without it remain translation pending. Name-only display derivation does not prove a full English description.

The current iOS EAS store build `dbbc2425-0788-4c98-b289-d5d860da4b26` is **FINISHED**, with its immutable signed artifact verified locally. It targets iOS, app version/runtime `1.0.5`, build `52`, and commit `b516cb7d529d8f764cb27380d2c975d0f736856f`. The artifact passed version/runtime/bundle and exact-video verification. Apple delivery state is recorded separately in the final release receipt.

The backend production dependency audit (`npm --prefix backend audit --omit=dev --json`) now reports four moderate findings, no high and no critical findings. They are the Jimp image-processing chain: `jimp`, `@jimp/custom`, `@jimp/core`, and `file-type`. This is a dependency report, not proof of exploitability. The earlier native audit remains a separate evidence item: its 54 findings are primarily Expo/Metro/Jest/CLI build tooling, but runtime-facing Expo update/router paths still require handset validation.

The beta upload stopping point requires signed-artifact, server and recurring-guide checks. The following installed-device checks remain required acceptance before a general release:

1. EAS reports the build succeeded and exposes its immutable artifact/build identifier.
2. One iOS and one Android physical-device pass covers cold and warm launch, offline launch, update check, deep link, notification startup, and the Stripe entry route.
3. Representative English, Japanese, Simplified Chinese, Traditional Chinese, and Korean cards are checked for native identity, artwork language isolation, missing-art behaviour, source/update labels, and translation-pending behaviour.
4. The release notes state the actual guide source coverage and exclude claims of all-card pricing, all-language artwork, Korean artwork parity, or fully translated foreign descriptions.

These criteria intentionally permit missing-provider products, unmapped prices, unavailable artwork, and pending translations to remain visible as gaps. They do not permit silent failure, cross-language artwork substitution, invented English descriptions, or an unlabelled estimate presented as an exact valuation.
