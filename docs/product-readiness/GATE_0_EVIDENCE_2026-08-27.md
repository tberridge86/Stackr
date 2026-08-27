# Gate 0 evidence — 27 August 2026

**Decision:** **NO-GO — do not merge or deploy yet.**

Gate 0 requires proof that no financial route can execute in the UI, API, provider layer, or database. The reviewed source candidate now fails closed, but the candidate is not on GitHub, the staging environment is not centrally protected, and the live database does not yet provide a hard write lock for every commerce-shaped state.

## Evidence status

| Required evidence | Status | Evidence | Close condition |
| --- | --- | --- | --- |
| Reviewed PR candidate | **Prepared locally** | Source containment review found no remaining execution bypass. Financial UI/copy is hidden or converted to offers/card-for-card wording. | Push the exact local candidate to PR #58 and obtain human approval on that head SHA. |
| Merge SHA | **Missing** | PR #58 remains open on remote head `0831f6b53aa03d1e2fd7fdf60be125826207644d`; the hardened local candidate cannot be pushed without GitHub write authorization. | Merge only after all required checks pass on the new head; record the resulting merge SHA. |
| Complete CI | **Pending on candidate** | The seven GitHub checks are green only on the older remote head. Local lock, typecheck, lint, backend, gateway, deployment, secret-scan and web-build gates pass on the hardened source. | Run the complete GitHub matrix on the pushed candidate and require every check to pass. |
| Staging environment policy | **Fail** | The GitHub `staging` environment reports no protection rules and no deployment branch policy; administrators may bypass it. A legacy branch therefore remains a deploy path. | Restrict the environment to `main`, disable bypass, then remove or update the legacy deploy workflow/branch. |
| Staging deployment | **Not run** | Deploying before environment protection and candidate CI would make the release gate bypassable. | Deploy the exact merge SHA with migrations and mobile publishing disabled. |
| UI hard lock | **Pass in source** | Runtime environment variables cannot override the source approval; checkout, cash terms, Stripe onboarding and Shippo-connected surfaces are unavailable. | Confirm the deployed bundle SHA and run device/web smoke tests against the staged build. |
| API hard lock | **Pass in source; staging proof pending** | Backend tests pass `14/14`. The deployment smoke contract requires exact `503`, exact disabled code/message, and matching header/body request IDs for all 11 Stripe/Shippo routes. | Run the contract against the deployed staging backend and retain the output. |
| Provider-call proof | **Missing** | Local tests prove handlers are not reached, but cannot prove a deployed system made zero Stripe/Shippo calls. | Capture provider or egress logs for the smoke window and prove zero calls. |
| Database hard lock | **Fail** | Read-only staging inspection found client-writable commerce-shaped state, including `trade_cash_terms` and payment/status fields. The live migration ledger is 40 entries ahead of the repository. | Reconcile migration history first, then apply and test a forward-only deny-by-default database lock. |
| Launch-surface decision | **Pass** | `LAUNCH_SURFACE_REGISTER.md` is the single Expose / Conditional / Hide register. Stripe and Shippo setup is explicitly the founder's final activation step. | Keep all `Hide` rows absent until their named evidence is accepted. |

## Locked API contract

Every route below must return the exact lock response before authentication, validation, database access, or provider SDK execution.

| Provider | Routes | Required response |
| --- | --- | --- |
| Stripe | `POST /api/stripe/create-connect-account`; `GET /api/stripe/account-status`; `POST /api/stripe/create-account-link`; `POST /api/stripe/create-payment-intent`; `POST /api/stripe/create-trade-cash-payment-intent`; `GET /api/stripe/onboarding-complete`; `GET /api/stripe/onboarding-refresh` | `503`, `payments_disabled`, `Payments are disabled for this release.` |
| Shippo | `GET /api/shippo/status`; `POST /api/shippo/rates`; `POST /api/shippo/labels`; `GET /api/shippo/track/:carrier/:trackingNumber` | `503`, `shipping_disabled`, `Shipping is disabled for this release.` |

The smoke proof also requires a non-empty request-ID response header and the same request ID in the response body. Any route mismatch is a failed deployment.

## Local validation completed

- Commerce source-lock test: pass.
- Frontend typecheck: pass.
- Backend typecheck and tests: pass, `14/14`.
- Lint: pass with zero errors; 12 pre-existing warnings.
- Deployment tooling: pass.
- Commerce-disabled smoke test: pass, `7/7` test cases covering all 11 routes and deliberate failure modes.
- API contract coverage: pass, `33/33` operations.
- Gateway tests: pass, `23/23`.
- Secret scan: pass, 944 repository files; Stripe and Shippo token patterns included.
- Web export: pass, 92 static routes.

These local results are supporting evidence, not a substitute for GitHub CI on the candidate SHA or staging smoke evidence.

## Safe resume sequence

1. Grant this workspace GitHub write access.
2. Protect the GitHub `staging` environment: `main` only, no administrator bypass. Apply the same release discipline to production.
3. Push the hardened candidate to PR #58; rerun all seven CI jobs on its new head SHA.
4. Review and merge only that green SHA; record the merge SHA.
5. Reconcile the 40-entry staging migration drift. Do not apply repository migrations until the ledger and live schema are baselined.
6. Add and validate a forward-only database containment migration that denies client writes to cash, payment, shipping and order state while Gate 0 is active.
7. Dispatch staging from `main` with `apply_migrations=false`, `release_candidate=false`, and `publish_mobile_update=false` unless the reconciled containment migration has been separately approved.
8. Verify the deployed revision, run `smoke.mjs --require-commerce-disabled`, capture database before/after evidence, and prove zero provider calls.
9. Close Gate 0 only when every row in the evidence table passes.

No Stripe or Shippo subscription, paid plan, account activation, or live credential is needed for these steps. Those commitments remain the final founder action after the non-financial release gates pass.
