# Catalogue and identity improvement baseline — targets 1–4

**Observation:** 2026-10-11T11:12:01Z
**Source inspected:** `fcf697bab7785c3ed87747ed1721e9c033818557` in the maintained integration checkout
**Environment/device/network:** source and checked-in evidence only. No production request, emulator, installed iPhone, or network measurement was made for this baseline.
**Scope:** high-definition set logos, card artwork, language/English display correctness, and readable set labels. This is not a whole-catalogue census or a release claim.

## Delivery ledger

| Target | Baseline | KPI / coverage or sample | Evidence | Remaining gap | Delivery state |
| --- | --- | --- | --- | --- | --- |
| 1. Set logos | A manifest-bound Japanese logo pack is active at read time; the resolver also retains approved/provider and existing stored-logo paths. | Historical Japanese logo-pack audit: **177 / 394** current Japanese sets resolved (142 exact keys, 10 aliases, 25 unique code fallbacks); 216 no manifest-bound identity and one ambiguous `MG` were left unresolved. No current all-language logo census or iPhone readability check. | `catalogue-native-language-gap-fill.md:31,49,93,261`; `assets/rev2/11-japanese-set-logo/manifest.json`; `lib/pokemonTcg.ts:1177-1183,1214-1230,1467-1471`. | 100% supported-set coverage, logo dimensions at device pixel density, no-crop/no-blur verification, assistive labels, and current EN/SC/TC/KO denominator are unmeasured. | **Prepared/source implemented; historical audit reviewed; not deployed or installed-device verified by this report.** |
| 2. Card artwork | The client uses a grid rendition before detail/original fallbacks, and the source contains a bounded repair for an approved explicit same-artwork sibling omitted from a narrowed DTO. | Historical named audit: **5 / 5** card reads and scoped manifests usable; **11 / 11** fetched files decoded/hash-matched; the initial selector sample was **0 / 3** before the later local repair. The current source test covers five language fixtures, but was not run here. Whole-catalogue printing and language coverage are unmeasured. | `docs/audits/20261010/artwork.md:45-55,80-142`; `lib/cardArtworkPresentation.ts:39-80`; `scripts/test-master-set-artwork.ts:52-164`; `docs/audits/20261011/five-language-acceptance-cohort.json`. | No complete supported-printing denominator; no proof that detail images meet the 1,000-pixel target; no current API-to-rendered-screen or iPhone cohort result. Korean `SV4M 045` still reports `nativeImageStatus: missing` in the public cohort despite a recovered approved asset. | **Local source repair present; historical API/file evidence reviewed; unmeasured in current runtime and on device.** |
| 3. Language artwork and English translations | The app keeps native set/card identity primary and calculates English display separately; runtime set-translation gates keep editorial translations labelled and out of persistence-facing canonical fields. | Five independent public card identities were previously observed once each: EN, JA, SC, TC and KO (**5 / 5** identity fields in that small cohort); the TC negative control `SCA 120` remains a confirmed incorrect public English display (`Pikachu` for native `瑪俐`). Historical Japanese set audit: **266 / 394** active supplements (153 manual + 102 TCGdex + 11 editorial) and 128 unresolved. Chinese historical audit: **87 / 220** source-name-verified/current-rule rows, 40 source-name-unverified drafts, 93 without candidate. | `docs/audits/20261011/five-language-acceptance-cohort.md`; `docs/audits/20261011/five-language-acceptance-cohort.json`; `catalogue-native-language-gap-fill.md:31-73,209-223,261`; `lib/pokemonTcg.ts:1552-1607`. | The declared multilingual cohort has no actual search/detail/binder/device journey. Whole-catalogue card-name correctness and printing-specific native-artwork correctness are unmeasured. The known TC name mismatch must be resolved before cohort acceptance. | **Runtime design/source implemented; cohort sampled; known failure open; no device proof.** |
| 4. Understandable set labels | Where an English supplement is eligible, the runtime retains the printed-language name as primary and presents editorial wording as `English translation:`. Native-language placeholders are used when marks or art are absent. | Historical set-level evidence only: Japanese **266 / 394** active English supplements; Chinese **87 / 220** source-name-verified/current-rule rows. No review has classified every logo as unclear, nor tested larger text or screen-reader names. | `catalogue-native-language-gap-fill.md:31-73,261`; `lib/pokemonTcg.ts:1552-1607`; `components/search/SearchResults.tsx:269-272,410-411,673-677`. | The requested “all identified unclear logos” denominator is absent. Accessibility labels, Dynamic Type/larger-text legibility and screen-reader output are unmeasured. | **Presentation path/source reviewed; no accessibility or device acceptance.** |

## What the existing implementation already does

- `getPokemonSetLogoUrl` chooses a language-specific approved asset first, then a normalised set fallback and finally a published fallback. `getPokemonSetLogoOrSymbolUrl` preserves backend-provided logo/symbol values before those fallbacks. This is an existing display path, not proof that every supported set has a verified visual.
- Set output carries `localName`, `englishDisplayName`, and display name separately. The resolver receives language, set code, source identity and native name, so it has the information needed to avoid treating a translation as the printed identity.
- `resolveCardArtwork` accepts only approved, available, same-game/set/card artwork. Its explicit absent-sibling case additionally requires a matching `sameArtworkAsVariantId`, `imageVariantId`, `same_artwork_reference` status and ordinary shareable face; it renders as `shared`, never as an exact physical-finish image.

## Exact actionable issue and smallest safe next implementation

### CAT-ART-001 — validate the existing narrowed-DTO artwork repair against the three recorded production cases

**Existing element and issue.** The 10 October audit found that the historical client selector rejected an approved explicit same-artwork sibling when the card DTO included only the selected variant. The three named cases were EN Ascended Heroes `me02.5` Totodile 041 normal, JA Pokémon Card 151 `SV2a` ポニータ 077 reverse holo, and TC Terastal Fest ex `SV8a` 爬地翅 087 reverse holo. Their original/grid/detail files decoded and hash-matched, but the earlier selector result was missing.

**Current source state.** At the inspected revision, `lib/cardArtworkPresentation.ts:51-61` contains the smallest bounded acceptance condition for that exact DTO shape. `scripts/test-master-set-artwork.ts:52-164` includes five-language positive fixtures and identity, permission, conflicting-pointer and protected-special-finish negative cases. Git history attributes this source repair to `e8d0b3d7214c3dd8500ed200b0eafc2886676948`.

**Why this remains the next safe check rather than a new artwork import.** It reuses stored, approved assets and an existing selector. It neither changes catalogue records nor broadens language/finish matching. The remaining work is a focused regression run against the current source and, separately, a bounded public/API and installed-iPhone rendering check using the three exact audit identities. A result must remain `shared` for the referred artwork and must not enable special editions, stamps, alternate art, cross-card, cross-set or unapproved references.

**How to verify after implementation/check execution.**

1. Run `npx tsx scripts/test-master-set-artwork.ts` at the candidate revision; record its exit status and revision.
2. Fetch the three exact public card DTOs and their scoped manifests in a bounded read-only recheck; verify the selected variant pointers and one grid/detail/original candidate without writes.
3. On the declared reference iPhone/build/network, open each card’s grid and detail view. Record image dimensions/fit, language/set/collector/finish, visible shared-artwork meaning, and any crop/blur/failure separately.

This target is **not** a claim that the complete 100% artwork or 1,000-pixel requirement is met.

## Baseline limitations and next measurement order

The evidence uses different populations and must not be merged into one percentage: 394 Japanese sets for the bundled-logo audit, 220 Chinese set rows for English-supplement auditing, five positive card identities plus one negative control for the language cohort, and five named artwork controls from the independent audit. No all-supported-set or all-supported-printing denominator was enumerated during this work.

Safest next work, in order:

1. Run the existing narrow artwork regression, then independently review the source output and retain the result beside this baseline.
2. Produce a paginated, revision-labelled supported-set and supported-printing inventory per language before calculating targets 1–4 coverage.
3. Run the declared five-language cohort through search, detail and a reference iPhone, keeping the `SCA 120` negative control failing until its separate correction is genuinely released.

No app code, catalogue row, asset, provider setting, deployment, or live service was changed for this baseline.
