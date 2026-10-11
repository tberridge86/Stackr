# Resumed Stackr repair pass — 11 October 2026

Owner explicitly resumed production-readiness work. Source comparison: `fcf697bab7785c3ed87747ed1721e9c033818557`; local integration on `agent/release/tif-readiness-20261011`. Observation: 2026-10-11 15:09:59 UTC. No live mutation, deployment, main merge, native/OTA publication, schedule or spending occurred.

## Existing elements and smallest changes

| Finding/target | Existing issue | Adjustment | Behaviour and meaning |
| --- | --- | --- | --- |
| Target 2 detail artwork | Detail selection preferred the ordinary detail derivative even where an approved same-identity original had a qualifying ≥1,000-pixel long edge. | Prefer a qualifying detail derivative, then qualifying original; retain former detail/original fallback and existing retry candidates. Complete two derivative fixtures with required `deliveryPath: null`. | List/grid selection, exact language/printing/finish controls, approval gates and shared-artwork classification remain intact. Dimensions order candidates only; no acquisition or quality/coverage claim. |
| ART-002 | Supplied CoroCoro covers and local February 1997 preview bypassed existing source disable/denylist policy. | Resolve the strict existing monthly Japanese issue through `getMagazineSetCoverForSet` before returning the existing source. | The same 26 bundled files, issue/card mappings, navigation and cover/card-face distinction remain. Denied/unknown issues use existing unavailable presentation. |
| SEARCH-002 | Cached or early canonical cards hid a failed fresh factual lookup. | Retain useful exact cards and set the existing card error to “Card results could not be refreshed.” | Existing alert/retry UI becomes truthful. Successful fresh/empty results clear the error; request/account generations remain guarded. No request architecture change. |

## Verification

- Worker meaningful RED/GREEN control reproduced cached cards plus fresh factual rejection: before correction `errors.cards` was undefined; after correction the exact cached row remains with the visible refresh error. Controls retain successful enriched/empty results and stale-query handling.
- Artwork regression group, magazine-cover group and mobile-recovery group passed locally. Relevant controls include five-language shared artwork, permission/identity/finish denial, high-resolution preference and source-limited fallback, 26 offline CoroCoro fixtures, component policy decisions, global disable and per-issue denylist.
- Independent reviewer reran actual selector/component/progressive-search controls plus existing image recovery and controlled reference checks. No P1/P2 defect found in the seven-file scoped diff.
- Coordinator's final pre-species application typecheck exited **0**. Standard app/component lint exited **0**, with **8 existing warnings and 0 errors**. Expanded touched-file lint and latest-main reconciliation are recorded in the later integration receipt, not inferred here.
- Whitespace validation passed. Tests are local fixture/source checks; no installed-device performance, screenshot, accessible rendering, live API or whole-catalogue success was established.

## Current material gaps

Fresh read-only production aggregates identify **700 published canonical sets, 56,831 distinct published printings and 75,522 variant rows** across five languages. This scope excludes additional provider/local-supported sets until reconciled. Metadata image status is not decoded/verified artwork coverage. All 239 published Korean printing rows currently report `missing`; other languages have acquisition/review gaps. Status-level printing counts overlap and must not be added as a coverage numerator. See `resumed-readiness-catalogue.receipt.json`.

PDX-001 subsequently received the reviewed species-based index and separate species/provider-route contract described in `pokedex-species-index-repair-review.md`. Combined search testing also required the follow-up in `search-refresh-recovery-review.md`. Source binding, Marnie canonical publication, high-resolution catalogue acquisition, scanner measurements, pricing windows and phone acceptance remain open. No target is marked complete.

Fresh Railway inventory confirms no exposed production/staging service follows the PR329 candidate branch. Main-following workers/canary make merge a live action; one unrelated production API staged variable patch is untouched. Inventory/configured commit is not source attestation. See `resumed-readiness-services.receipt.json`.
