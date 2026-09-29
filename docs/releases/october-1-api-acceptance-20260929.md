# October 1 catalogue and API acceptance

Source inspected: `66531fc9dced77cae90407b5a853bdcea12319aa`. Public probes ran on 29 September 2026 through `https://api.stackrtcg.com`; production database is `oakdbbzdqwurpjnoqhmu`. This receipt does not establish phone rendering or whole-catalogue completion.

## Measured results

- **480/480 Storm Emeralda and anniversary printings:** paginated public set-card responses retain the expected canonical ID, language, set, printed number and native name. All 480 carry the corresponding frozen image SHA-256 and printing identity. This checks the API image references, not a fresh visual inspection or image-byte download of all 480.
- **12/12 individual detail identities and image references:** first and repeat requests agree. Artist/type/subtype comparison fails for all 480 set-card records, including the 12 details: production omits those fields even though the canonical records store them.
- The stored-details omission affects 42,115 published printings with a saved illustrator and 57,157 with a saved card type, across 57,436 published printings. Saved subtypes are present for 437. These are field-presence counts, not claims that every metadata field is complete.
- Of 12 selected-set search cases, 10 return the expected first result. The English letter-only Energy number `R` is rejected by the two-character query contract; Japanese `M6a-WAT` searched as `WAT` returns no match. Both cards remain accessible by exact card ID and set listing. These remain explicit search exceptions, not missing artwork or failed imports.

| API request | First request p50 / p95 | Immediate repeat p50 / p95 | Sample |
|---|---:|---:|---|
| Set page, up to 100 cards with artwork descriptors | 663 / 2,628 ms | 62 / 65 ms | 7 first pages, 4 repeats |
| Card detail | 314 / 538 ms | 53 / 107 ms | 12 identities, 24 requests |
| Search | 460 / 2,214 ms | 53 / 62 ms | 12 first attempts (one 400), 11 repeats; one empty result in each phase |

Timing ends after the complete JSON response is decoded. Percentiles use nearest rank over HTTP/API successes; correctness failures remain recorded separately. No shared cache was cleared, so “first” does not mean a proven cold server. This small diagnostic sample supports fast repeat API retrieval; it does **not** establish universal sub-0.5-second search, first loads or native rendering.

## Focused correction

The production `api.catalogue_cards` view has 31 columns. Staging already has five additional columns: `card_concept_id`, `concept_english_display_name`, `supertype`, `subtypes`, `artist`. The existing backend reads those fields and the fast set-card RPC serializes the view, so aligning the view delivers stored metadata through the existing Stackr API without provider calls or a second metadata store.

Migration `20260929073406_expose_published_card_details` reproduces the inspected staging definition. It appends columns, retains all original joins/publication filters, adds the existing nondeprecated concept-name lookup, and preserves view ownership, grants and `security_invoker=true`. No canonical metadata, artwork, holdings or prices are rewritten.

The existing protected deployment workflow gains the bounded `card_details` scope. It requires the exact merged main SHA and unchanged inspected definitions, rehearses both environments and rolls them back, compares every pre-existing published row with `EXCEPT ALL`, verifies stored-detail parity by language and checks the fast set-card RPC. It then applies only this migration to production and records its ledger entry and view readback. No unrelated release flags are accepted. Transaction failure rolls back; after commit, any reversal must preserve appended column types and existing dependent objects rather than dropping the view.

Local PGlite tests cover legacy row preservation, draft exclusion, deprecated concepts, DTO metadata delivery, the fast RPC, rollback, changed-baseline rejection and security/privilege drift. Live protected execution and post-deployment public re-probing remain required.

## Last-week integration scope and remaining delivery

Main includes the September 22–29 first-parent work in PRs #220–#249 and #251: Queue 1, Pitch Black identities and artwork, MEP, Pocket, Storm/anniversary metadata and fronts, printing-front readers, owner valuation and refresh fixes, selected-set and mixed-language retrieval, progressive search and saved motion preferences, recovered artwork and metadata sign-off evidence. Older logo, inspection and Master Set changes remain integrated through #210; stale historical branches must not overwrite newer main.

Artwork run [36535188734](https://github.com/tberridge86/Stackr/actions/runs/36535188734) is still uploading the approved 7,911 fronts/23,733 derivatives. Storage progress is not catalogue publication. The 4,250 excluded artwork cases and 94 sets without checklists remain unresolved. Railway backend/worker delivery and installed-device acceptance remain separate release gates.

Evidence: [all public probe results](october-1-public-api-acceptance-20260929.json), [stored-detail impact by language](october-1-stored-details-impact-20260929.json), [release queue](october-1-2026.md). PostgreSQL's [CREATE OR REPLACE VIEW contract](https://www.postgresql.org/docs/current/sql-createview.html) permits appending columns while retaining privileges and ownership.
