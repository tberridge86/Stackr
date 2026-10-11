# Stackr specialist audits and continuing repairs

The owner requested independent audits by coding, pricing, performance, artwork,
translation, Pokédex, search and reviewer, plus a backend metadata repair agent.
Each specialist conducts its own bounded audit and reports its own evidence.
Creating an agent definition does not run it; background continuation is handled
by the separate chat heartbeat named Stackr backend repair and audit follow-through.

Use the maintained integration checkout `D:/Stackr-release-recovery-20261009`.
The original `D:/Stackr-1` contains extensive unfinished work: preserve it, and
inspect named local files only when comparing a demonstrated delivery gap.
Start each repair from the current matching branch/PR and verified source;
never reset another checkout or switch over unrelated changes.

## Independent audit contract

- Write one report under `docs/audits/20261010/<area>.md`, covering coding,
  pricing, performance, artwork, translation, pokedex, search, backend or reviewer.
  The read-only reviewer returns findings to the parent for recording.
- State revision/environment, inspected paths, bounded sample, checks actually
  performed and limitations. Distinguish current source from live API and phone.
- Report reproducible failures with stable IDs, severity, root cause, evidence,
  affected identity/account boundary, smallest proposed repair and verification.
  Unmeasured coverage or latency is unmeasured, not passing.
- Use tracked files first. Inspect representative named data, not entire large
  catalogue/asset/model trees. Respect the three-agent session limit and avoid
  concurrent full builds. The coding lead assigns exclusive ownership; the
  parent integrates. Two agents must never edit the same file concurrently.

## Repair queue

The parent maintains `docs/audits/20261010/repair-queue.json`. Specialists own
their reports; they send queue entries to the parent rather than editing the
shared queue concurrently. Each entry records ID, owner, source evidence,
severity, affected files, repair status, validation and delivery state.
Reconcile duplicate findings and matching open work before claiming a repair.
Do not mark locally tested fixes deployed or price-processing counts complete
catalogue coverage. Recheck only a changed path or genuinely new evidence.

Background runs pick the highest-impact unclaimed, actionable backend item.
Claim its files, implement a focused reversible repair, run the narrow checks,
request independent review when required, and preserve the handoff for the
release owner. Record a concrete evidence/access blocker if work cannot proceed;
continue another permitted item rather than repeatedly reporting that blocker.
When the queue is empty, perform a bounded change-based check and stay quiet
unless a new supported issue appears. Do not generate repeated full audits.

Preserve current user authorization. Background scheduling itself creates no
new live-operation authority. Keep exact data corrections reviewable with
provenance and before/after identity. Use the established release lanes for
authorized deployments and publication, and do not activate staged unrelated
keys, schemas, paid providers or catalogue writes as routine housekeeping.
Notify only for a material verified repair, completion, failure or required
human action. Send no external messages. Do not reactivate the removed catalogue
reporting automation or change application price-worker schedules.

Keep temporary files and caches on D:; the C: drive has little free space.
