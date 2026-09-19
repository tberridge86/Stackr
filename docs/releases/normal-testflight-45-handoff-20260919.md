# Stackr normal TestFlight 1.0.3 (45)

Status: **Delivered to normal TestFlight testing; Apple approval and both tester
groups independently verified at 21:06:12 UTC on 19 September 2026.**

The user authorized the normal Stackr app for TestFlight testing. This is a test
candidate; ordinary production acceptance and public App Store release remain held.

## Exact candidate

- Repair PR: [#210](https://github.com/tberridge86/Stackr/pull/210), still draft.
- Native source: `632042d59ea0016c2f985f8f5a676e2dbee3fa44`.
- Included repairs: pricing #207, scanner configuration #201, artwork #208,
  Japanese logos #203, and Chinese pack #204 with 123 exact mappings.
- Holographic viewer #209 and future Speed/UI/Settings work are deferred. A fresh
  task-scope check found no newer accepted runtime repair source to reconcile.
- The only changes since previously validated `4adfc99e43986b59c725b3f833db18116bd07bef`
  select the normal profile through the existing native workflow and add its
  focused regression guard. App code and assets are unchanged from that candidate.
- Isolated checkout: `C:\Users\berri\.codex\worktrees\stackr-normal-build42\Stackr-1`.
  The dirty original checkout and integration owner's local notes were preserved.

## Native and upload identities

| Item | Verified identity |
| --- | --- |
| App | Stackr `1.0.3 (45)`, iOS, `com.tommo86.Stackr` |
| EAS build | `5a3fcd98-0b12-4234-aea9-eb12407a2811`, FINISHED at 20:54:57 UTC |
| Build profile / channel / runtime | `production` / `production` / `1.0.3` |
| Fingerprint | `74ee76ab8d924830ff32cbaa23c25559d9c36e9f` |
| IPA SHA-256 | `b24c7392c93639dc4dc4e5152badd82188e77ad39fecc603dc6eec7a82fec81d` |
| Signing team | `K82N877J3F`; matching app entitlement verified from the IPA |
| Embedded update | `e195fc3c-5be7-4223-88b3-04ebcbb75485` |
| EAS submission | `b1f1f0c1-8b87-4764-9cbc-437f3f876fca`, FINISHED at 20:57:44 UTC |
| Apple app | `6772118450` |
| Apple build | `47a984e9-39d3-44fa-a6e6-baa34fe71f68`, processing `VALID` |
| Apple beta review | `APPROVED` |
| Tester availability | `IN_BETA_TESTING` for internal and external testing; both existing groups bound |

The IPA's version, build, bundle, runtime and channel were independently read and
matched. Its embedded manifest has no source SHA; the source attribution comes
from the matched EAS build receipt. The normal production channel had no iOS OTA
for runtime `1.0.3` at the check; actual device launch identity remains to verify.

Build numbers 42/43 were consumed by source upload failures before native jobs
existed. Attempt 44 uploaded successfully but stopped on a local dependency-link
fingerprint error. A clean locked install and successful fingerprint preflight
preceded build 45. No checks were skipped to resolve those failures.

The first submission attempt was rejected before creation because optional EAS
tester-note upload requires its Enterprise plan. The accepted submission omitted
that optional feature. The en-GB tester notes were set and independently read back
through the existing Apple app's ordinary metadata API, with no subscription or
credential change. Existing review contact/demo metadata was retained. Beta review
of this exact build was requested and approved; this was not a public App Store
review or release.

## Validation and remaining acceptance

All 12 active checks passed on exact source `632042d`; the separately invoked
`release-candidate-gate` and `canary-api-evidence` were skipped and remain open.
Evidence: [Platform CI](https://github.com/tberridge86/Stackr/actions/runs/35467923331),
[pricing](https://github.com/tberridge86/Stackr/actions/runs/35467923412),
[gateway/app](https://github.com/tberridge86/Stackr/actions/runs/35467923377),
[UI](https://github.com/tberridge86/Stackr/actions/runs/35467923371), and
[candidate tests](https://github.com/tberridge86/Stackr/actions/runs/35467923434).
Normal runtime configuration, the workflow change and upload-retry failure paths
also passed focused checks. Native build and IPA verification passed.

1. **Delivery complete:** exact en-GB tester notes, Apple `VALID`/`APPROVED`, and
   build 45 availability in both `Team (Expo)` and `Stackr Beta Testers` were
   independently verified. Install/update through the existing
   [TestFlight link](https://testflight.apple.com/join/qDmymuVm).
2. On a physical iPhone running the normal app, prove 10/10 native captures reach
   the existing scan pipeline. Also verify close/reopen, background/resume and
   fresh launch. Record installed build, device/OS, permission, loaded update and
   timing. Owner recognition, Expo Go, mocks and recognition accuracy do not
   substitute for this capture proof. The default-off diagnostic trace in the
   dirty checkout is not included in this binary.
3. Verify confirmation/manual correction/save and reopen, sign-in/account
   isolation, artwork and logos, finish/quantity persistence and failure states.
4. New Binder prepared valuations require the separate additive pricing migration
   and compatible API/gateway/worker deployment before activation. This test build
   may show **Stored valuation pending**; Home has the existing-server fallback.
   No remote database, service, provider, price refresh or scheduler change was
   performed here. Catalogue-wide fetching remains disabled.
5. Keep artwork exceptions explicit: 245 confirmed face gaps, 58 further Base Set
   placeholders avoiding unverified edition aliases, 11 unmapped Chinese logos and
   four missing-image source entries. Exact mapping coverage is not full catalogue
   coverage or device rendering proof.

Public production remains held pending those applicable device/dependency gates,
current staging evidence, validated ordinary-production rollback targets and
rollout/monitoring evidence. Prior owner build 41 remains observed in TestFlight;
it is a different runtime and does not prove a normal-production rollback target.
Existing recognition, catalogue and commerce constraints remain in force.

No main merge, public App Store release or production OTA was performed. This
handoff distinguishes implemented/tested, native-built/uploaded and device-verified
states; physical-device acceptance is still unmeasured.

Release controls: [production runbook](../../deploy/production-runbook.md). The local coordination checklist is `D:\Stackr-1\deploy\production-release-gates-2026-09-19.md`.
Local sanitized receipts and the exact IPA are in the isolated checkout's
`outputs/releases/` directory.
