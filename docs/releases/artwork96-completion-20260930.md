# 96 native-language artwork fronts published — 30 September 2026

The recovery has published **96 additional artwork fronts** through the existing Stackr API: **16 English** and **80 Japanese**. Each has an original and three display derivatives, adding **288 derivative references** and **384 verified storage objects**.

All 96 public card records and all 384 public image objects passed independent checks for the frozen printing identity, source attribution, delivery URL, byte checksum, format and dimensions. The production receipt and both rehearsal receipts show no metadata, price, holding, ownership or source-activation change.

The recovery total is now **8,480 fronts** and **25,440 derivative references**. The original 4,201-case queue has **520 resolved cases** and **3,681 still open**.

## Response-time evidence

The independent public checks used two concurrent requests with 700 ms pacing. Measured p95 complete times were **1707 ms** for card detail, **1526 ms** for manifests and **1643 ms** for image objects. These are measured public reads from this connection, not a promise of universal sub-0.5-second response or installed-phone performance.

## Explicit follow-up

Korean review has accepted **232 offline-prepared fronts**, but none is included here. Seven Korean name/collector identities remain held: SV4K 091/092, SV4M 091/092 and SV5K 090/091/092. A separate 46-row Japanese native-name correction proposal is also pending; this publication did not change Japanese catalogue metadata.

[Publication receipt](native96-production-receipt-20260930.json), [summary](artwork96-published-20260930.json), [full verification evidence](artwork96-verification-20260930.json.gz), and the [3,681-row exception register](artwork3681-exceptions-20260930.json.gz) preserve the machine-readable detail.

The release used [PR272](https://github.com/tberridge86/Stackr/pull/272), revision `8c456ee5c7335368accbafb54bce2c735999ff6e`, with eight applicable CI checks passed. [Production run 36784820633](https://github.com/tberridge86/Stackr/actions/runs/36784820633) created 96 card assets and 384 storage objects, with none reused. Its [downloadable receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36784820633/artifacts/11129082685) independently matches SHA-256 `8623fa5603af2894f898bd473975e3038978b11409539a20fe70ddb0fb45ac0b`.
