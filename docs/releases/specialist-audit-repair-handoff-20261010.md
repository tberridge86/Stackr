# Specialist audits and repair release handoff — 10 October 2026

All eight existing Stackr specialists completed their own audits, and the new
backend metadata specialist completed a ninth. Read the
[audit index](../audits/20261010/README.md),
[independent review](../audits/20261010/reviewer.md) and
[shared repair queue](../audits/20261010/repair-queue.json) for bounded evidence,
exclusive ownership and unresolved findings. This handoff does not certify the
whole catalogue or the installed app.

## Prepared source and integration

Branch: `codex/specialist-audits-backend-repair-20261010`, maintained checkout
`D:/Stackr-release-recovery-20261009`. Specialists audited historical revision
`5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`. Integration then fast-forwarded to
main `7b6cb00eff1d9d85b11a0af5700cb1bba0fd7cd6`, incorporating the separately
owned Chinese identity/cache PR #327 without attributing those changes to this
task. Existing changes in `D:/Stackr-1` were preserved.

Seven focused repairs are implemented, tested and independently reviewed:

| Queue ID | Result |
| --- | --- |
| BACKEND-SET-IDENTITY-001 | Inferred Japanese set names reject conflicting language/set metadata; valid and explicitly supplied names remain intact. |
| PRICE-AUDIT-01 | The bounded price presentation cache is account/server scoped and rejects responses spanning account changes or sign-out. |
| PRICE-AUDIT-02 | Provisional catalogue baseline prices retain their general-estimate classification. |
| PRICE-AUDIT-03 | Provider names, original amounts/currencies, FX and available raw-record references survive presentation conversion. |
| PRICE-AUDIT-04 | Stale-price copy says a refresh is queued only when queue evidence is true. |
| ART-001 | Consistent approved shared-artwork pointers work when a narrowed card response omits the sibling variant; identity, permission and finish controls remain enforced. |
| SEARCH-001 | Actual screen queries and set ranking preserve native scripts, gender and form terms while retaining Latin accents, aliases and collector syntax. |

The independent reviewer found no blocking defect in these seven repairs.
Following the search handoff, the coordinator completed `npm run typecheck` and
`npm run lint` (zero errors, eight existing warnings). Backend typecheck passed
after integration with main; the backend source did not change during search.
The three baseline catalogue-language-correction tests passed after integration.
Relevant backend, price client, shared-artwork and actual progressive-search
regressions were independently rerun and passed by the reviewer.

Search's new actual-helper/actual-screen fixture reproduced `リザードン ex`
becoming `ex` before the correction and retained the full query after it.
Installed React Native 0.81.5's bundled Hermes compiler lists Unicode RegExp
Property Escapes and compiled the actual transpiled helper successfully. This is
compiler evidence, not an installed native runtime measurement.

## Release boundary and remaining work

These seven repairs are prepared source. No new server deployment, catalogue
publication, provider refresh or signed TestFlight upload was performed during
this audit task. Historical build 54 used source `bf3d7a…` and does not attest
these changes. Live backend `9fae8fac7e8a` and the previous pricing rollout are
separate historical receipts. Matching API deployment, signed-app availability
and installed-phone confirmation remain required for their respective lanes.

The queue retains the remaining Pokédex species/form and account-ownership
defects, Trainer ownership eligibility, delayed set/search facts, partial-result
errors, direct history-write recovery, client translation guards, CoroCoro cover
controls and measured combined pricing coverage. Seven local fixes do not make
the other seventeen queue findings complete.

The [Marnie proposal](../audits/20261010/marnie-alias-correction.json) identifies
12 exact Traditional Chinese Trainer printings incorrectly aliased as Pikachu.
Official source evidence, before-images, accepted source hashes and scoped
rollback are recorded. The proposal is not a source repair or publication;
its canonical database write authorization remains false. Any scoped promotion
must preserve actual existing approval and be carried through generated maps,
search aliases and API readback, with no invented provenance.

The artwork report records the shared-pointer fix and three real API-response
controls, along with unresolved lower-resolution originals, eight missing
CoroCoro covers and acquisition/identity evidence gaps. No replacement batch or
HD completeness claim is made. Before TestFlight, promised artwork must be
verified through the app's configured API and unresolved batches disclosed.

## Continuing backend repairs

The installed new definition is `.codex/agents/stackr_backend.toml`; original
project definitions were parsed as nine unique specialists with the existing
`gpt-6.1-sol` / `ultra` configuration. The chat heartbeat
**Stackr backend repair and audit follow-through** is persisted ACTIVE, checked
at 22:38 UTC, every two hours. ID:
`stackr-backend-repair-and-audit-follow-through`.

It resumes the highest-impact unclaimed actionable backend item from the queue,
makes a bounded local repair and verifies it, requesting independent review for
sensitive changes. It keeps source, review, merge, deployment and device states
separate and reports only meaningful progress, failure or required human action.
The computer must remain on and Codex running. The heartbeat is not proof of a
completed background pass and grants no new live-operation authority. Old
reporting automation and existing provider-worker schedules were not changed.

Temporary work uses D:. Existing unused runtime backup, npm cache and Metro
cache were preserved on D: after C: filled; cache junctions preserve their
original paths. The active runtime, Codex databases and original user work were
preserved.
