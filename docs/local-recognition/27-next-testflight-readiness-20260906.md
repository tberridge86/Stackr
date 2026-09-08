# Owner recognition — next TestFlight queue handoff

Readiness-only assessment, 6 September 2026. Base: fetched `origin/main` at
`9c3d00eb76f2682a0f7a23d6b31f722afb534fde`. This pass did not build, upload,
deploy, publish an update, refresh prices or mutate remote data.

## Already merged and previously released

- PR #132 (`b852318`) added the owner-authenticated SigLIP FP32 route and private
  on-device capture dataset. PR #135 (`daad49f`) includes native pixel-scale
  correction and the owner release/submission safeguards. Both are on the base.
- The old owner task branch's screen, client, photo preparation, capture contract,
  release documentation and iOS evidence match the base exactly. Its pre-squash
  commits must not be replayed.
- `deploy/evidence/owner-recognition-ios-release-2026-09-05.json` records
  **1.0.3 (25)**, EAS `e27175bd-321c-4719-bf8c-87e8b64d427c`, Apple status
  `VALID` / `IN_BETA_TESTING`, with the exact build assigned only to the verified
  owner internal group at the recorded check time.
- `deploy/evidence/owner-siglip-railway-smoke-2026-09-05.json` and the owner
  recognition guide record prior authenticated service activation and the pinned
  48,011-reference gallery. These are historical release attestations, not fresh
  live-service checks performed by this readiness pass.

## New scoped change to queue

An asynchronous owner-verification response could complete after an account
switch. Capture deletion previously used that response without the current-session
recheck already used by saving/listing. Deletion now preserves server identity
verification and checks the active account immediately before deleting the exact
capture directory. Account switch and sign-out regressions perform no filesystem
deletion. Server rejection and invalid capture identifiers still fail closed.

Only these implementation/test files change:

- `lib/ownerRecognition.ts`
- `lib/ownerCaptureDeletion.ts`
- `scripts/test-owner-capture-deletion.ts`
- `package.json`: adds the new test to `test:owner-recognition`; no version or
  dependency changes.

Worktree: `D:/Stackr-1/.worktrees/owner-recognition-testflight-queue-20260906`.
Branch: `codex/owner-recognition-testflight-queue-20260906`.
The coordinator owns integration, PR timing, final combined build and queue.

## Verification

- `npm run test:owner-recognition`: passed all 16 backend auth/HTTP tests, capture
  result contract, new deletion races, photo geometry/cleanup, native pixel-scale
  source guard, EAS archive dependency closure, owner build isolation, and
  submission **dry-run** tests. No native build or submission ran.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors and ten existing warnings in unrelated
  app/components files. Targeted lint for the three deletion implementation/test
  files passed without warnings.
- `git diff --check`: passed. `app.config.js`, `app.json`, `eas.json`, lockfile,
  native rectifier and operating boundary are unchanged from the base.
- Existing root and backend dependency installations were linked for module
  resolution into the isolated worktree. The initial owner-suite attempt lacked
  backend `sharp`; linking the existing backend dependencies resolved that
  environment issue, and the complete suite then passed. A new dependency install
  and full export/native build were deliberately not run in parallel with other
  tasks.

The Supabase skill informed the preservation of server `getUser` verification;
the existing `getSession` wrapper is only an additional current-account race
guard, not a substitute for server authorization. Current changelog and auth
documentation were checked; no Supabase API/configuration/schema change was made.
The deterministic tests use simulated timing and identities, not real captures
or a production auth experiment.

## Explicitly outside this queue item

- No new model activation, native model pack change, source-rights change,
  automatic acceptance, auto-add, training or public recognition expansion.
  Version remains `1.0.3`; owner runtime/channel and build settings are unchanged.
- General scanner private-upload/fallback experiments remain uncommitted in the
  shared dirty `D:/Stackr-1` checkout. They are not the already released dedicated
  owner route, and this pass did not import or activate them.
- The recent CoroCoro library, source-link research and catalogue image previews
  remain local development work. Their development/web/loopback gate and local
  supplied-image helper do not make them native TestFlight features. They were
  not mixed into this capture reliability patch or another task's CJK changes.

## Remaining product/measurement limitations

The owner route requires internet and private-server inference; the unfinished
native pack is not used. There is no verified phone installation/camera outcome,
real-device accuracy percentage, memory/latency/crash report, protected
zero-overlap real-capture benchmark or capture export/backup in this pass.
Capture listing/deletion retain their existing authenticated online identity
check. Saved photos remain device-local and can be lost on uninstall.

After the coordinator's combined artifact is ready, verify its exact owner
runtime/channel and actual Apple audience, then test camera capture, retakes,
manual variant review, save/reopen/delete, account switch and service-offline
diagnostics on the owner's phone. Do not turn these unit tests or the historical
reference smoke into a claim of real-device recognition accuracy.
