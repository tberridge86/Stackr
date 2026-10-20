# Weekly pricing preparation using existing workers

Owner target 8 is active for preparation. No service, cadence, provider job, database write or live configuration was changed. This replaces the held draft's separate Railway cron-service proposal because the owner requires existing infrastructure. No extra paid service is proposed.

## Verified existing lane

Read-only production inventory on 11 October 2026 identifies `stackr-catalogue-prices-daily-production` (`a2e61d08-1910-4762-bf82-e0473e86ad5f`, hourly at `13 * * * *`) and `stackr-cardmarket-daily-production` (`1c4cf45c-816d-46cc-a416-78d8c18bd779`, hourly at `17 * * * *`), both following main. Owner and queued-refresh workers are separate existing lanes. Their cadences are retained. See `resumed-readiness-services.receipt.json`; a successful deployment is not a due/start or refresh-coverage result.

The existing catalogue wrapper `scripts/run-catalogue-price-cron.mjs` runs the existing bounded sweep, with checkpoints/retry outcomes and a 50-minute process limit. Its production child is write-capable; it was not invoked here. The previous synthetic fixture rehearsal and mock cron/provider/status checks are historical local evidence only (zero real provider calls/writes), not a live refresh or percentage. Main PR334 adds bounded Cardmarket reads/writes and is reconciled locally; its two focused regression commands pass.

## Smallest proposed weekly integration

Reuse the existing catalogue worker's bounded execution and durable run/checkpoint evidence. Add one weekly UTC checkpoint and a comparison receipt inside that existing lane after independently reviewed local implementation; retain more-frequent refreshes and every current worker/queue cadence. Do not create a separate service, second price pipeline, new Tif schedule or an unsupported command/flag.

A weekly checkpoint needs an exact persisted due time, first eligible actual start, idempotent checkpoint identity, selected worker source/run ID, result/exit state, retry/outcome counts and a supported-population coverage snapshot. A restart, duplicate hourly tick or missed checkpoint must not count twice or manufacture an on-time success. Existing schema/support must be inspected before choosing persistence; a live migration or configuration change requires its concrete reviewed action. No weekly integration is implemented or activated by this packet.

Only calculate a displayed change when both observations match canonical printing/variant/finish, language, set/number, scope and condition/grade semantics, provider/evidence type, currency (or traceable FX), and known source/recorded time. Missing, superseded, ambiguous or changed-source values remain unavailable/not comparable. Retain the last valid value after a failed refresh. A guide/estimate remains a guide/estimate.

## Acceptance evidence still required

| KPI | Current support/evidence | Remaining gap |
| --- | --- | --- |
| ≥99% scheduled starts within one hour over eight weeks | Existing cadences observed; no accepted eight-week due/start ledger. | Implement/review idempotent weekly checkpoint in existing lane; collect every actual due/start slot over eight weeks. |
| ≥95% supported eligible printing/finish combinations refreshed within 24 hours | Existing bounded group/outcome and coverage-report paths; no current accepted eligible numerator/denominator. | Read exact current supported population, unique successful stored quotes/time, failures and oldest pending age; report whole catalogue separately. |
| 100% shown changes trace comparable observations | Existing snapshots/history retain identity/time/source fields; no accepted weekly comparator cohort. | Independently test every comparison key, changed source/currency, failure retention and duplicate retries, then actual presentation/readback. |
| Eligible prices >8 days stale; preserve last valid after failure | Provider-guide freshness includes a stricter 48-hour rule; other presentation paths differ. | Inspect applicable display semantics before a narrow change; never extend fresher-source requirements to eight days or erase existing freshness meaning. |

## Live approval boundary

Before any activation, present the exact reviewed source, named existing service/environment, command/config delta (if any), database dependencies, provider/write budget, concurrency, staged-change separation and rollback-capable prior deployment. No activation request is ready while that implementation/evidence is missing. No existing unrelated staged API variable patch is applied. Preparation, successful mock checks and inventory do not satisfy the eight-week or 24-hour targets.
