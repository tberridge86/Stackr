# 146 more artwork fronts published and verified

Verified on 30 September 2026 at 21:54 UTC against production `oakdbbzdqwurpjnoqhmu` and `https://api.stackrtcg.com`.

**146 further fronts are live: 138 English and eight Traditional Chinese Energy cards.** All 146 card records and all 583 distinct public image files passed independent readback. This brings the recovery to **8,384 published fronts and 25,152 display-size references**. Of the owner's separate 4,201 outstanding cases, **424 are now resolved and 3,777 remain**. These are artwork cases, not missing card records or a whole-catalogue percentage.

## Publication evidence

- Reviewed [PR270](https://github.com/tberridge86/Stackr/pull/270), eight applicable CI checks passed; the separate release-candidate gate was skipped. Publication source: `fbd02c07eb323405606537698a21298ff0525389`.
- Protected [production run 36780361223](https://github.com/tberridge86/Stackr/actions/runs/36780361223) succeeded after staging and production rollback rehearsals. It created 146 associations without metadata, price or holdings changes. Source-wide activation remains unchanged.
- The 146 fronts have 438 derivative references: 584 total file references resolve to **583 distinct storage objects**, including one shared Energy thumbnail. **571 files were newly uploaded; 12 existing immutable files were reused and verified.** File counts are not card counts.
- The downloaded [receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36780361223/artifacts/11127980894) is 42,951 bytes, SHA-256 `49fddf00d78f63392c0741603352f42f63aaaa9205a960fb85686bd20c1549bf`, independently matched to GitHub's digest. The enclosed receipt SHA-256 is `2465cc194efa8a058bf5250abfc62ea058748424300529bf93175825bc9bed35`.
- Independent checks matched the exact language, set, collector, original and derivatives, source attribution, delivered URLs, hashes, MIME, dimensions and decoded bytes: **146/146 cards; 583/583 files; zero first-attempt failures**.
- Fresh production readback confirms all six recovery cohorts remain present: 7,911 + 49 + 200 + 45 + 33 + 146 = **8,384 fronts**, spanning **33,469 distinct storage objects**. This is association continuity for every cohort; the earlier independent live checks are retained in their own receipts.

Machine-readable evidence: [summary and checksums](artwork146-published-20260930.json), [unaltered production receipt](residual146-production-receipt-20260930.json), [complete independent verification and database readback](artwork146-verification-20260930.json.gz).

## What remains

| Language | Unpublished artwork cases |
|---|---:|
| English | 481 |
| Japanese | 2,221 |
| Simplified Chinese | 829 |
| Korean | 239 |
| Traditional Chinese | 7 |
| **Total** | **3,777** |

The [complete remaining register](artwork3777-exceptions-20260930.json.gz) preserves every unresolved identity. Its historical categories are 3,139 exact-source cases, 605 Chinese language conflicts and 33 other cases. Some source files have now been recovered, but remain unresolved until identity review and publication succeed; “exact source needed” is not a claim that no candidate file has been found.

**Next prepared group: 16 English + 80 Japanese fronts, not yet published.** Root independently reviewed all 81 Japanese candidates in the first two archives. E3/015 was rejected because its actual title is モンジャラ while the frozen name is タンゲラ. E2/008's native title アリアドス matches, with the frozen collector suffix `-008/092` explicitly recorded as formatting. [Full independent Japanese review](japanese81-independent-review-20260930.json).

An additional 57 Japanese candidates are held because inherited visual review incorrectly treated translated/malformed names as literal matches. For example, E1/054 reads クルミのきまぐれ, not メアリーの衝動. None of those 57 was published. Their immutable source archives are preserved for independent re-review and separately reviewed metadata corrections. This does not affect the verified English/Taiwanese 146-front publication.

The **94 sets without published checklists**, Gym promo-pack grouping links, Scarlet & Violet Energies grouping, 30thD/30thDC cover/alias, pricing exceptions and installed-phone checks remain separate. Earlier completions and exceptions are retained in the [plain-English release report](october-1-plain-english-status-20260929.md).

## Retrieval measurement limits

Across this 146-card verification, complete detail responses had median **1,459 ms**, p95 **1,889 ms** and range 219–4,927 ms. Manifest responses had median **1,355 ms**, p95 **1,507 ms** and range 280–4,523 ms. These measurements used this Windows connection, two concurrent requests and pacing; they are not database-only or phone timings. They **do not establish universal sub-0.5-second retrieval**. No new TestFlight installation or phone rendering, haptics or gyro result is claimed.
