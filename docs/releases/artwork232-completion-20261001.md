# 232 Korean fronts published and independently verified

[Production run 36789067886](https://github.com/tberridge86/Stackr/actions/runs/36789067886) published **232 Korean fronts**, **696 derivative references** and **928 distinct image files**. All files were newly created. Publication used [PR274](https://github.com/tberridge86/Stackr/pull/274), source `1782d8301902531e08e9a88e475f700408caf1ed`, after all eight applicable CI checks passed. No metadata, prices or holdings changed. The seven Korean name conflicts were excluded.

Independent verification finished at **2026-09-30T23:31:07.517Z**: **232/232 card records and 928/928 image files passed** identity, attribution, delivery URL, SHA-256, MIME, dimensions and decode checks. First-attempt failures: 0 card checks and 41 image checks. The [downloaded receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36789067886/artifacts/11131246472) matches GitHub SHA-256 `1a985a700fc0a9b6586f1b24bd116cf82502221e7b6e2479ef7b4b212f5d1a39`.

All eight previous/current recovery cohorts remain present in production: **8,712 fronts, 26,136 derivative references and 34,781 distinct stored objects**. The original **4,201-case queue has 752 resolved and 3,449 remaining**.

## Measured retrieval

This verifier separates its deliberate pacing from actual HTTP response-body times. Median/p95: card detail **244/494 ms**, manifest **174/343 ms**, image **348/636 ms**. API checks used two concurrent requests and 700 ms spacing. Storage initially used four with 100 ms spacing, then resumed using two with 700 ms spacing. The initial run recorded 37 HTTP 429 responses that recovered on retry and four undecodable responses whose HTTP diagnostics were not retained by that first verifier. All four subsequently passed. The interrupted report and failures are preserved; no final image failures remain. HTTP timings below measure the successful final request and exclude retry/backoff time, which remains in the full evidence. These are measured public reads, not installed-phone or universal sub-0.5-second guarantees. Earlier reports' inclusive verifier timings contain pacing and are retained separately in the evidence.

## Remaining artwork

- English **465**; Japanese **2,141**; Korean **7**; Simplified Chinese **829**; Traditional Chinese **7**.
- **65 additional fronts have source-image evidence**: 53 require atomic native-name repairs (46 Japanese, seven Korean), and 12 have matched identities awaiting protected publication. Their files are retained, but these 65 are not counted as delivered.
- The fixed exception ledger now distinguishes these 53 name holds and 12 publication holds from historical source-needed classifications. It preserves previous categories and exact IDs.
- The separate 94 missing checklists, logo/source/grouping cases, pricing exceptions and installed-device gates remain outside this artwork count.

[Summary and checksums](artwork232-published-20261001.json), [production receipt](korean232-production-receipt-20261001.json), [full verification evidence](artwork232-verification-20261001.json.gz), [3,449 exact remaining cases](artwork3449-exceptions-20261001.json.gz).
