# Resumed Stackr readiness integration

Owner explicitly resumed production-readiness work on 11 October 2026. This receipt records tested local repairs and preparation for the existing PR329. **The app is not proved production ready.** Approved live delivery, canonical metadata correction and the ten-target acceptance evidence remain open.

## Source and approved scope

- Isolated checkout: `D:/Stackr-recovery-artifacts-20261009/runtime-temp/worktrees/tif-readiness-integration`, branch `agent/release/tif-readiness-20261011`. Original unfinished `D:/Stackr-1` remains untouched apart from named read-only comparisons.
- Integrated main: `3d08536f7bd581ed1266f176c13640c0a712305f` (PR334), rechecked from origin at the end of the code integration. Earlier main-following pricing and staging changes were preserved.
- Existing remote candidate: `codex/specialist-audits-backend-repair-20261010`, [PR329](https://github.com/tberridge86/Stackr/pull/329). It was open/unmerged at `884e2b5f37872cfeab36169bdd9402a648b0e9d9` before this push. Only a fast-forward candidate update is authorized; no merge to main or live action is included.
- Current reviewed application code tip: `c61912de5138244bab3e5abbab802b8e5b4b1730`. Guarded Marnie local SQL preparation is committed at `ec068d2327e840e6b1525abc1d04e09a4617232c`; pending runtime preparation at `76b25fd13c98b0f5a7ebf27103a9c7aed424f819`. Neither is an applied correction. Further evidence commits may follow; record hosted check head separately after publication rather than pretending a document attests itself.

| Reviewed code | User-visible repair | Evidence |
| --- | --- | --- |
| `e9582f870f9f00f7db2829a48a9178cbe7f8566a` | Prefer a qualifying approved detail/original image; enforce existing Japanese monthly CoroCoro cover policy; expose honest failed search refresh. | High-resolution artwork, cover-policy and resumed-repair reports. |
| `94d6a9e3cce81abfd3af6511a5aee4ff4f65eb2d` | Separate 1,025 official Pokédex species from provider form routes and document the response; current factual search results/known empty win over stale fallback. | Species-index and search-recovery review reports. |
| `9bdd2355799fd6e69a8ac14aa59c205481159b63` | Mask Set Detail private ownership before account-generation effects; guard late reads/mutations/history and per-generation locks. Public browsing remains available. | Set Detail final privacy review and actual complete-screen controls. |
| `bd2aa90414f40533979e4161d5c0e8fbf78708cf` | Keep partial Pokémon cards useful, show warning/Retry and honest incomplete count; reuse existing exact-printing tile image recovery. | PDX-005/PERF-003 review and new complete-screen regression in existing CI command. |
| `c61912de5138244bab3e5abbab802b8e5b4b1730` | Reject delayed opening haptics after close, replacement, navigation or unmount using the existing shared current-view guard. | Actual facade RED/GREEN and 30 complete-provider/lifecycle controls; independent haptic review. |

No architecture recreation, new application dependency, paid service, Tif schedule, catalogue mutation or private-user-data read is included. Existing identity, pricing provenance, permissions, persistence, navigation and commerce/release gates are retained.

## Validation performed

Relevant final local checks pass. Substantive source repairs were independently reviewed and corrected before acceptance.

- Meaningful baseline failures reproduce search refresh/fallback errors, Set Detail synchronous cross-account leakage and populated Pokémon partial-result misrepresentation. Corrected consumer harnesses pass. These use complete compiled TSX/controlled hooks and sources; they are not native React rendering or physical-device evidence.
- Extended `test:pokedex-release` passes species/route/pagination/loading, 15 account-boundary groups and the new partial/retry/image-prop regression. Shared actual image-recovery controls pass. Selected species-to-detail and legacy direct-form behaviour is retained.
- Full `test:personal-loading` passes, including actual search settlement, cold retrieval and seven Set Detail privacy/mutation/history/lock groups. All fresh private values are checked against the current account/generation; old completions cannot affect the new one.
- Focused artwork/CoroCoro/mobile-recovery checks pass. Permission, printing/language/finish and protected-special-artwork negative controls remain required; no new whole-catalogue artwork assertion follows from these fixtures.
- Full `test:server-delivery` passes. Generated API contracts and route coverage pass at 43/43, with localhost fixture integration and mocked published-delivery verification.
- Backend 52 fixture tests and backend TypeScript pass after restoring existing locked backend dependencies in the isolated checkout. No package/lock change was needed for that environment repair. Local Node24.15/npm12 differs from the declared/CI Node22; matching hosted checks are still required. Optional dependency install scripts were not a recognition-model installation or benchmark.
- Application TypeScript passes. Final affected Pokémon screen/test lint is clean; earlier species/search touched-file lint had eight pre-existing warnings and no errors. Set Detail privacy lint is clean. Named-file whitespace/JSON/queue checks are required for the evidence commit.
- PR334's relevant bounded Cardmarket read/write regression checks pass. No price worker or provider job was invoked by this pass.
- Full `test:card-inspection` passes after the delayed-opening repair; application TypeScript passes and affected lint has zero errors/three pre-existing lifecycle-fixture warnings. Eight production consumer files and sixteen call sites are mapped; these are source entry points, not sixteen accepted physical journeys or comfort scores.
- Independently reviewed Marnie SQL preparation passes actual isolated PGlite forward/inverse rehearsals, default rollback, exact 12/13 mutation/25 forward and 25 reverse public receipts, actual sequence-pointer maxima and identity/publication/timestamp/cardinality drift rejection. Relevant deployed-schema metadata was read only; no remote rehearsal/write or runtime generation occurred.
- The separately reviewed pending runtime fixture binds proposal/before-image/current accepted input and record hashes, exact twelve identities/timestamps and the prospective one-group replacement. The genuine Pikachu group and all other current records remain untouched. It is not generator input and creates no applied runtime artifact; its dedicated check is included in the existing server-delivery command.

Old hosted checks on `884e2b5f` include successes, a cancelled lint/type job and skipped release/canary gates. They cannot validate this new tip. Record exact pushed-head CI outcomes and any skipped gates in the next hosted receipt/PR metadata. Ordinary PR checks never substitute for release, canonical-data or installed-device acceptance.

The first published resumed head `511ebc169f9fa8a103e88551391313a8d89b0d4b` subsequently had ten successful checks, two legacy-fixture failures and two skipped gates. The layout/filter/activity fixtures were corrected for the stronger account visibility/generation guard without production changes, independently reviewed, and pass the relevant full Home checks/typecheck/lint. See `docs/audits/20261011/readiness-ci-fixture-follow-through.md`. Fresh hosted results for the corrected revision are still required and are retained separately.

## Fresh read-only evidence and remaining gates

Production published-canonical scope totals **700 sets / 56,831 printings / 75,522 variants** across five language-specific versions. It excludes additional provider/local support. All 239 Korean printing rows report missing native images; metadata availability is not decoded, rights-cleared or rendered coverage. The five-file artwork cohort and small deterministic pricing sample are bounded diagnostics, not global percentages.

The exact Marnie before-image at `2026-10-11T15:40:20.589116Z` confirms **12 wrong Traditional Chinese printing displays and 13 wrong English variant alias rows**. Native names and genuine Pikachu rows must remain unchanged. Canonical normalized receipt hash: `1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677`. Rollback-default source preparation and its inverse are independently reviewed. A runtime-only fix leaves stored search aliases wrong, while a database-only fix can be overridden by the dated generated runtime record. Full non-production/consumer rehearsal and the coordinated applied-input/runtime/publication/deployment action remain required; no live correction is authorised or claimed by this preparation.

Read-only Railway inventory finds no exposed production/staging service following the candidate branch. Main-following workers/canary make a main merge a live action. Production API latest settled observed deployment is `d3fd1999-bad0-4c8a-80fb-c8ec64a71295`; a configured source pin is not deployed-source attestation. Unrelated staged API variable change `8e29d75c-d567-4a9a-9e96-8a40e51a22f3` remains untouched. Do not apply all staged changes.

Owner reference: **iPhone 15 Pro, owner-reported iOS26.6.1, 5G mobile data, previously installed Stackr1.0.6 build54**. Carrier and measured bandwidth/signal are unknown. There are zero new installed-device observations, zero actual scanner trials against the 200-trial target, zero accepted 100-observation per-journey/cache latency cohorts, and no accepted seven-day API/eight-week pricing observation windows. These cannot be manufactured from tests or planned nominations.

The single ten-target completion ledger retains each baseline, KPI, coverage/sample, evidence, remaining gap and delivery state. Logo/readability/accessibility coverage, legitimate native artwork acquisition, exact CoroCoro associations, haptics and scanner/model/index proof remain open. Weekly pricing preparation reuses existing worker lanes and requires reviewed implementation; no separate service/cadence or Tif automation is proposed.

## Continuation and approvals

Work is authorized and active in this chat. The saved native goal runner still reports paused and cannot be resumed by the goal-update API; no schedule or automatic between-turn process is claimed. Stackr push, calls/texts and a custom live voice remain unconfigured/unverified; approvals are handled in this chat.

Before any live action, prepare one exact reviewed action/source/environment/dependency/test/impact/rollback packet. Do not request approval for an unspecified merge or broad catalogue write. Keep locally tested, reviewed, merged, deployed and device-verified states separate. Completion requires every agreed target's acceptance evidence, no critical/high scoped defect, approved attested delivery and the installed-phone checks.
