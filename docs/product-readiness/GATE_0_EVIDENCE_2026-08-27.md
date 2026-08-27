# Gate 0 evidence — 27 August 2026

**Decision:** **NO-GO — the final hardening candidate has not completed GitHub CI, merge, or staging proof.**

Gate 0 requires evidence that no financial route can execute through the UI, API, provider layer, or database. PR #58 established a green merged baseline. The additional hardening candidate is complete and independently clean in the local integration worktree, but local evidence is not live evidence and does not close the gate.

## Candidate identity

| Item | Recorded value | Meaning |
| --- | --- | --- |
| Merged baseline | PR #58, merge `314e5e2f09b8cbbb7dc3b36469d373eb99a61980` | Already merged; this is not the final Gate 0 hardening candidate. |
| Baseline GitHub Actions | Run `33071150579`, all seven jobs green | Valid only for the PR #58 baseline. |
| Reviewed hardening code anchor | `d9443e2581ac8efaca5993cfd567d752af741bb1` | UI, API, database and isolated staging-workflow changes are integrated and independently clean locally. The evidence-only documentation commit follows this anchor; the exact final remote head will be recorded after publication. |
| Final PR / CI / merge | **Pending** | A fresh PR and complete GitHub matrix must run on the exact final candidate before merge. |
| Staging deployment and live proof | **Pending** | No deployment of `d9443e2` has been dispatched; no live smoke or post-migration proof is claimed here. |

## Evidence status

| Required evidence | Status | Current evidence | Close condition |
| --- | --- | --- | --- |
| Reviewed final candidate | **Pass locally** | Code anchor `d9443e2` integrates the reviewed UI/API, database-containment and main-only staging-workflow changes. Independent source, database and workflow reviews are clean; only this evidence document follows that anchor. | Record the exact remote head after publication and preserve its tree through the final PR and merge. |
| Merge SHA | **Pending** | PR #58 baseline merge `314e5e2` is recorded; the final hardening candidate is not merged. | Merge only the exact final PR head after every required check passes; record its merge SHA. |
| Complete CI | **Pending on final candidate** | Baseline run `33071150579` is green, with all seven jobs successful. The complete local suite is green on `d9443e2`. | Require all seven GitHub jobs to pass on the exact final PR head. |
| Staging deployment path | **Pass in source; dispatch pending** | The staging workflow is main-only, locks legacy paths, and has an isolated `gate0_hardening` scope. The founder manually selected and saved `main` for the GitHub `staging` environment; connector access cannot independently inspect bypass settings. Gate 0 rejects mobile publishing and requires the containment migration path. | Before dispatch, confirm the run targets the `staging` environment from the final merged `main` SHA; retain the workflow inputs, logs, job results and deployed revision. |
| Staging deployment | **Not run for final candidate** | No live mutation or provider activation has been performed for `d9443e2`. | Run the exact Gate 0 staging dispatch and require every deployment, smoke, rollback-rehearsal and database-proof step to pass. |
| UI hard lock | **Pass in source; staging proof pending** | Checkout, cash terms, Stripe onboarding, provider shipping and order/fulfilment actions are absent or blocked. Browse-only listings and card-for-card offers remain non-financial. | Confirm the staged bundle/revision and run the UI smoke matrix against that deployment. |
| API hard lock | **Pass in source; staging proof pending** | All 11 Stripe/Shippo routes return the exact disabled contract before authentication, validation, database access or provider execution. Backend tests pass `19/19`; commerce-disabled smoke passes `12/12`. | Run the same contract against the deployed staging gateway and retain request/response evidence. |
| Provider-call containment | **Pass in source; live proof pending** | Disabled handlers return before any Stripe or Shippo SDK operation. Provider accounts, plans, credentials and paid services remain untouched. | Prove the staged routes return the disabled contract and that the smoke window produces no provider execution. |
| Database hard lock | **Pass in source; staging apply/proof pending** | The forward-only Gate 0 migration, exact ledger checks, rollback rehearsal, trigger/ACL proof and hostile fixtures are clean locally. The current live read-only baseline has 146 ledger rows and zero prohibited financial/fulfilment rows; the Gate 0 ledger row is not yet present. | Apply the exact candidate migration through the staging workflow, require ledger row 147 and all containment checks, then repeat the zero-state proof. |
| Launch-surface decision | **Pass** | `LAUNCH_SURFACE_REGISTER.md` is the single **Expose / Conditional / Hide** register. Stripe and Shippo financial setup remains the founder's final action. | Keep every `Hide` surface absent until its later activation evidence is accepted. |

## Locked API contract

Every route below must return the exact lock response before authentication, validation, database access, or provider SDK execution.

| Provider | Routes | Required response |
| --- | --- | --- |
| Stripe | `POST /api/stripe/create-connect-account`; `GET /api/stripe/account-status`; `POST /api/stripe/create-account-link`; `POST /api/stripe/create-payment-intent`; `POST /api/stripe/create-trade-cash-payment-intent`; `GET /api/stripe/onboarding-complete`; `GET /api/stripe/onboarding-refresh` | `503`, `payments_disabled`, `Payments are disabled for this release.` |
| Shippo | `GET /api/shippo/status`; `POST /api/shippo/rates`; `POST /api/shippo/labels`; `GET /api/shippo/track/:carrier/:trackingNumber` | `503`, `shipping_disabled`, `Shipping is disabled for this release.` |

The smoke proof also requires a non-empty request-ID response header and the same request ID in the response body. Any route mismatch is a failed deployment.

## Local validation completed on `d9443e2`

- Backend route tests: pass, `19/19`.
- Gateway tests: pass, `23/23`.
- Commerce-disabled deployment smoke: pass, `12/12`.
- API contract coverage: pass, `33/33` operations.
- Repository secret scan: pass, 1,022 files.
- Exported web-bundle secret scan: pass, 99 files.
- Web export: pass, 92 routes.
- Marketplace dynamic-copy fixtures: pass, 138 hostile and 18 safe cases.
- Minty dynamic-copy fixtures: pass, 35 hostile cases.
- Frontend/backend typecheck, lint, commerce release lock, database migration/security checks and deployment-tooling checks: pass.

These results support the final PR review. They are not substitutes for GitHub CI on the exact final head or live staging evidence.

## Exact staging dispatch after the final merge

Run **Deploy Stackr Staging** from the final merged `main` SHA with:

| Input | Required value |
| --- | --- |
| Confirmation | `DEPLOY STAGING` |
| `release_scope` | `gate0_hardening` |
| `apply_migrations` | `true` |
| `release_candidate` | `false` |
| `publish_mobile_update` | `false` |

The isolated Gate 0 path applies and proves the containment migration but cannot publish a mobile update. It does not require Stripe, Shippo, EAS paid-build, provider-plan or live-credential setup.

## Safe close sequence

1. Publish the current reviewed tree, record its exact remote head SHA, open the final hardening PR and verify the remote tree matches locally.
2. Run all seven GitHub CI jobs on that exact PR head; resolve any failure without changing the candidate identity silently.
3. Review and merge only the green exact head; record the final merge SHA.
4. Dispatch staging from merged `main` with the exact Gate 0 inputs above.
5. Retain the staging job results, deployed revision, gateway disabled-route smoke, migration/rollback-rehearsal output and post-deploy database proof.
6. Close Gate 0 only when the final merge, CI and live staging rows in this document can be changed to **Pass** with recorded evidence.

No Stripe or Shippo subscription, paid plan, account activation, EAS paid build, or live credential is needed to close Gate 0. Those financial commitments remain the founder's final action after all non-financial release gates pass.
