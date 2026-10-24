# Retrieval acceptance continuation - 24 October 2026

Baseline: architecture draft PR #437 at `8445e60278fccdf0601e1c7cad68a7e038c8a603`.

The existing architecture suites establish offline behavior, not live retrieval speed or correct image delivery. This continuation adds a bounded, read-only acceptance probe alongside the existing public API benchmark. It is intended for an explicitly selected public cohort, not a full catalogue scan.

## Evidence boundaries

- Pin canonical card/set/language and printing variant identities using reviewed catalogue evidence. Do not derive the expected answer from the same response being tested.
- For artwork verification, supply the approved asset/rendition and its expected checksum. A successful image response alone cannot establish correct artwork.
- Keep API responses, CDN byte verification and physical-device rendering separate. Record source revision, cohort, sample count, elapsed time, request amplification, failures and bytes.
- The probe never approves deployment. A passing bounded cohort is not catalogue-wide coverage or proof of a phone latency target.
- CI runs synthetic regression fixtures only. It must not fetch the production catalogue, activate a worker, or run a migration.

## Remaining architecture work

The ownership summary still needs an authenticated aggregate read model. Its legacy implementation reads 1,000-row pages and hydrates card metadata locally. Merely reducing that constant to 50 would increase request fan-out rather than deliver the intended architecture. Preserve quantity, condition, grade, edition and account-isolation semantics in that separate change.

Search continuation, private binary migration, Pages/DNS cutover, scheduler handoff and actual device performance remain separate unfinished stages. The R2 migration's recorded 23 October blocker is subscription activation and an unverified destination/CDN binding; that status was not rechecked by this offline continuation. No objects or database references were migrated here.

## Cohort format

The probe takes a JSON cohort with `schemaVersion: 1`, `probeSourceSha` (the operator-supplied candidate commit), an HTTPS `apiOrigin`, explicitly trusted `cdnOrigins`, and up to 20 named `cases`. The source label is not proof of the deployed API revision.

Each case has `id`, `kind` (`card` or `set`) and `identities`. Every identity pins `cardId`, `variantId`, `setId`, `catalogueVersionId`, `languageCode` and `collectorNumber`. A card case selects one variant. A set case supplies the complete expected variant membership for one set/language/revision, up to 500 identities. A printing repeated across pages with distinct variants is valid; a repeated printing/variant pair fails.

A card case may include `image` with the exact `assetId`, rendition `role`, `mimeType`, `sha256` and `byteSize` from reviewed evidence. The probe compares card detail with the manifest, then checks the returned CDN bytes. It must not substitute another finish or use whatever asset the response happens to offer as its expected evidence.

Choose at most 50 actual artwork samples for local UI work; this probe is narrower still, with at most one image per card case. Do not commit private account samples or credentials in a cohort. No approved live cohort was invented or run for this continuation.

## Run and interpret

From the repository root, run the synthetic tests with:

```sh
node --test scripts/test-retrieval-acceptance.mjs
node scripts/test-architecture-validation-report.mjs
```

For a reviewed public cohort, this explicit command performs bounded real GET requests and prints the JSON evidence to stdout:

```sh
node scripts/probe-retrieval-acceptance.mjs --cohort /path/to/approved-cohort.json
```

The CLI has no production default, accepts no credentials and performs no writes to remote systems. It returns exit 0 for accepted samples, 1 for failed retrieval/identity/image samples, and 2 for an invalid invocation or unreadable/invalid cohort. Capture stdout as release evidence when running the authorized cohort. No live run was made here.

Defaults: one sample per case, 10-second request deadlines, 100 requests and 64 MiB total response budget, 2 MiB per JSON response, and at most ten 50-variant pages per set. Image evidence is bounded at 10 MiB per image. The helper supports up to five repeats, but the CLI deliberately uses the defaults. Cases are sequential; bounds include failures. Supplied API/CDN origins are trusted operator configuration, not a DNS sandbox.

The report keeps `transportOk` separate from each sample's `ok`. HTTP/JSON success can still fail identity checks. Successful-sample latency covers that entire case, including all pages and optional manifest/image requests; it is not a pure API percentile. Individual request timings and types remain in the report. Percentiles use nearest rank, retain the successful sample count, and exclude failures only from the success-latency series-not from the failure denominator. Cache state is uncontrolled; first requests and repeats are not labelled controlled cold/warm runs.

## Validation for this continuation

The synthetic retrieval suite and architecture-report regression passed locally. The suite exercises exact image delivery, wrong language/version/collector number, pagination completeness and duplicate detection, split-printing variants, oversized variant pages, content-type/checksum failures, origin/redirect checks, byte/request limits, cancellation and timeouts. Independent review checked the actual v1 response projections and found no remaining blocking issue after the variant-page-bound correction. These are fixture and source-review results; hosted CI and real API/CDN/device acceptance remain separate evidence.
