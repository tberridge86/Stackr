# Stackr specialist ownership

Established 10 September 2026 at the owner's request. The initial review used
GitHub main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e` and identified candidate PR
[#168](https://github.com/tberridge86/Stackr/pull/168), head
`9fdbeb06d6b2fe117bf345ae6a6407cebb71553e`. This is the setup baseline, not a claim
that this revision is installed on a phone.

## Five owners

| Owner | Responsibility | First handoff | Brief |
| --- | --- | --- | --- |
| Release | Carry accepted changes through integration, relevant quality gates, deployment and the affected live user journey | Reconcile build 34, PR #168, frozen native source, backend and migrations | [Release](release.md) |
| Pricing | Reliable, correctly labelled price retrieval, eBay completed-sale evidence where available, and other supported providers | Prove a price from existing worker through exact card identity to the app; assess coverage beyond the newest eligible cards | [Pricing](pricing.md) |
| Performance | Useful results arrive quickly and reliably on search, cards, images, binders and prices | Make release probes assert expected identities/results; measure the actual screen path and enrichment delay | [Performance](performance.md) |
| Backend | Maintainable code, coherent migration history, useful indexes and bounded storage/jobs | Reconcile the five recovered migrations with repository and live ledgers | [Backend](backend.md) |
| Catalogue | Fill metadata, image and logo gaps while preserving all existing usable sources | Validate Japanese continuity on real app delivery and measure each supported language from a known population | [Catalogue](catalogue.md) |

## Execution and coordination

Read the [build 34 desktop handoff](../releases/owner-testflight-34-handoff-20260910.md)
and its linked evidence before acting on the initial audits below. Build 34's
signed source and TestFlight availability are now evidenced; installed-device
acceptance remains pending. PR #168 is a separate, unshipped candidate.

The release task responds to Stackr pull-request lifecycle events. Pricing,
performance, backend and catalogue tasks run daily in staggered London-time
windows. These are scheduled or event-triggered task runs, not continuously
running processes. They supervise the existing application workers; they do not
replace the six-hour price schedule or five-minute manual queue consumer.

Each run must read the current source and the latest matching work before
choosing an action. A specialist should fix the highest-impact verified issue in
its remit, or make the missing measurement that determines the fix. A report
that simply repeats an old blocker is not progress.

Use branches named `agent/<role>/<short-task>` and PR titles beginning
`[Agent:<role>]`. Reuse a matching open PR and evidence file where practical.
Keep each agent's writes isolated. If a fix crosses ownership boundaries, select
one implementation owner and record the other role's review requirements. Do not
let two agents change the same integration branch or deploy competing revisions.

Specialists hand over the problem, affected paths, precise revision, focused
validation, expected user-visible result, migration/config dependencies and
rollback approach where needed. Routine operational refreshes use the existing
bounded, authorised queue/worker lanes. Schema changes, source activation,
backend deployment and native/OTA publication go through release coordination.

The release owner is the integration and production-promotion owner. It verifies
the affected component's existing gates and continues authorised work. It must
not bypass protected-environment reviews, manufacture evidence, enable commerce
or expand to new paid services. Missing technical proof is recorded as a specific
next action; it must not be turned into a generic request for approval.

Documentation-only changes require documentation checks; they do not justify
rebuilding or redeploying the running application. The production artifact must
include the intended runtime changes; an unrelated newer documentation commit
does not by itself prove deployment drift.

## What counts as delivered

Track these states independently: planned, implemented, tested, merged, deployed,
and verified in the affected user journey. For each component retain its actual
source revision and environment rather than treating a mobile build number as
the identity of the API, database and catalogue as well.

A release receipt needs the applicable subset of:

- PR and source commit, exact relevant CI result, and any skipped gates.
- Backend deployment identity and healthy live behaviour, not only build status.
- Database project, recorded migration versions and compatibility with the API.
- Pricing/catalogue job and source timestamps with records actually persisted.
- Native build, runtime version and OTA channel/update group where applicable.
- Expected card identity, language, image and price result in a representative
  live journey, plus actual device evidence for device/UI claims.

Preserve existing narrow release lanes: a backend-only change does not require
unrelated full-platform work to finish. Conversely, deploying the backend does
not deliver a native UI change to an installed app.

## Measurements and reporting

Report eligible-population size, passed/failed counts, observation time,
environment and revision alongside percentages. A zero or unknown denominator
is unmeasured, never 100%. Separate provider references, stored files and actual
app-delivered images. Separate estimated prices, asking prices and confirmed
completed-sale observations, including source and freshness.

Keep useful findings and focused fixes in the repository or their matching PR.
The release owner consolidates cross-agent results. Notify Jack only for a new
actionable blocker or material verified delivery; suppress unchanged repeats.
Do not send email or Slack, resume the paused Catalogue Progress task, or alter
the existing weekly status schedules as part of this setup.

## Access verified at setup

Harmless read-only calls succeeded for GitHub, Railway and Supabase. GitHub
confirmed repository access. Railway project
`d205637b-5376-41aa-9169-1015ba88fec3`, production environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`, returned successful latest deployments for
the API and both price workers. The price-worker schedules were `0 */6 * * *`
and `*/5 * * * *`. This proves configured cadence/deployment status, not successful
price ingestion or complete coverage.

Supabase listed production `oakdbbzdqwurpjnoqhmu` and staging
`lmwfhvexfcoyeuoyrlco` as active and healthy. Project visibility does not prove
schema parity, RLS behaviour or catalogue completeness. Each task must recheck
access and the specific evidence it needs; credentials must never be written to
these documents or PRs.
