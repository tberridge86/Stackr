# PDX-001 species identity repair and independent review

Observation: 11 October 2026. Work is local source/fixture preparation in the maintained integration checkout, reconciled with main `3d08536f7bd581ed1266f176c13640c0a712305f`. No database writes, deployment, main merge or installed-device claim.

## Existing fault and smallest repair

The published Pokédex snapshot contained 1,350 provider Pokémon routes, including alternate forms. The list used route IDs/names for National Dex numbering and progress, mixing species identity with metadata routes.

Replace the reviewed frozen index with one entry per official species. Keep the established endpoint, offline server snapshot, staged first-page/continuation loading and legacy `name`/`url` fields. Add explicit `speciesId`, `speciesName`, `routeId` and `routeName` to distinguish progress and catalogue searches from metadata/artwork routes. The current reviewed snapshot has 1,025 species; this is dated source evidence, not a permanent numeric cutoff.

The list uses species identity for ordering, numbering, region, ownership and deduplication. Navigation passes species identity separately from the exact provider route. Detail queries and its display use the selected species; metadata still uses the provider route. A legacy direct form route without the new parameters retains its existing exact form query. Reject old provider-only app caches rather than silently treating them as species snapshots. Preserve account/request generations, physical-inventory marker protection, persistence, navigation and retry controls.

## Source provenance

- Official `pokemon-species` response captured at **2026-10-11T15:08:47.000Z**: SHA-256 `cdfd6524c4b51d14b83088113553fdbc7ec9b2ca4673788ca47f9ae76bada479`. Temporary raw receipt is retained on D-drive; the source snapshot records the response provenance.
- Entry-array SHA-256: `a8e69cbfe2b97c49e24f9079c607db068b07977721d95a6e06b3a8fb5c26e03f`; index version `pokeapi-species-2026-10-11-a8e69cbfe2b9`.
- Metadata routes reuse the existing frozen provider snapshot captured **2026-10-09T08:37:03.454Z**, with content SHA-256 `b622b084c112dba5eb794340ba6aeefe1f54120619dc4ce7da6c290842ce6e8f`. Each species joins to the exact matching provider ID; absent joins fail. No suffix stripping or guessed exclusion threshold is used.
- Exactly three new official requests supported this repair: species list, Raichu default variety and Deoxys default variety. Deoxys keeps route `deoxys-normal`, species `deoxys`; Raichu species26 does not count Alolan Raichu as a second species. This does not claim every route was independently refetched.
- Server startup validates snapshot schema, required fields, unique increasing species IDs, legacy/route field agreement and entry hash. OpenAPI and generated TypeScript contract describe the touched response. The delivery verifier compares all six identity fields; its tests were fixtures, not a production verification run.

## Review correction and verification

Independent review initially rejected using default provider form names for catalogue queries: 37 provider route labels differ from base species names, including Wormadam, Giratina and Palafin. The corrected list-to-detail handoff now carries the species explicitly. Reviewer independently reran actual compiled screen/service controls and accepted the corrected scoped repair with no remaining P1/P2 finding.

Local verification passed:

- `test:pokedex-release`: species snapshot/route integrity, pagination, complete variants, facts-first loading and **15** actual-consumer account-boundary groups. The species regression is now part of this existing CI command.
- Actual list-to-detail handoff checks for Giratina, Wormadam, Palafin, Deoxys and both Nidoran identities, plus unchanged legacy direct-form behaviour.
- Cold retrieval: complete species continuation, mixed-index/truncated-page rejection, old cache rejection, retry and late/stale result suppression.
- Generated API contract and 43/43 documented-route coverage; localhost API fixture integration and mocked published-delivery verification, including corrupt species identity rejection.
- Application and backend TypeScript checks exit0. Final affected-file lint exit0, eight pre-existing warnings, no errors. Whitespace check is required before commit.

## Delivery boundary

This changes the backend response and mobile consumers together. It remains an unmerged release candidate until matching backend/app delivery is approved, source-attested and read back. The owner's installed build54 predates this bundle. iPhone 15 Pro, owner-reported iOS26.6.1 and 5G is the acceptance reference; no physical test or measured latency has been performed. Other Pokédex, catalogue, artwork and whole-app acceptance findings remain separate.
