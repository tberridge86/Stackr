# WP32 Release Scope

## Status

WP32 is **33% complete** and **NO-GO**.

| Task | Completion |
| --- | ---: |
| 096 — traceability, CI and release candidate | 100% |
| 097 — closed integrated pilot | 0% |
| 098 — defect triage and final decision | 0% |

## Frozen Candidate

- Candidate: `stackr-1.0.3-rc.0`
- Source commit: `d80b0f82843710c7eb942f1e97533ea0af77447c`
- Source tree: `2591147dd7b1fe90bd635ebdc4784bf614e168f4`
- Version: `1.0.3`
- Target: internal Android staging build
- Mobile binary: built and checksum-verified
- APK workflow: `33215027943`
- APK SHA-256: `2cb00ed899cb79fffb5b7450320e164922eafaf19819a085235979d8f083d2e7`

The product tree is the approved Prompt 2 merge. WP32 adds release-control evidence only; it does not alter the candidate product tree.

## In Scope

- Pin the candidate source.
- Map every WP32 criterion to evidence.
- Add a fail-closed CI guard.
- Verify the existing source can export.
- Record blockers honestly.
- Prepare the closed pilot using the verified staging APK.

## Out of Scope Until WP32 Is 100%

- Catalogue changes.
- New features.
- Production deployment.
- Live database migrations.
- Model or index activation without evidence.
- Enabling production seller, stock or payment writes.

## Change Rule

Only the release-control files listed in `deploy/wp32-release-candidate.json` may differ from the frozen candidate commit. The verifier fails if another tracked or untracked repository file changes.

The owner approved this control packet at `2026-08-28T16:58:12Z`. Committing the listed control files is now allowed. This approval does not change the release decision from NO-GO.

## Exit Rule

GO is impossible while any critical gate is blocked. Today the blocked gates are:

1. Approved active model.
2. Validated active index.
3. Real-user integrated pilot.
