# Stackr Provider Retirement Go/No-Go

Evaluation date: 2026-07-28
Machine-readable evidence: `data/quality/provider-retirement-gates.stage14.json`
Recommendation: **NO-GO**

## Gate Results

| Gate | Status | Evidence found |
| --- | --- | --- |
| Catalogue coverage at least equal to legacy scope | Insufficient data | No activated canonical catalogue or parity report exists. |
| No critical language regression | Fail | Live audit found no Simplified Chinese, Traditional Chinese or Korean canonical coverage. |
| Scan benchmark passes | Insufficient data | Gold set contains 0 cases and 0 observations. |
| Catalogue/search/recognition latency passes | Insufficient data | No staging performance observations exist. |
| Price provenance preserved | Fail | Card pricing is adapted; sealed/accessory pricing still uses the legacy eBay route. |
| User collections reconcile | Insufficient data | Mapping ledger exists locally; no staging or production reconciliation run exists. |
| Rollback tested | Insufficient data | Local cache rollback passes; full staging service/database/flag rollback has not run. |
| Routine provider dependencies retired | Fail | Product pricing, grading, feedback and quarantined compatibility paths remain; the home/binder tracker is an explicit legacy parity hold. |
| Visual UAT parity | Insufficient data | Flag-off compatibility and the original home/binder tracker calculations were restored after a reported regression; device sign-off is absent. |
| Provider credentials removed | Not applicable | Credentials cannot be removed while emergency or unresolved fallback paths remain. |

## Failed Gates

1. Required-language coverage does not meet the English, Japanese, Simplified Chinese, Traditional Chinese and Korean launch objective.
2. Sealed/accessory product pricing does not yet use canonical product identity and provider-neutral Stackr API provenance.
3. Ximilar grading, legacy feedback/scan-lab requests and compatibility provider code have not all moved behind the stable v1 client contract.

## Missing Evidence

1. A canonical-versus-legacy coverage report by launch set, language and variant.
2. Leakage-safe real capture results meeting the fixed Stage 12 release targets.
3. Staging p95 results for cached catalogue, structured search, supplied-embedding recognition and warm image fallback.
4. A dry-run collection reconciliation report with mapped, quarantined and unresolved totals.
5. A complete staging rollback exercise.
6. Signed-off device screenshots and populated-state workflows for the existing UI.

## Decision

Do not disable Ximilar, delete provider credentials, purge legacy caches, apply user identity mappings, enable the Stackr API flag in production or publish a production mobile update from this stage.

The exact next action is a **Stage 14 staging continuation**: reconcile migration history, deploy the inactive v1 services to staging, populate an authorised canonical launch slice, run collection migration in dry-run mode, execute visual UAT and benchmarks, and regenerate this report. Provider retirement can be reconsidered only when every required gate is `pass`.
