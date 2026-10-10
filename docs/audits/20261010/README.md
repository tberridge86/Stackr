# Stackr independent specialist audits — 10 October 2026

The user requested each installed Stackr specialist's own audit and a new backend agent that continues repairing broken metadata and API contracts. This directory records those independent investigations and the coordinator's shared repair queue.

The individual specialists audited `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1` on branch `codex/specialist-audits-backend-repair-20261010`, in `D:/Stackr-release-recovery-20261009`. The integration checkout then fast-forwarded to main `7b6cb00eff1d9d85b11a0af5700cb1bba0fd7cd6`, preserving this task's changes and incorporating the separately owned PR #327. The independent reviewer assesses this task's diff against that newer baseline. Historical audit revisions and measurements remain intact. The original `D:/Stackr-1` checkout retains its existing changes. Audit scope is bounded; passing fixtures do not certify every catalogue record or the installed app.

## Individual reports

| Specialist | Own evidence report | Initial dispatch |
| --- | --- | --- |
| Coding | [coding.md](coding.md) | Coding and backend |
| Backend metadata repairs | [backend.md](backend.md) | Coding and backend |
| Pricing | [pricing.md](pricing.md) | Pricing and performance |
| Performance | [performance.md](performance.md) | Pricing and performance |
| Artwork | [artwork.md](artwork.md) | Artwork and translation |
| English translation | [translation.md](translation.md) | Artwork and translation |
| Pokédex | [pokedex.md](pokedex.md) | Pokédex and search |
| Search | [search.md](search.md) | Pokédex and search |
| Independent reviewer | [reviewer.md](reviewer.md) | After specialist reports and local repairs |

Completion and individual findings are recorded in [repair-queue.json](repair-queue.json). The queue contains 24 distinct findings, including shared findings reconciled between specialists. The [assignment plan](assignment-plan.json) specifies each specialist's acceptance criteria and exclusive evidence ownership. The reviewer remains read-only; the coordinator records its returned findings faithfully.

## Continuing repairs

The local heartbeat **Stackr backend repair and audit follow-through** is active, attached to the current chat, with a two-hour cadence. Its ID is `stackr-backend-repair-and-audit-follow-through`. Creation and persisted ACTIVE state were checked on 10 October 2026. Local execution requires the computer to be on and Codex to be running; this is not evidence of unattended execution before task creation.

Each wake resumes the highest-impact unclaimed actionable backend queue item, reproduces the failure, makes a small local correction and records verification. It uses [the audit protocol](../../../.codex/AUDIT_PROTOCOL.md), respects existing live-operation authority and stays quiet when there is no material change. It does not reactivate the old catalogue-reporting automation or change production price-worker schedules.

The new reusable backend definition is [stackr_backend.toml](../../../.codex/agents/stackr_backend.toml). Source corrections, generated data proposals, merged revisions, deployed API responses and installed-phone observations have separate status fields. A matching signed TestFlight build and phone confirmation must be evidenced before mobile delivery is described as complete.

## Repairs prepared during the audit

The backend language/set-identity guard and four pricing corrections are locally implemented: account-scoped bounded presentation caching, provisional estimates kept general, provider/FX provenance retained, and stale copy tied to actual queue evidence. Focused backend and pricing regressions pass. Application typecheck passes; lint completes with zero errors and eight existing warnings. These claims describe local source, not a deployed server or installed app.

The artwork specialist has also repaired the rejected shared-artwork pointer. New five-language and negative-identity fixtures pass; three actual live DTOs resolve to the matching shared images through the corrected local selector. That proves the selector correction, not installation on the phone.

The live Marnie alias is source-verified as incorrect, with an [exact 12-record correction proposal](marnie-alias-correction.json) from the translation specialist; current publication remains separately tracked. Further set/search loading, history recovery and metadata completeness items remain in the shared queue.

The search specialist then corrected native-script/gender/form normalization in
the shared helper and proved the actual screen callback and set ranking through
the existing progressive fixture. All nine reports are now complete. The
independent reviewer found no blocking defect in the seven prepared corrections;
the final integrated application typecheck/lint and backend typecheck pass.
The [release handoff](../../releases/specialist-audit-repair-handoff-20261010.md)
records verification and the remaining API, signed-app and phone delivery gates.
