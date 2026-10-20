# Pokédex account-boundary repair follow-through — 11 October 2026

The 08:12:47Z local heartbeat resumed the shared queue from
`d63ccd7687b9fd72d6389210441f7e1af2df0596` on
`codex/specialist-audits-backend-repair-20261010`, matching open PR #329.
The maintained checkout was clean. The original `D:/Stackr-1` work was preserved.
The coordinator read the required working guidance, specialist protocol and queue
before selecting the unclaimed P1 account-boundary finding PDX-002.

## Integration and hosted-check evidence

Main advanced to `599c776f12201470273574c4d5f9f01632609dc1` through PR #330.
The coordinator integrated it without conflict at
`80c8eab31619e30fa6bf03b7eb48015bfcbf5338` before assigning implementation.
That separately owned correction changes Chinese language-prefixed set reads,
its narrow fixture and a historical correction receipt/manual SQL. No Pokédex
task paths overlapped. The new fast-set fixture passed 3/3 tests and the backend
typecheck passed after integration. No SQL was executed or server deployed.

Previous pushed PR head `d63ccd7687b9fd72d6389210441f7e1af2df0596` has eight
successful applicable checks and one failure; release/canary gates were skipped.
The failed `dependency-and-secret-scan` job stopped during backend `npm ci`
because the unchanged `onnxruntime-node` installer encountered `ETIMEDOUT` and
`ENETUNREACH`. Its later secret and dependency audit steps did not execute.
This is an install-network failure, not evidence of a detected secret or a
successful security scan. The exact job is
[114407794352](https://github.com/tberridge86/Stackr/actions/runs/38118368341/job/114407794352).
New-head CI results must be recorded separately.

## Bounded reproduction and ownership

The backend/coding specialist made a read-only actual-consumer handoff against
the integrated revision. The two screen and ownership-service sources were
unchanged from the previous pushed head. Local TypeScript-AST/VM controls using
fictional accounts/printings produced 11 observations: eight defective and three
positive controls. The frozen specialist report records the exact observation
table; scenario groupings are not additional tests. Existing
`test:pokedex-release` passed on that baseline.

Reproduced cases include retained list names while pending/failed, a late focused
account result without an account check, retained A-account detail keys after a
failed B-account read, failed initial ownership displayed as Missing for both
fixture cards, sign-out retaining old keys due to `undefined`/`null` comparison,
and a delayed failed A-account marker rollback removing B's same-printing key.
The original detail generation guard rejects a late account result but leaves
the already displayed previous snapshot. These are local consumer controls,
not live account or installed-device observations.

One installed Pokédex specialist owns the two screens, ownership service,
bounded regression fixtures, any necessary shared ownership-state helper and
its new repair report. The independent reviewer remains read-only. The
coordinator exclusively owns the queue, this receipt and source integration.
Concurrent implementation ownership is recorded in the queue before editing.

Runtime commit `c02d59fc497b9971e6dfe3e97a03aa913df22fc3` binds successful
snapshots and mutation intent to their account, masks another account's data
during rendering and distinguishes unknown from successfully empty ownership.
It retains verified same-account snapshots with honest saved/error/retry behavior.
Expected-account checks reject a changed authenticated account before marker
writes, including after collection-removal guards. Catalogue browsing remains
available. Physical/binder/manual source rules and exact printing/set identities
are intact. PDX-001 mapping, PDX-005 pagination and PERF-003 images stay in their
separately owned queue items.

The commit contains only both screens, the existing ownership service, a shared
ownership hook, the actual-consumer regression and the coordinator's one-line
release-test script wiring. The shared hook replaces duplicate screen ownership
flows; no per-tile query or additional auth subscription was introduced. No
latency or whole-catalogue completeness claim is made.

The coordinator read the Supabase skill and current official
[auth-event](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
and [server-backed user-check](https://supabase.com/docs/reference/javascript/auth-getuser)
documentation, and scanned the current changelog for relevant breaking changes.
The existing auth context remains the lifecycle source; no SDK, schema, RLS or
auth-context change is assigned. Runtime scratch and caches stay on D:.

## Verification and delivery

The initial specialist handoff passed 11 named actual-runtime acceptance groups,
the existing release command and the cold-retrieval fixture. Independent review
then reproduced two gaps in that new implementation: an invalidated optimistic
overlay remained visible through auth-readiness/error or A→B→A transitions, and
a rapid duplicate tap before rerender could start two persistence operations.
Those review cases were not covered by the initial 11 groups. The specialist
reopened its exclusively owned helper/test/report to bind overlays to the current
generation and synchronously limit mutation initiation. The corrected 13-group
suite passed, but the reviewer additionally reproduced an old-account error
alert after the promise rejected and before the screen's catch continued in the
new account. That third review finding requires a guard at the final alert
boundary, including a current-account positive control. No source commit or
publication occurred before these reviews.

The first parent typecheck passed. Expanded lint found zero errors, nine existing
warnings in its wider scope and two introduced fixture hook-lint warnings, also
returned to the specialist for correction. After the first two review repairs,
typecheck and lint passed with no introduced warnings; these are historical to
that freeze. The third freeze corrects all three independently reproduced review
findings. Invalid optimism is projected only while its account/auth/focus/request
predicate is current, a synchronous token admits one mutation, and error
presentation rechecks the initiating predicate after the promise handoff and
immediately before logging/alerting. Stale completion cannot release a newer
operation's lock. The final tests retain current-account positive controls.

Final checks pass on the third frozen source:

- `npm run test:pokedex-release`, now including **14/14** actual complete-consumer
  and service regression groups alongside the existing route/loading checks.
- `node --import tsx scripts/test-issue304-cold-retrieval.ts`.
- Application typecheck, expanded lint and whole-task diff check. Lint reports
  zero errors, nine existing warnings in its wider scope and no introduced
  warnings. The existing ownership-service warning was confirmed on the baseline.

The [specialist repair report](../audits/20261011/pokedex-account-repair.md)
records baseline/iteration evidence and its owned files. The
[independent review](../audits/20261011/pokedex-account-review.md) reran the final
release/cold checks, confirmed all three corrections and also reran the original
alert timing probe directly against the actual hook without the new test wrapper.
No remaining actionable task finding was found. The 14 final acceptance groups
and 11 baseline observations have different denominators; no percentage is
inferred from them.

| State | PDX-002 repair |
| --- | --- |
| Local source | Committed as `c02d59fc497b9971e6dfe3e97a03aa913df22fc3` |
| Focused regressions and final application gates | Passed |
| Independent account-boundary review | Passed after three reproduced corrections |
| Merged | No |
| Deployed API or signed app | No |
| Installed-device verified | No |

The next owner is release coordination for current-head checks, matching signed
app and actual installed-device account switching. Local guards cannot revoke an
already-dispatched database request; live RLS and native account/offline behavior
remain unverified. The queue retains 25 unique findings, with this P1 finding
now reviewed for source integration; other account consumers and all catalogue
records are outside the sampled regression scope.
The separate Japanese source-document binding mismatch and 12-printing Marnie
proposal remain unrepaired/unpublished. Full species/form coverage, live account
behavior and device behavior remain unmeasured.

No provider refresh, catalogue mutation, source activation, remote database
script, schema change, production/staging job, deployment, signed-app upload or
paid operation was performed. Existing automation and worker schedules were not
changed. Local, tested, reviewed, merged, deployed and installed-device states
remain separate.
