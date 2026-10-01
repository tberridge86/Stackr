# 65 Japanese and Korean fronts published and independently verified

[Production run 36808289201](https://github.com/tberridge86/Stackr/actions/runs/36808289201) published **58 Japanese and seven Korean fronts**, **195 derivative references** and **260 distinct image files**, all newly created. Publication used [PR276](https://github.com/tberridge86/Stackr/pull/276), source `fbbe5f3ad17dc675f89cb785e64757590e431981`, after all eight applicable CI checks and 59 focused local tests passed.

Both database rehearsals passed and rolled back. The final production transaction corrected exactly **53 printing native names and 53 corresponding native search-name rows**, then linked the matching fronts. Full before/after comparisons of all 65 records confirmed other printing fields, aliases, variant identities and API identity fields stayed unchanged. Staging remained unchanged after rehearsal. Prices, holdings, source policies and existing artwork were preserved.

Independent public verification passed **65/65 card records and 260/260 image files**, with zero first-attempt failures. Checks include printing/set/language/collector identity, repaired native titles, attribution, delivery URLs, SHA-256, MIME, dimensions and full decode. The [downloaded receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36808289201/artifacts/11138975625) matches GitHub SHA-256 `8d5b4ed4da72cddee8c1bedf376794d20f27e80e5608d47e6011342dc58f4458`. Evidence consolidated at **2026-10-01T03:19:46.767Z**.

Fresh database readback confirms all nine recovery cohorts remain present: **8,777 fronts, 26,331 derivative references and 35,041 distinct stored objects**. The original **4,201-case queue has 817 resolved and 3,384 remaining**. The older 4,250-case register has 866 resolved; the extra 49 belong to its earlier publication.

## Measured retrieval

Actual HTTP response-body median/p95: card detail **285/3,606 ms**, manifest **204/2,663 ms**, image **370/3,397 ms**. Two concurrent workers used 700 ms global spacing. Deliberate pacing is separately recorded and excluded from these HTTP timings. There were no retries. Some requests were much slower than the median; this sample does not meet the requested universal 0.5-second target and does not establish installed-phone performance.

## Remaining artwork

- English **465**; Japanese **2,083**; Korean **0**; Simplified Chinese **829**; Traditional Chinese **7**. These counts apply to this frozen queue only.
- **72 Japanese fronts and 216 derivatives** are prepared offline, with all 288 files verified and every title/collector fraction visually reviewed. They require exact native-name corrections before protected publication and remain outstanding.
- **2,674** cases still need a matching source or independent source review; some original files are retained. **605** have Chinese language-identity conflicts. **33** have other source, artwork-choice or identity exceptions.
- The separate **94 missing checklists**, logo/source/grouping issues, pricing exceptions and installed-device gates remain outside this artwork count.

[Summary and checksums](artwork65-published-20261001.json), [production receipt](native65-production-receipt-20261001.json), [full verification evidence](artwork65-verification-20261001.json.gz), [preservation readbacks](native65-after-evidence-20261001.json.gz), [3,384 exact remaining cases](artwork3384-exceptions-20261001.json.gz), [next 72 reviewed fronts](japanese-next72-reviewed-20261001.json).
