# Catalogue follow-ups after TestFlight 54

This list records release follow-up work. It does not claim complete catalogue pricing, universal instant loading, or completed artwork/translation coverage.

The [9 October server delivery candidate](server-mobile-delivery-20261009.md) integrates the existing approved English-name runtime and first-party search, and adds an explicitly provisional server price fallback. It remains undeployed. Those local corrections reduce these gaps; they do not establish complete live coverage or replace the evidence below.

## Codex can continue to audit or implement

- **Prices:** Measure a bounded, reproducible sample of canonical raw-card browse results against the stored quote and local provisional-estimate paths. Check that every displayed fallback remains labelled `Estimated price (provisional baseline)`, low confidence, and never appears as a sale or current provider quote. Review and calibrate the rarity/era model only with approved evidence; retain stored quotes, account scope, and provider-request limits.
- **Artwork delivery:** Produce a current, identity-bound inventory of missing, cropped, and low-resolution visible assets without promoting or downloading replacements. Continue checking thumbnail-first loading, correct printing/variant association, and graceful retry behaviour.
- **English display gaps:** Audit unresolved native-to-English display-name or description gaps with provenance preserved. Do not overwrite native names or publish translations without reviewed source evidence. Correct the known published Trainer card **瑪俐** whose English display name is wrongly **Pikachu** only through the canonical review path.
- **Performance evidence:** Instrument and review representative cold/warm list, search, set-card, and Pokédex flows. Keep partial factual pages visible during later-page failures and report measured timings rather than claiming instant loading.

## Requires owner, provider, licensor, or real-device evidence

- **Provider-backed prices:** Approve any provider refresh, commercial source entitlement, or catalogue mutation before use. Obtain current provider evidence before promoting provisional values to market or completed-sale labels.
- **HD artwork:** Obtain rights-authorised original or HD source material, rights terms, and exact set/printing identity before acquisition or publication. The release record identifies outstanding HD artwork generally; it does not name a verified low-resolution example, so none is listed here.
- **Translations:** Supply or approve source-backed English translations where a factual native-name/display gap cannot be resolved from existing reviewed provenance. Translation of descriptive text needs its own review and rights basis.
- **Device acceptance:** Test the uploaded build on actual iPhone hardware: cold and warm launch, search, set-to-card loading, Pokédex pagination, ownership and account switching, image recovery, price labels, language/printing/finish identity, and accessibility. Record the device/OS, build, observed timings, failures, and Apple/TestFlight processing and tester availability.
