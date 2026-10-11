# Scanner 200-trial and action-to-content test protocol — 11 October 2026

## Purpose and current state

This protocol prepares evidence collection for the owner's scanner and retrieval targets using the repository's existing formats only. It neither changes `lib/stackrQualityEvaluation.ts` release gates nor creates benchmark rows, capture data, images, database records, cloud requests, provider calls, schedules or runtime changes.

**Source reviewed:** `fcf697bab7785c3ed87747ed1721e9c033818557` in the integration worktree on Windows, 11 October 2026. The owner has declared the reference baseline as **iPhone 15 Pro, installed Stackr 1.0.6 (54), 5G mobile data; owner-reported iOS 26.6.1**. Carrier, signal/bandwidth and account scope remain unknown. This is declared test context, not an observation: actual observations are **0**. Build 54 is a fixed baseline only; any future candidate must state its own matching app/OTA/source, scanner/model/index and catalogue identities before comparison. There are currently zero real test cases, zero observations and zero performance rows in the supplied quality templates. This is a protocol, not a benchmark result or readiness claim.

## Existing inputs and tools

| Purpose | Existing path/tool | What it does now |
| --- | --- | --- |
| Gold-case format | `data/quality/gold-test-set.template.json`; `lib/stackrQualityEvaluation.ts` `GoldTestSetManifest` / `GoldTestCase` | Holds authorised image, physical-card/session, canonical card, variant, finish, language and condition fields; rejects duplicate case/image IDs and split leakage. |
| Observation format | `data/quality/quality-observations.template.json`; `QualityObservation` | Holds ranked candidates, outcome, confirmation, confidence, latency, model and index. |
| Evaluator | `scripts/evaluate-stackr-quality.ts`; `evaluateStackrQuality` | Calculates top-one/top-three/top-five, variant and finish accuracy, capture-condition breakdowns, p95 and immutable quality gates. |
| Calibration summary | `lib/scannerCalibration.ts`: `summarizeBenchmarkObservations`, `summarizeBenchmarkBreakdowns`, `evaluateScannerReleaseReadiness` | Summarises existing scanner benchmark rows and regression comparisons. Its current 60-versus-60 comparison threshold is not the owner's 200-trial requirement. |
| Stored benchmark report | `scripts/build-scanner-evidence-report.ts` | Renders stored benchmark rows and analytics; it requires real Supabase credentials and is not invoked by this protocol. |
| Scanner path checks | `scripts/test-stackr-mobile-scanner-routing.ts`, `scripts/test-scanner-recognition-pipeline.ts`, `scripts/test-scanner-calibration.ts` | Local controlled checks of routing, pipeline and calibration behaviour; not device accuracy evidence. |

## Five-language nominations

The following are nominations from the existing small acceptance cohort, not a 200-trial ground-truth set. Their record is `docs/audits/20261011/five-language-acceptance-cohort.json` and its receipt is `docs/audits/20261011/five-language-acceptance-cohort.receipt.json`. The receipt is a public-response baseline, not independent physical-card or finish verification.

| Cohort case | Nominated identity | Role in this protocol | Current boundary |
| --- | --- | --- | --- |
| `en-me04-053` | English `me04` 053, card `14bac4a2-8a7b-4e65-87b9-c13e8303e84b` | English anchor | Receipt records normal default and same-artwork reference; real physical card/authorised capture still required. |
| `ja-sv4a-001` | Japanese `SV4a` 001, card `b899c65c-0fda-4cc8-8a8f-60469221fa7a` | Japanese anchor | Public baseline only; independently verify every trial's printing/finish. |
| `zh-cn-cs1bc-097` | Simplified Chinese `cs1bc` 097, card `a9160ee2-62f0-4450-97ea-c582c8aafb8d` | Simplified-Chinese anchor | Map cohort `zh-cn` to evaluator `zh-Hans` only when the capture/identity record supplies that canonical language. |
| `zh-tw-svam-013` | Traditional Chinese `SVAM` 013, card `ccb7c095-8103-4a10-b205-eb9a23725c10` | Traditional-Chinese anchor | Map cohort `zh-tw` to evaluator `zh-Hant` only when the capture/identity record supplies that canonical language. |
| `ko-sv4m-045` | Korean `SV4M` 045, card `001fc80e-05c1-44d8-a120-d3a1fac170cf` | Korean anchor and missing-image regression candidate | Receipt reports a missing native image and a recovered asset without a variant-specific asset; it cannot establish physical finish from same-artwork data. |

Do not use `zh-tw-sca-120-known-wrong-name` as a positive recognition ground truth. It remains a name-regression control until the documented correction is released and independently verified.

## Trial design: at least 200 actual recorded trials

The release evidence denominator is **at least 200 recorded trials in total**; it is not a new requirement for 200 controlled trials. A practical minimum plan is 40 actual trials per evaluator language (`en`, `ja`, `zh-Hans`, `zh-Hant`, `ko`) for a total of 200. The five nominations above should appear only after their own independent ground truth is established; add further independently verified printings to meet the distribution. Repeated captures are permitted only when their physical-card and capture-session IDs are correctly recorded; they must not turn one unverified identity into coverage.

For every trial, record in the current `GoldTestCase` shape:

- unique `caseId`, `imageId`, `physicalCardId` and `captureSessionId`;
- `authorizedForEvaluation: true` only after the image/physical card is authorised for evaluation;
- independently verified `canonicalCardId`, `variantId`, `finishCode`, language, set/collector identity in the capture record, item type, era, finish class, value tier and existing `captureConditions` values;
- the existing split (`model_selection`, `final_test` or `no_match_test`), keeping every physical card and capture session in exactly one split;
- one matching `QualityObservation` after a real scan, including rank-ordered candidate identities, match state, confirmation state, total latency, model version and index version.

Create a simple companion receipt outside the evaluator data if needed to label each trial `controlled` or `difficult`, its angle and lighting details. Keep it keyed by `caseId`; do not fabricate those labels in the gold manifest. Report controlled and difficult results separately. The existing conditions support this without a schema change: controlled can use `clean`, while difficult cases use the applicable existing `glare`, `blur`, `perspective_distortion`, `partial_crop` or `duplicate_artwork`. State the exact classification rule before recording the first trial.

The distribution must include all five languages, several sets, normal and parallel finishes where physical ground truth is available, and a spread of lighting and angles. A card whose finish is unverified does not count in the finish denominator. Each language/set/finish/condition count must be reported with its numerator and denominator; none may be inferred from overall 200.

## Identity, ambiguity and user safety

Measure two different things from each real observation:

1. **Card-name accuracy:** whether the intended card-name identity appears at the relevant rank. Record it in the trial receipt from independently verified ground truth; never infer it from a non-empty candidate.
2. **Exact-printing accuracy:** whether the first/top-three candidate matches the independently verified canonical card, variant and finish. Use existing `variantAccuracy` and `finishAccuracy` alongside the candidate canonical ID; report each denominator separately.

Ordinary same-artwork variants, cohort asset references and visual similarity do **not** establish a physical finish. Where print/finish evidence is absent or candidate separation is ambiguous, record `ambiguous` or `probable`, require user confirmation, and do not silently save the match. An uncertain result is a correct safety outcome only when the app asks for confirmation; it is not an exact-printing success.

## Ready-to-run local commands

The commands below operate on tracked templates or local fixtures only. They do not create a credible result from empty inputs.

```powershell
# Existing local routing/pipeline/calibration safeguards.
node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-stackr-mobile-scanner-routing.ts
node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-scanner-recognition-pipeline.ts
node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-scanner-calibration.ts

# Deliberately fails with empty, unapproved templates: there are no eligible
# observations and --fail-on-gate turns insufficiency into a non-zero exit.
npx tsx scripts/evaluate-stackr-quality.ts `
  --manifest data/quality/gold-test-set.template.json `
  --observations data/quality/quality-observations.template.json `
  --output outputs/quality/empty-scanner-protocol-report.json `
  --fail-on-gate
```

Once real authorised captures are available, copy the templates to a versioned local evidence pair, retain the same structures, and run the evaluator against those two local files. It should still fail while fewer than 200 total recorded trials, missing observations, unapproved policy, unknown ground truth or failed immutable gates remain. Do not mark a template as locked or set `evidencePolicy.approved` merely to change that result.

## Action-to-content receipt: search, set and card

The owner also requires 100 warm and 100 cold observations **per journey and cache condition** for search, set and card: 600 action-to-content observations before separate image-completion observations. The timer starts at the actual user tap or committed text input, **before** Search's 240 ms debounce. It ends at the first correct, usable rendered content; full correct image completion is a separate time and outcome.

For each row retain time, whether it is the declared build-54 baseline or a matching future candidate, installed app/OTA and source identity if known, device/OS, carrier and 4G/5G state if shown, network signal/bandwidth if available, test account scope, language, canonical expected identity, journey, warm/cold cache state and cache age, action timestamp, first usable content timestamp, final image state/timestamp, request/trace identifiers, error/timeout/cancellation state, and whether the displayed identity was correct. A cold app cache does not prove a cold gateway/database cache. Failed or timed-out operations remain in the attempt count and are never recorded as zero duration.

Existing source hooks are useful but incomplete: `app/(tabs)/search.tsx` logs first results only; `lib/performance.ts` development helpers are not production telemetry; and `beginBinderRetrieval` / `getBinderRetrievalObservations` record binder screen-load rather than the requested search/set/card action. Use them to verify a planned receipt field, but do not treat their local timings as iPhone evidence. `components/StackrImage.tsx` supplies `onLoad` and `onError` boundaries for the separate image outcome; attach the selected candidate and expected identity in the receipt.

## Completion rule

This protocol becomes evidence only after it contains real authorised captures and observations, the five-language cohort is independently grounded as appropriate, controlled/difficult and image outcomes are separated, and all denominator/device/network/revision details are stated. Until then scanner readiness, action-to-content p95 and installed-device acceptance remain unmeasured.
