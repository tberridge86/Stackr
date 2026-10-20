# Coding and integration audit — 10 October 2026

Auditor: Stackr coding specialist, independently assigned by the coordinator. Source baseline: `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, branch `codex/specialist-audits-backend-repair-20261010`, working directory `D:/Stackr-release-recovery-20261009`. Inspection and narrow checks ran at approximately 22:05–22:15 UTC (23:05–23:15 Europe/London). This audit changed only this report and `assignment-plan.json`; concurrent backend/agent-configuration edits are other owners' work.

Read `AGENTS.md`, `docs/agents/README.md`, release/backend/performance/pricing/catalogue briefs, and the React Native and Supabase skills. No implementation, schema or provider API changes were made. Searches started with tracked source and named files. No broad catalogue scan, full build, refresh, remote mutation, deployment, signed app build or device test was performed.

## Findings requiring follow-through

### C1 — High: accepted mobile recovery is not evidenced in a newer signed app

The recorded build 54 native source is `bf3d7a233aa7d30dda99b61ccd51533ae85eed90`, version/runtime 1.0.6. That package predates the current Home history compatibility/recovery, page loader, CoroCoro archive, Settings touch-feedback test and raw-price caller corrections. A fresh source comparison demonstrates differences in the actual consumer files; a server deployment cannot deliver these JavaScript/native UI changes to that signed artifact on its own.

Reproduce:

```powershell
git diff bf3d7a233aa7d30dda99b61ccd51533ae85eed90 HEAD --stat -- features/home/HubScreen.tsx lib/activity.ts lib/homeActivity.ts app/settings.tsx components/StackrLoadingIndicator.tsx app/corocoro.tsx components/PokeTraceMarketInsights.tsx lib/stackrDomainAdapter.ts lib/stackrApiV1.ts
```

Evidence: `docs/releases/testflight54-delivery-20261008.md:7` records the frozen native source; `docs/releases/daily-pricing-live-promotion-20261010.md:76` records an unsigned export rather than a new signed build or TestFlight upload. Current `components/PokeTraceMarketInsights.tsx:249–290` separates the display grader label from supplied grading identity and chooses raw/graded history correctly; `lib/stackrApiV1.ts:1064–1075` carries the new history filters.

Impact: a tester can continue to see the same history/loading/haptics/price-caller behavior even when server checks pass. This is a demonstrated delivery gap, not evidence that the new source corrections failed on a device. Next owner: release coordinator. Acceptance requires the matching signed/served update identity plus authenticated iPhone add/increase/decrease/remove and Home-return/restart, loading and tactile checks. The actual phone's installed/received update identity remains unverified in this audit.

### C2 — Medium: direct set/binder quantity edits lack durable history-only recovery

`app/set/[id].tsx:772–840` commits an inventory delete/upsert and then calls `createActivityPost` separately. `recordActivity` supplies `expectedUserId`, but no stable `eventId` and no persisted recovery intent. When recording fails, the user sees “Collection updated … history entry could not be recorded”; the callback ends with the holding saved. `features/binder/BinderDetailScreen.tsx:2273–2301` uses the same separate notification-only pattern for variant quantity changes.

This is correctly contained: history failure does not pretend to undo inventory or attribute an event to another account. It still means a transport/permission failure can leave a real quantity change absent from history after navigation/restart. The old missing-column issue is separately fixed by `lib/activitySchema.ts:12–17` and `lib/activity.ts:292–303`; this finding concerns recovery after an actual write failure.

Reproduction already exercises the real source callback: `scripts/test-home-activity-ui.ts:13–57` injects `createActivityPost` failure and confirms that persisted inventory/quantity survives with one alert. There is no history replay invocation in this direct handler. In contrast, the same test's manual-add case verifies original-request history-only replay, and `lib/collectionBatch.ts` uses stable event IDs.

Next owner: coding coordinator, with activity/account review. Smallest useful repair: extend an existing persisted owner-bound history recovery mechanism to these direct edit paths; do not reapply holdings, reconstruct an event from the later quantity, or introduce a second queue framework. Acceptance must cover saved inventory followed by failed history, restart, later quantity change/removal, one eventual event with stable ID, and account switch. This audit did not implement that repair or change the live database.

### C3 — Medium release dependency: current metadata guard source is newer than the live backend

A fresh read of `https://pocketvault-production.up.railway.app/health` at `2026-10-10T22:14:41.8753363Z` returned `ok=true`, service `stackr-api`, `gitCommit=9fae8fac7e8a`, `gitCommitSource=bundled_workflow_sha`, deployment `7070a53d-6b09-41e7-9e06-ee3fcb7b8212`, and Supabase reference `oakdbbzdqwurpjnoqhmu`.

Main is `5da3ba5…`, which includes PR 326's Chinese metadata language-conflict guards. Backend metadata fixes being prepared in this audit are later again. The health observation attests the previous approved pricing/Pokédex deployment, not these newer changes. The discrepancy is recorded rather than treated as an unhealthy server.

Next owner: backend specialist provides focused regression evidence; release coordinator carries the accepted runtime change through its existing lane. A new broad production operation was not undertaken under this audit request.

### C4 — Low: unreachable legacy market fallback remains in application source

`app/prices/index.tsx:724–769` retains a legacy `PRICE_API_URL/api/price/ebay` request after an unconditional return from the versioned-price path. The file explicitly calls it an unreachable rollback fallback. The only `PRICE_API_URL` uses in this file are its import and this block.

There is no demonstrated live request or latency caused by the unreachable block. It is a lean-code cleanup candidate once the owner verifies its rollback requirement is retired: remove that block/import together, retain equivalent behavior through Git history, and run the price-screen caller regressions. Do not minify the file or claim measured bundle savings from this static observation. No deletion was made.

## Integration contracts verified or explicitly limited

- Home's actual tab route re-exports `features/home/HubScreen.tsx`. History reads remain direct owner-scoped Supabase reads (`lib/homeActivity.ts:7–27`), bounded to 20 rows and one explicit additive-schema compatibility retry. Home renders at most ten sorted events before optional artwork, preserves rows on failure and checks request/account identity around enrichment (`HubScreen.tsx:2245–2305`). This is the existing runtime path; no versioned history route exists in the inspected client/router/gateway contract. The user's all-server/API direction therefore remains partly unimplemented for this flow, and an audit must not claim otherwise.
- Versioned price retrieval follows app/component → `lib/stackrDomainAdapter.ts` → `lib/stackrApiV1.ts:1053` → `backend/routes/v1.js:398` → market service, with gateway route classification. Current raw detail requests use explicit raw identity; cache scope includes account, language, GBP and condition (`lib/cataloguePrices.ts:87–102`). General list decoration is separate from holdings. Detailed pricing evidence is assigned to the pricing specialist rather than duplicated here.
- Conditional risk handed to pricing: `lib/stackrDomainAdapter.ts:1503–1541`'s disabled-versioned-API legacy fallback constructs the requested `productType` around a snapshot without verifying condition/grader/grade. Both named production EAS profiles explicitly enable the versioned API (`eas.json:116,144`), so this audit does not identify that disabled branch as the live cause. The pricing specialist should reproduce its scope before proposing a guard or retirement.
- Native haptic access is centralized: tracked `app/`, `components/`, `features/` and `lib/` contain only one direct `expo-haptics` import, in `lib/haptics.ts:1`. Preference hydration precedes native feedback, web remains a no-op, native errors are contained, and deliberate card events have cooldowns. Dispatch success is deliberately labelled `requested`, not proof that someone felt the vibration. Physical iPhone haptics remain unmeasured.
- No large refactor or dependency replacement is justified by this audit. Preserve the working bounded retrieval, cache and recovery helpers; implementation readability is not wasted runtime space.

## Checks actually executed

| Check | Result and scope |
| --- | --- |
| `npm run test:home-activity` | PASS, exit 0; eight scripts covering both schemas, actual callback behavior, original-request recovery, quantity changes, stable IDs and account switches. Simulated denial/account-change warnings are expected negative controls. |
| `npm run test:card-haptics` | PASS, exit 0; four scripts covering native dispatch/cooldown/error containment, stored preference recovery, embedded callers and 37 motion cases (37 passed, zero failed). |
| Direct production `/health` | PASS, read-only source/target attestation at the timestamp above. No price, authenticated ownership/history, catalogue data or screen acceptance claim. |
| Tracked-source comparison against signed build 54 | Confirms the C1 consumer differences. No signed archive downloaded or build submitted in this audit. |

Application typecheck/lint, backend typecheck, gateway tests and full export were not rerun for these report-only edits; their historical results are in the release receipts and are not represented as new checks. API latency, device first-useful-content time, useful price coverage, complete English translation and HD artwork coverage are unmeasured here and belong to their specialists' defined cohorts.

## Coordination

The exclusive report paths and acceptance scopes for all eight installed specialists, plus backend repair, are in `assignment-plan.json`. Dispatch is bounded to two specialists alongside the coordinator. The reviewer runs after report/fix evidence exists. A reusable agent configuration does not establish background execution; the root coordinator owns the actual continuation mechanism, repair queue and live-operation boundaries.
