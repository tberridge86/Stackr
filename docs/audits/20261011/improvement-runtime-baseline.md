# Runtime, pricing and scanner improvement baseline — 11 October 2026

## Scope and method

This is the baseline for targets 5–8 and 10 of the owner's current improvement
brief: user-action-to-content latency, API contracts and duplicate requests,
shared card haptics, weekly pricing/change evidence, and scanner benchmark
readiness. It is a source/evidence review only. No application, runtime,
configuration, schedule, provider, database, deployment, or device was
changed; no paid or live source was called.

**Source reviewed:** `fcf697bab7785c3ed87747ed1721e9c033818557`, integration
worktree, Windows, 11 October 2026. The effective app build, OTA identity,
gateway/backend revision, catalogue version, test iPhone/OS, network and test
account are **unverified**. Accordingly, no source or fixture result below is
reported as iPhone timing, real API reliability, pricing coverage, or scanner
accuracy.

The existing release receipt records iOS `1.0.6 (54)` from different frozen
source `bf3d7a…`, and the 10 October pricing receipt records a deployed backend
from different source `9fae8fac…`. Neither proves that this source is installed
or measures its user journeys.

## Ledger

| Target | Baseline | KPI | Coverage/sample | Evidence | Remaining gap | Delivery state |
| --- | --- | --- | --- | --- | --- | --- |
| 5. Fast retrieval | **Unmeasured** end to end. Search has a 240 ms debounce, cached-card first paint, phased result publishing, request-ID guards and a 4 s final-settlement bound. Set Detail publishes factual cards before optional artwork. | Warm p95 <1 s; cold p95 <2 s; first useful content and image completion separately. | 0/100 warm and 0/100 cold observations for search, set and card paths on a stated iPhone/network. | `app/(tabs)/search.tsx`, `lib/stackrDomainAdapter.ts`, `scripts/test-search-settlement-runtime.ts`, `scripts/test-issue304-cold-retrieval.ts`; 10 October performance and 11 October retrieval receipts. | Real mounted screen timings and image-completion timings; result correctness and failures must be kept in every denominator. | Prepared source safeguards; not measured, device-verified, or release-accepted. |
| 6. Dependable API | OpenAPI v1 defines supported operations and auth boundaries; generated client types and route-coverage check exist. Gateway gives GET up to two attempts with route timeouts. Search can still fan out to several independent groups. | 0 duplicated equivalent requests per measured journey; touched endpoints fully documented; >=99.5% valid-request success over 7 days. | 0 measured journeys; 0 seven-day valid-request window; endpoint count is not a reliability denominator. | `docs/stackr-api/openapi.v1.yaml`, `lib/generated/stackr-api-v1.d.ts`, `scripts/test-api-gateway-openapi-route-coverage.mjs`, `gateway/src/proxy.js`, `lib/cardSearch.ts`. | Instrument/correlate actual screen journeys before simplifying any path; document only endpoints actually touched and measure valid requests/errors separately from denial/cancellation. | Contracts prepared; duplication and reliability unmeasured. |
| 7. Card haptics | Shared `stackrHaptics` provides card preview/inspection events, preference-aware legacy wrappers, web no-op, failure containment and per-event cooldowns. Existing test checks Search and Binder card entry handlers. | 100% of declared showcase entry points use one shared meaningful pattern; no double trigger; >=4/5 directional comfort feedback. | Entry-point inventory not yet enumerated; 0 installed-device checks; 0/5 usability participants. | `lib/haptics.ts`, `components/search/SearchResults.tsx`, `features/binder/BinderDetailScreen.tsx`, `scripts/test-card-haptics.ts`, `scripts/test-haptic-preference.ts`, `scripts/test-haptics.ts`. | Confirm every intended card-showcase entry point on iPhone with haptics on/off and Low Power Mode; collect a five-person directional check. | Local behaviour covered by scripts; physical feedback unmeasured. |
| 8. Weekly pricing and changes | Existing daily guide workers, provider snapshots, current/previous fields, stale presentation and refresh queues exist. The 10 October receipt proves one configured daily worker execution and bounded provider evidence, not weekly/8-week performance. | >=99% scheduled starts within 1 h over 8 weeks; >=95% provider-supported eligible combinations refreshed within 24 h; 100% shown changes trace previous/current observation; stale after 8 days. | 1 dated execution receipt; 0/8 weekly windows; provider-supported population and 24 h numerator/denominator unmeasured for this source. | `backend/lib/marketPricing/service.js`, `lib/pricingV2.ts`, `components/PricingV2Summary.tsx`, `scripts/test-catalogue-price-cron.mjs`, `scripts/test-market-history-client.ts`, `docs/releases/daily-pricing-live-promotion-20261010.md`. | Read-only weekly run ledger must retain scheduled/actual start, identity, provider, currency, prior/current timestamp, outcome and stale age. Do not make weekly cadence/configuration changes under this work. | Existing operational lanes evidenced once; target not observed or accepted. |
| 10. Scanner recognition readiness | The installed source contains camera permission, capture, candidate presentation, confirmation/review states, haptics and diagnostics. The evaluation/benchmark tooling can calculate top-one/top-three, exact identity dimensions and p95. Gold templates are intentionally empty. | 200 controlled trials; >=90% correct top choice; >=97% exact identity in first three; p95 <=3 s; difficult conditions separate. | 0/200 owner-brief trials; 0 physical cards/images/capture sessions in current gold templates; no stated device/network. | `features/scan/ScanScreen.tsx`, `lib/scannerCalibration.ts`, `scripts/evaluate-stackr-quality.ts`, `scripts/build-scanner-evidence-report.ts`, `scripts/test-stackr-mobile-scanner-routing.ts`, `docs/stackr-api/quality-performance-observability.md`. | Build a consented, labelled 200-trial manifest with controlled and difficult strata, then run it on the stated iPhone/network. Existing 60-case candidate-comparison minimum is not the owner's 200-trial readiness target. | Reproducibility tooling prepared; recognition acceptance unmeasured. |

## What the current source proves—and does not

### 5. Retrieval latency

The retrieval code is structured to avoid making useful content wait for all
optional work: Search independently settles correction, card, set, sealed,
profile and listing work; cached canonical cards can publish before the network
card search completes; and a timed-out source must not overwrite retained useful
cards. The Set Detail path reads factual cards with `includeAssets: false` and
starts artwork recovery after first factual publication. `test-search-settlement-runtime`
and `test-issue304-cold-retrieval` are controlled local harnesses for those
properties. They do not mount React Native, render a card/image, or report
network timing.

The existing fixture benchmark has 12 deterministic search cases across five
languages. It validates matching strategy rather than response time, database
work, image decode or live coverage. The 10 October performance audit likewise
records physical-device latency as unmeasured.

**Smallest evidence-first repair candidate:** add no new optimisation yet.
Use the existing screen path and the current bounded diagnostics to emit a
privacy-minimised local receipt for start, first correct usable card, final
non-optional content, final image outcome, requests, cache state and errors.
If and only if the receipt shows a card path delayed by optional work, extend
the existing phased publication/abort pattern on that specific path. This keeps
identity, cache isolation and honest partial/error states intact.

### 6. API contracts, duplication and reliability

The checked-in OpenAPI specification covers catalogue, price, scan and protected
administrative routes, and the generated declaration plus route-coverage script
provide a contract-maintenance lane. At the transport boundary the gateway has
explicit timeouts and at most two GET attempts. Those attempts count toward
request amplification; they are not evidence of a duplicate request in a user
journey. `cardSearch` has an in-flight cache for equivalent language/term work,
while Search intentionally launches different result groups.

No observation connects one tap to gateway/API traces on this revision. There
is no seven-day valid-request denominator, so neither the zero-duplicate nor
99.5% claim can be assessed.

**Smallest evidence-first repair candidate:** use existing W3C trace IDs and
the protected aggregate observability contract to create a journey receipt that
groups client dispatches, gateway attempts, API outcomes and rendered result
identity. Only after it identifies equivalent same-operation requests should
the current in-flight/cache key be reused at that exact caller. Do not merge
different result groups or remove retry/error semantics merely to reduce a count.

### 7. Shared card haptics

`lib/haptics.ts` centralises the tactile vocabulary. `card_preview` is a medium
impact with a 120 ms cooldown; `card_inspection` is rigid with a 250 ms
cooldown. The facade honours the saved local preference, is a no-op on web,
contains native failures, and prevents a queued foil crossing from firing after
the viewer is no longer current. The current card-haptic script extracts and
exercises Search and Binder entry handlers, including native failure continuity.

This establishes code intent only. It cannot prove hardware feedback, system
settings, overlapping vibration from a native dependency, or whether every
showcase entry point uses the common call.

**Smallest repair candidate after the inventory:** if a declared showcase entry
point directly imports `expo-haptics` or lacks the shared event, replace only
that call with the matching existing `stackrHaptics` event and retain its press
handler/navigation. First record the entry point, existing event (if any),
chosen shared event and the before/after installed-device check.

### 8. Pricing cadence and price changes

The source keeps provider-labelled snapshot data, canonical pricing identity,
source/timestamp/freshness fields and separate history. Price UI marks a stale
stored value as stale and only says a refresh is queued when the actual
`refreshQueued` flag is true. The service rejects ambiguous provider identity
and preserves the last valid snapshot when a new provider read is unavailable.

The dated production receipt is useful bounded evidence: on 10 October a daily
worker ran once and a Cardmarket invocation reported `stored=9198` with
`fullCatalogueCurrent=false`. It also documents one owner snapshot worker that
had 316 refreshed, 8 unavailable and 2 failed outcomes. These counts are not an
eight-week schedule statistic, nor an eligible population rate, and are not
whole-catalogue coverage.

**Smallest evidence-first repair candidate:** no schedule change. Prepare an
append-only, read-only weekly report from the existing job/snapshot records:
for each run capture scheduled versus actual start, provider/scope, selected
eligible identities, persisted success/unavailable/failed outcomes, and oldest
quote age. Derive price change only when canonical identity, currency, provider
and comparable basis match. The release owner can review that report before any
automation or schema work.

### 10. Scanner readiness

`ScanScreen` has a real camera-permission path and models captured, identifying
and confirming states. The recognition routes preserve candidate lists and
distinguish accepted/review-required/no-match flows; the routing test confirms
an accepted local match does not invoke fallbacks and an emergency fallback is
feature-flagged. `build-scanner-evidence-report` can report top-one/top-three,
scan p95, failure, rescan and duplicate-addition measures from stored benchmark
rows. `evaluate-stackr-quality` additionally protects physical-card and
capture-session leakage.

The current gold manifest and observation template have no observations. The
checked-in scanner comparison requirement is 60 baseline and 60 candidate cases;
it must not be substituted for the owner's 200 trials. No source receipt shows
the app installed on an iPhone or measures camera-to-result latency.

**Smallest evidence-first repair candidate:** create the 200-row benchmark
manifest first, without changing recognition code. Each row needs authorised
physical-card/image provenance, exact printing/language/finish ground truth,
capture session, controlled/difficult condition label and device/network. Run
the existing evaluator/report with distinct controlled and difficult cohorts;
report exact-printing accuracy separately from card-name accuracy. Any mismatch
should remain a confirmation flow, never become a silent save.

## Concrete proof runs when the test setup is available

1. **Retrieval:** on the named iPhone, OS, app/OTA, account and network, collect
   100 warm and 100 cold observations each for search, set and card journeys.
   Start at the actual user tap or committed text input **before** Stackr's 240
   ms debounce; record first correct usable content and final image completion
   separately. Preserve timeouts/errors in the attempted-operation denominator;
   calculate nearest-rank p95.
2. **API:** use the same journey cohort and trace IDs to count client dispatches,
   gateway attempts, API status/error and rendered identity. Observe seven
   consecutive days of valid requests, excluding deliberate access denials but
   retaining timeouts and service failures. State the number of touched endpoint
   contracts and any deliberately distinct parallel groups.
3. **Haptics:** enumerate every declared showcase entry point, execute each on
   iPhone with the preference on and off, and perform repeated-tap/cancel/back
   checks. Five test participants should rate helpful/comfortable; report the
   raw 0–5 result as directional feedback only.
4. **Pricing:** for eight calendar weeks, read existing run and snapshot records
   without changing the schedule. Report starts within one hour against all
   scheduled starts, 24-hour success against provider-supported eligible
   combinations, provider-supported coverage versus whole catalogue, and price
   changes only for comparable observations. Flag quotes older than eight days.
5. **Scanner:** run at least 200 labelled trials across the agreed languages,
   sets, finishes, lighting and angles. Keep controlled and difficult trials
   separate; report top-one, top-three exact identity, exact printing, card name,
   p95 recognition time, confirmations, failures and device/network. Re-run
   failures only as separately counted retries.

Routine local and bounded read-only evidence work is already within the owner's
improvement request. It does not require a new approval. Separate approval is
required only before a live release, database/catalogue mutation, configuration
or schedule activation/change, credential/access change, destructive action or
spend.

## Prepared follow-on plans; no implementation in this baseline

### Weekly refresh preparation using the existing worker

The existing worker must not be invoked for this preparation: its cron wrapper
calls `scripts/refresh-catalogue-bulk-prices.mjs --apply --max-groups=5000`, and
that worker can contact the provider and persist results. The safe reusable
offline entry point is instead:

```text
scripts/refresh-catalogue-bulk-prices.mjs --fixture=<local-fixture.json>
```

`mainCatalogueBulkPrices(args)` explicitly rejects `--apply` with a fixture,
uses `planCatalogueBulkPrices(...)`, and emits `dryRun: true` with zero provider
calls. `planCatalogueBulkPrices` retains exact language/set/printing/variant
identity and refuses ambiguous provider mappings. The existing test lane can
exercise this without cloud activity: `scripts/test-catalogue-price-cron.mjs`
tests the cron process boundary with a mock spawn, while
`scripts/test-catalogue-price-daily-status.mjs` exercises
`dailyGuideFreshness`, `requireFreshDailyGuide` and
`summarizeCatalogueDailyRun` from `scripts/catalogue-price-daily-status.mjs`.

**Preparation sequence:**

1. Create a local, non-secret fixture using only synthetic reviewed candidates,
   provider groups/products/prices, FX attribution and dataset timestamp;
   invoke the fixture command without `--apply`.
2. Verify the plan preserves provider/currency/timestamp identity, produces
   expected `priced`, `no_provider_quote`, unsupported and ambiguous outcomes,
   and performs no provider/database calls.
3. Prepare an append-only weekly receipt schema from the worker's existing
   output: scheduled time, actual start, run ID, source dataset time,
   provider/scope, eligible identities, persisted successes, unavailable,
   failed and retried outcomes, current/previous comparable observations, and
   quote age.
4. When normal scheduled runs are observed, read their retained records to
   populate the eight-week KPI. Activating a new weekly schedule, changing an
   existing cadence or applying price writes stays a separate review action.

### Scanner: minimal benchmark/evaluator extension proposal

No benchmark schema, evaluator or database migration is changed by this report.
The existing quality evaluator already has safer building blocks:
`GoldTestCase.variantId`, `finishCode`, `language`, `captureConditions`,
leakage checks, `summarizeTopN`, `variantAccuracy`, `finishAccuracy` and
nearest-rank latency. The calibration path already has
`ScannerBenchmarkObservation`, `summarizeBenchmarkObservations`,
`summarizeBenchmarkBreakdowns`, and `evaluateScannerReleaseReadiness`; the
stored benchmark case projection currently has language/era/lighting/item/capture
and sleeve fields but no controlled/difficult bucket or distinct name/printing
identity values.

The smallest future change is to extend the **existing** benchmark case and
observation projection rather than create a second framework:

1. Add a required `condition_class` (`controlled` or `difficult`) to the
   existing `scanner_benchmark_cases` schema and its TypeScript projection in
   `scripts/build-scanner-evidence-report.ts` / `lib/scannerCalibration.ts`.
   Classify cases from their current lighting/capture attributes; do not infer
   the class for an unlabelled historic row.
2. Require a verified expected printing identity (existing canonical
   card/variant/finish fields) and separately retain an expected card-name key.
   Add predicted candidates' matching name key to observations. Use the existing
   `variantAccuracy` plus `finishAccuracy` for exact-printing accuracy and a
   new name-only comparator for card-name accuracy; never derive either from a
   non-empty candidate list.
3. Add explicit owner-brief requirements to the existing evaluation input:
   at least 200 observed trials in total across representative conditions, with the controlled subset stated separately, with controlled and difficult
   summaries emitted separately, top-one >=90%, top-three exact-printing >=97%
   and p95 <=3 s for the stated device/network. Keep the existing 60-versus-60
   candidate-regression threshold as a different comparison gate rather than
   silently replacing it.
4. Extend `scripts/test-scanner-calibration.ts` with synthetic rows that prove
   under-200, missing class, name-only match and printing/finish mismatch cases
   stay `insufficient_data` or fail as appropriate. Populate no real rows until
   authorised images/physical cards and test metadata are available.

The relevant reusable files/functions are:

| Need | Existing file/function | Safe role now |
| --- | --- | --- |
| Offline price plan | `scripts/refresh-catalogue-bulk-prices.mjs`: `mainCatalogueBulkPrices`, `planCatalogueBulkPrices` | Synthetic fixture only, no `--apply`. |
| Daily-run freshness/report logic | `scripts/catalogue-price-daily-status.mjs`: `dailyGuideFreshness`, `requireFreshDailyGuide`, `summarizeCatalogueDailyRun` | Unit/local report preparation. |
| Cron-boundary simulation | `scripts/run-catalogue-price-cron.mjs`: `runPriceCron`; `scripts/test-catalogue-price-cron.mjs` | Mock-spawn test only; do not execute the real wrapper. |
| Gold-set integrity/evaluation | `lib/stackrQualityEvaluation.ts`: `evaluateStackrQuality`, `summarizeTopN`, variant/finish metrics | Extend existing manifest/evaluator, retaining leakage rules. |
| Scanner benchmark summary | `lib/scannerCalibration.ts`: `summarizeBenchmarkObservations`, `summarizeBenchmarkBreakdowns`, `evaluateScannerReleaseReadiness` | Add condition/name/printing summaries to the existing path. |
| Stored evidence reporting | `scripts/build-scanner-evidence-report.ts`: `toObservation`, `buildMarkdown` | Project future fields and render separated results. |

## Delivery status

No operating behaviour was changed by this baseline. Existing source safeguards
are suitable starting points, but none of targets 5–8 or 10 is ready to be
claimed as complete: each needs its stated real observation denominator and,
where relevant, installed-iPhone verification. Any future schedule, provider,
database or production change remains a separately reviewable approval action.
