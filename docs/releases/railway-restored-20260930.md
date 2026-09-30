# Railway, search and pricing restoration — 30 September 2026

Railway deployment access is restored. The reviewed backend, corrected public-search gateway and both existing pricing worker services are deployed. No billing, schedules, provider flags, catalogue metadata, artwork or holdings were changed by this restoration. Installed-device and TestFlight acceptance remain separate.

## Delivered components

| Component | Source and delivery | Verified result |
|---|---|---|
| API | PR259 source `2ef619c2f4b4761d7c4734c746d0d48192ca6af7`; protected run [36680646429, attempt 3](https://github.com/tberridge86/Stackr/actions/runs/36680646429); Railway deployment `86f56722-c2ff-4f2f-afb7-f0c494e443c2` | Direct runtime attests the expected source, production environment and Supabase project. Health and anonymous pricing rejection pass. This does not prove signed-in owner prices. |
| Gateway | PR262 merge `6501a1d5647d2e5991bbd8503a2a0a0d1d970ddc`; protected run [36757020659](https://github.com/tberridge86/Stackr/actions/runs/36757020659); version `886f817c-424f-4427-9a34-a64a2266d86b`; deployment `89e24dab-f9a9-4169-9027-9aae0ab6478e` | 100% traffic; bindings/privacy/rollback attested; R and WAT return the expected English Mew and Japanese Water Energy. |
| Queue worker | Reviewed runtime `32606e9053e7ad28d0d1ed6409bd44963a2d3ed2`; deployment `38052a6f-fc4d-4308-b812-57e8ccedd3d0` | SUCCESS; scheduled starts at 18:15 and 18:20 UTC both published valuation summaries with zero failures. Existing five-minute schedule retained. |
| Automatic worker | Same reviewed runtime; deployment `6c75db1d-7f22-447e-80aa-b60823b59eda` | SUCCESS; existing `0 6,18 * * *` schedule retained. Its next scheduled execution is not yet verified; inspect the 1 October 06:00 UTC run before TestFlight delivery. |

The worker archive contains only tracked `backend`, `scripts`, `package.json` and `package-lock.json`; SHA256 `730c312c2824241e383ecf08453ec4a077a48d4565889ece69db807cbcaae345`. Source provenance is the exact archive uploaded to the existing services; workers do not expose the backend's runtime source-attestation endpoint. Their pricing code is unchanged in the gateway merge. No competing scheduler was enabled.

The owner's initial Railway restarts rebuilt older `478b3a5` code. Its queue republished a summary with only 316 priced copies; current resolver readback found 360. That older automatic pass finished 255 attempts (248 refreshed, seven unavailable, zero failures) and was removed without publishing a final valuation. The current worker deployments replace that older implementation and retain saved provider snapshots.

## Search and measured retrieval

The backend correction alone left R blocked by the gateway's minimum-length check. PR262 permits one ASCII letter/digit only on a selected-set search with a canonical UUID. Other short queries, malformed IDs/languages, wildcards and duplicate parameters remain rejected. All 46 gateway tests, local dry build, privacy/deployment contracts and secret scan passed. All ten applicable PR checks and merged-main Platform CI [36756926067](https://github.com/tberridge86/Stackr/actions/runs/36756926067) passed; the wider release-candidate gate was skipped.

All eight public detail/search checks returned the expected identities and both detail checks included artwork references. Complete-body R/WAT repeat searches took **58/56 ms**; first searches took 767/373 ms. Detail reads ranged from 163 to 1,738 ms, including an immediate Mew repeat at 1,311 ms. Three later Mew cache hits took 330/177/171 ms. Caching works, but a universal sub-0.5-second or phone-loading claim is not established. Three invalid-search probes still returned 400.

[Downloaded receipt checksums, runtime/privacy checks and public readback](railway-api-delivered-20260930.json) preserve the initial gateway failure and final passing searches. Hashes were independently computed after download.

## Pricing outcome and remaining gates

The current-source dry run selected 317 price identities from 333 saved records (327 eligible and six skipped), without mutation or failures. The existing protected refresh [36757515707](https://github.com/tberridge86/Stackr/actions/runs/36757515707) first attempted 174 identities: 169 succeeded, then five consecutive provider HTTP failures triggered its existing stop safeguard and deferred 143. It still published the valuation safely. Attempt-one receipt SHA256: `a6b3f2f05042b2129b8aac8e24409fe68cff52e0c3c1b1ea6e22a845cc04c83d`. A single follow-up request to the first failed provider record returned 200, so one protected retry was started. Attempt 2 succeeded at 18:41 UTC: all **317 identities refreshed successfully**, zero unavailable, zero failures, zero deferred, and the valuation was published. Refreshed identities include safely reused unchanged quotes; this is not a claim of 317 newly inserted rows. [Complete refresh and scheduled-worker receipt](railway-refresh-complete-20260930.json).

At the final 18:43 UTC readback, all **204 Home/binder comparisons passed** with unchanged collection revision, against the 18:41 UTC published generation. General estimates covered **360/366 copies**, **GBP 1,142.79**: 179 exact-priced copies plus 181 labelled general estimates. Six remained unpriced. Exact-only subtotal was GBP 124.13. [Final stored-price and valuation evidence](railway-valuation-20260930.json). These are server-side stored-price/valuation checks, not authenticated gateway or phone acceptance. All priced-copy provider dates are now September 29, 22:54–22:55 UTC; all remain older than the six-hour policy. Retrieval today does not make those market observations fresh. The readback made zero provider requests: the existing API pricing implementation read stored database quotes.

The six unpriced holdings retain their identities: ACE 10 sv10-193 (ambiguous saved identity), ACE 10 svp-203, CGC 9 GG10 and ACE 10 me3-120 (unsupported graded prices), Japanese VSTAR Electric 254 (`pokedata:57932`, missing canonical printing), and Chinese Scovillain 020/SV-P (unsupported/unpublished saved variant). No raw price is substituted for a graded card.

Scrydex and PikaQian still returned HTTP401 at 17:56 UTC. Their credentials need restoring separately from Railway; no secrets should be sent in chat. TCGdex's initial interruption recovered on the bounded retry and is separate from those credential errors.

The previously verified 7,911 artwork fronts remain complete. Other artwork/checklist/logo cases remain in the existing release queue. PR261 contains a separate owner-permission attestation for the 49 prepared fronts; this Railway restoration does not publish them or make another permission request. October 1's normal production-profile TestFlight automation is unchanged. Phone artwork/values, haptics and gyro acceptance remain outstanding.

The final refresh artifact ZIP was independently downloaded by artifact ID `11118985052`; SHA256 `41c2b27c661c6b3808a5e4f6a9e007d88870d471ea8ee7544386eb3a41f5f9fe` matches GitHub's digest. Extracted summary SHA256 is `dea056e7917d622ae1eeb0d226b1fc13388e1748f9436024c078d546ff5b7c8b`. The failed first attempt and its saved progress remain recorded separately.
