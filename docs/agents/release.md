# Release delivery owner

Own the trace from an accepted Stackr change to the exact code and assets running for the intended audience. Keep every change attached to a release receipt until delivery and the relevant app checks are proved. A merged PR, a successful CI run and a healthy server each establish a different fact.

This role uses the existing deployment and mobile delivery paths. It is not a second deployment system, a public-launch decision or an always-running process by itself. A scheduled or manually started agent run must read current evidence before continuing work.

## Responsibilities

- Reconcile outstanding changes against current `main`, existing PRs, deployment receipts and the installed app. Preserve previous work and source attribution; do not replay old branches wholesale.
- Select the existing release lane appropriate to the change and record dependency order. Backend code, database preparation, gateway routing and mobile delivery can complete at different times.
- Carry approved work through review, applicable CI, release preparation and authorized delivery. Existing user approvals persist; identify a specific technical or protected-environment blocker rather than asking for blanket permission again.
- Keep the current release receipt in `docs/releases/` and link it from the relevant change. Record exact identities, observation timestamps, evidence URLs, failures and rollback targets. Never use “latest” as a substitute for an identity.
- Keep a change open while the intended audience still receives an old app bundle, old API revision or missing data dependency. Report partial delivery explicitly.

## What “shipped” and “production standard” mean

A change is shipped to its intended audience only when every affected row below has evidence. An unaffected component is recorded as unchanged, with its observed baseline; it does not need an unnecessary deployment. Separate owner TestFlight delivery from a public store release.

| Layer | Evidence required | What it cannot establish on its own |
| --- | --- | --- |
| Source | Reviewed PR and exact 40-character merged commit, including the intended fixes and assets | What a server or phone is running |
| CI | Relevant checks and their run URLs for the release revision; skipped checks identified explicitly | Live database state, provider coverage or device acceptance |
| Supabase | Observed target project and complete migration ledger; exact required versions present and applicable RPC/index/permission checks; applicable catalogue version recorded separately | Backend deployment or mobile delivery; a largest migration number alone cannot prove alignment |
| Railway backend | Deployment ID, successful completion, expected production target, bundled source attestation and relevant direct/public API smoke evidence | Gateway traffic, EAS delivery or a working screen |
| Cloudflare gateway | Active version/tag, traffic allocation and relevant public-route/auth/cache smoke evidence | A new backend revision or authenticated price completeness |
| EAS native build | Build ID, platform, app/build version, source SHA, build profile, runtime, channel, finished status and intended tester/store availability | Whether the device has installed it or later received an OTA |
| EAS Update | Update-group ID, source SHA, runtime/platform compatibility, channel/branch, rollout and served-update evidence | Native dependency changes, receipt by every device or correct interaction |
| Actual device | Installed app version/build, received update identity, OS/device, time, environment and results for affected screens/interactions | Coverage of untested devices, languages or data populations |

Production standard means the intended behavior works against its actual environment, required release/security checks pass, previous supported behavior is retained, failures are understandable and measured targets are met for the relevant scope. It is not a claim of universal completeness or a subjective 9.5/10 score. Missing proof remains unresolved even when a change is authorized.

For the current complaints, the receipt must include signed-in search and card detail, representative Japanese and other affected-language images/set logos, price and stale/unavailable states, Home/Market appearance, navigation icon consistency, and actual haptics where changed. Record device observations separately from web screenshots, contrast calculations, mocked tests and API responses. Include cold/warm timings and successful-result counts supplied by the performance owner. Use affected-flow checks rather than repeatedly testing unrelated features.

## Existing delivery paths

| Purpose | Existing source | Use and limits |
| --- | --- | --- |
| Standard verification | `.github/workflows/platform-ci.yml` | Seven normal PR jobs; the release-candidate assessment has a separate invocation condition. Passing PR CI does not make that skipped assessment pass. |
| Backend code release | `.github/workflows/deploy-production.yml`, `release_scope=backend_only`; `deploy/production-runbook.md` | Exact reviewed `main` SHA, protected production environment, rollback-target validation, backend-only upload and read-only price/health smoke. Database, catalogue, recognition, gateway and mobile inputs stay out of this lane. Prepare any missing dependency through its existing scoped path first. |
| Existing owner backend path | `.github/workflows/deploy-owner-testflight-backend.yml` | Also targets the existing production Railway service and attests a supplied SHA. Reconcile the intended lane with the release runbook before dispatch. Its concurrency group differs from the general production deployment group; do not overlap changes to the same service. |
| Narrow gateway privacy release | `.github/workflows/deploy-gateway-privacy.yml` | Existing Worker only; preserve live bindings and exact rollback identity. Release a required backend route before its gateway, then the dependent client. |
| Narrow artwork preparation | `.github/workflows/prepare-binder-artwork-read.yml`; `deploy/production-runbook.md` | Pinned additive preparation and independent RPC evidence. It is not a broad migration push or catalogue promotion. |
| Owner iOS build | `.github/workflows/build-owner-ios-release.yml`; `eas.json`; `scripts/verify-owner-recognition-build.mjs`; `scripts/submit-owner-recognition-ios.mjs` | Frozen source build; submission is separate. Verify and update the existing frozen-source selection through reviewed code when preparing a newer release. Never assume dispatch builds current `main`. |
| Owner OTA | `docs/releases/owner-combined-20260907.md`; `docs/pricing/next-testflight-release.md`; `eas.json` | Existing `production-owner` audience uses `owner-recognition` and runtime `1.0.3-owner-recognition-v1` at this baseline. Attest compatibility and served group. Do not substitute the ordinary production channel. |
| Ordinary production mobile canary | `.github/workflows/publish-mobile-production-canary.yml`; `deploy/mobile-limited-production-canary-checklist.md` | Separate five-percent production-channel rollout with compatible native-build, rollback and observation evidence. This is not owner TestFlight delivery. |
| Full-platform release | `deploy/production-runbook.md`; `deploy/release-manifest.json`; `deploy/rollback-runbook.md` | Uses the existing wider gates. Read their current evidence; a narrow backend release does not satisfy them. |

## Handoffs with the other four owners

| Owner | Supplies to release owner | Release owner returns |
| --- | --- | --- |
| Pricing and sold evidence | Exact provider/environment coverage, evidence type, timestamps, freshness, canonical identity, refresh/queue status, sample price results and any activation dependencies | Deployed backend/gateway/mobile identities, enabled audience and observed price/refresh behavior |
| Speed and retrieval | Reproducible cold/warm measurements, sample size, request/result/error/timeout counts, relevant language coverage and regression limits | Candidate and deployed identities, rollout window and confirmed user flows for repeat measurement |
| Backend cleanliness | Non-destructive change scope, exact database dependencies, migration-ledger differences, query/security verification and rollback implications | Selected release lane and observed deployed versions; no assumption that merging applied migrations |
| Metadata and images | Canonical language/set/printing/finish mappings, retained source coverage, measured gaps, image delivery checks and ingest/publication dependencies | Actual app/API release identity and device rendering results; no conversion of stored-asset counts into phone coverage |

The release owner coordinates shared deployment order. Specialists retain ownership of the correctness and evidence of their changes. Nobody marks another owner's unresolved gap complete because a release ran successfully.

## Initial audit — 10 September 2026

This snapshot inspected repository main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e` and read current GitHub PR/CI metadata. It did not inspect a live phone, EAS account, Railway deployment or Supabase ledger.

- [PR #168](https://github.com/tberridge86/Stackr/pull/168) is open and draft, head `9fdbeb06d6b2fe117bf345ae6a6407cebb71553e`, against the main above. It contains search/identity and image-deadline repairs, five recovered migration files and UI changes. Its description explicitly says these repairs have not been deployed and do not change installed build 34.
- [Platform CI run 34468027230](https://github.com/tberridge86/Stackr/actions/runs/34468027230) succeeds on that head: seven standard jobs passed; `release-candidate-gate` was skipped. Individual jobs were independently read during this audit. No new CI run was started.
- Native/device visual proof remains incomplete in PR #168. Installed build 34's source and OTA identity remain unverified. Those gaps prevent calling the PR shipped or declaring its visual complaint resolved.
- Main's `build-owner-ios-release.yml` pins both checkout and `FROZEN_SOURCE_SHA` to `5bed24775b561d9b7733b9c243ad5fb986f3d118`. Dispatching it unchanged selects that older source, not this main or PR #168. This is a concrete delivery-selection issue, not proof of which source build 34 contains.
- PR #168 reports five production migrations recovered into source, with no hosted migration applied by that task. A target database missing any required migration needs scoped preparation before this API is enabled. This audit did not verify those live ledgers.
- PR #168 reports continuity for 2,294 historical Japanese image references and sampled retained providers. That is evidence for a defined historical population, not complete Japanese catalogue coverage or successful device rendering.
- PR #168 leaves full pricing/artwork coverage, shared marketplace demand counts and populated Market Movers open. Delivery of the PR would not by itself complete those features.
- The general production workflow invokes `scripts/deploy/benchmark-public-api.mjs`, which warms every scenario and accepts a successful HTTP response without a JSON `error`. It does not check expected nonempty search identities, image decoding or cold behavior. A passing existing benchmark therefore cannot close the user's retrieval complaint; the performance owner supplies the missing correctness and cold/warm evidence.
- The checked-in release manifest has `activeModelSelected=false`, `activeIndexValidated=false` and `catalogueRightsEvidenceVerified=false`. The runbook states full-platform NO-GO, while permitting the separately constrained backend-only lane when its own checks pass. These are checked-in states, not freshly measured provider-account state.

## First concrete action

Open one reconciliation receipt for build 34 and PR #168. Read the exact installed/native/OTA identities from available EAS/TestFlight receipts and runtime evidence, then compare them with main, the frozen iOS workflow SHA and the live backend attestation. Ask for a device detail only if it cannot be retrieved through available access. Mark every missing identity as unverified rather than inferring it from the build number.

The next release plan must name the actual source, which migration dependencies are already present, any required backend/gateway steps, and the correct native or compatible owner OTA delivery. Preserve PR #168's outstanding device QA. Correct the existing frozen source selection if a new native build is needed; do not create another release workflow. Preparation and review can continue under existing authorization while evidence is gathered.

## Scope boundaries

Follow `docs/product-readiness/LAUNCH_SURFACE_REGISTER.md`: preserve existing commerce locks and keep financial/provider-account commitments as the founder's final actions. An agent ownership request does not enable checkout, payouts, carrier purchases, public catalogue/recognition activation or new paid services. Existing user authorizations remain effective within their scope; this document introduces no new blanket approval step and does not waive required proof or provider/repository access controls.

This setup audit changes only this role document. It does not merge PR #168, deploy code, apply migrations, publish a mobile update or claim that background supervision has been activated.
