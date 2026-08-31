# WP32 Readiness Dashboard

## Simple Summary

| Hierarchy | Completion | Decision |
| --- | ---: | --- |
| Approved production/staging/GitHub baseline | 100% | GO |
| Prompt 2 security containment | 100% | GO |
| WP32 overall | 33% | NO-GO |
| 096 — candidate controls | 100% | Complete |
| 097 — real-user pilot | 0% | Not started |
| 098 — final triage and decision | 0% | Not started |

WP32 uses its workbook weights: 096 is one third, 097 is five twelfths and 098 is one quarter. With 096 at 100%, WP32 is **33%** complete.

## Release Gates

| Gate | Completion | Status |
| --- | ---: | --- |
| One approved environment baseline | 100% | PASS |
| Frozen source and release scope | 100% | PASS |
| Existing main CI for frozen source | 100% | PASS — 7/7 |
| Migration alignment | 100% | PASS |
| Storage recovery evidence | 100% | PASS |
| Commerce release lock | 100% | PASS |
| Approved active model | 0% | BLOCKED |
| Validated active index | 0% | BLOCKED |
| Staging mobile binary | 100% | PASS |
| Integrated real-user pilot | 0% | BLOCKED |

## Recognition Readiness — 2026-08-31

| Item | Current evidence | Status |
| --- | --- | --- |
| DINOv2 ViT-S/14 | Registry status is `candidate`; `selectedModelId` is `null` | CANDIDATE — NOT SELECTED |
| Recognition index | No active index version; release validation gate is false | NOT ACTIVE OR VALIDATED |
| Real-camera pilot | 142 images, 6 identities and 6 physical-card sessions | DEVELOPMENT PILOT ONLY |
| Protected physical-session evaluation | One session per identity; model-selection and protected sessions are not separated | NO PROTECTED METRIC |

The published 75% top-1 result is from the six-identity development pilot. It is not protected-test or production-acceptance evidence. The smallest next evidence step is one new independent physical-card session for each of the same six cards. The pending identities and capture rules are pinned in `ml/data_manifests/protected-six-card-capture-plan-v1.json`; the source-of-truth snapshot is `deploy/evidence/recognition-readiness-2026-08-31.json`.

## Evidence Produced in 096

- Source commit and tree are pinned.
- The existing web/source export passed.
- The exported bundle secret scan passed.
- The pinned staging APK built, validated and uploaded successfully.
- Its package, version, signature, alignment and SHA-256 checksum passed.
- Every WP32 criterion maps to evidence.
- A CI job checks the freeze, blocker truth and negative GO cases.
- No catalogue or product feature file changed.

## Missing Before 097 Can Start

1. An approved active model and validated index for recognition testing.
2. Named pilot participants and an agreed pilot window.

## Decision

**NO-GO.** The staging APK exists, but there is no approved model/index or real-user pilot evidence. No blocker is waived.
