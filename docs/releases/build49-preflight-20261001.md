# Build 49 preflight — public aggregate summary

This is a public, aggregate-only record of the preflight completed at 17:59 UTC on 1 October 2026. The complete original packet remains local and is **not** included in this repository: it contains detailed infrastructure, stored-price and holding-reference evidence. This summary contains no individual quote values, holding matches, account identifiers, credentials, or database connection data.

## Evidence binding

- Native source reviewed for build 49: `c6795069c57e32c7ea53f11326f9206379b48d1e`. The deployed API's source equivalence is **unverified**, because its deployment metadata did not expose an API source SHA.
- Complete local report SHA-256: `e000ab821e999909894ecb3f0e3a61729267573019cf5bdd8d00e88287cacbc2`.
- Local `SHA256SUMS.txt` manifest SHA-256: `09ad2a15afec270f3e3ca755854bf75fde307d61008cd9cd6101cc98b005639d`.
- The following hashes bind every file in the retained local packet. The files themselves are not copied here.

| Retained local file | SHA-256 |
| --- | --- |
| `classify-public.mjs` | `0bfda37c1b9166a997f75e279b0ab53eeac97806770f57fbc9a3cd134bf46813` |
| `handoff.json` | `ef19b8457ff2329d2c3d8c271033552c7b106642e7d7a91601ae662feaf1be80` |
| `infrastructure-evidence.json` | `3e828e97bb37ad96d73023d6e542f0b44bc4fa05d5a59dedfdc352de26ecb082` |
| `preflight-report.txt` | `e000ab821e999909894ecb3f0e3a61729267573019cf5bdd8d00e88287cacbc2` |
| `pricing-evidence.json` | `db956a6b3506761bd78e84c6384d448eeb4afff0521bc2d334ead2897df9c6b1` |
| `public-classification.json` | `50e5cbc62633d0cc9d11dc049506761aba4e83bf7e7378ca509a4eb853cb1717` |
| `public-evidence.json` | `e53f04f9b186dd05736b7f7d1834af7e71363f08369fa4098314813ae05378d4` |
| `verify-images.mjs` | `9636b097e5354fd3fbbbd0fb9bb7f13c5a904806b56424a47eba61de2c26bbd1` |
| `verify-prices.mjs` | `bb7dd43f5634d0dc41c6bd686f314fe56f657a288acbf76992e2fe5d972b5a91` |
| `visual-en.webp` | `c132d1f1267111fd5d537637c710e9914dc8bbe8f0ecb9d23242136e57b90e9d` |
| `visual-ja.webp` | `312a548b6e4c6e3953fa90f7d049281f1eeaf0aebd47446763620561e23d4df0` |
| `visual-zh-cn.webp` | `2d4bc7b32b737ffad613a1e22aeb43bf4184d9089bafa5eb325796386c32af67` |
| `visual-zh-tw.webp` | `efb830f02f17b8eba0f56f174e20f3c1ca7e1441a25f580283a56549ecca6861` |

[Machine-readable public summary](build49-preflight-summary-20261001.json) contains the same aggregate results and provenance.

## Result

The audit does **not** sign off complete catalogue pricing or a universal sub-500 ms experience. It made no production database write and no provider call. It is not a signed-in owner flow or installed-phone test.

### Catalogue pricing

The full-catalogue implementation exists but was not enabled in the observed configuration. Its tracking store had **0 cycles** and **0 state rows**. The automatic worker is collection-scoped at **06:00 and 18:00 UTC**; its catalogue enable flag, capacity verification, and request budget were unset.

The stored-price diagnostic examined **16 general cases** and **3 controls**. **5 of 19** returned a value, and all five were stale under the existing policy. **14 of 19** were unavailable. All **13 of 13** general cases with no saved-reference match were unpriced. This is a bounded reference/alias diagnostic; it does not justify a catalogue-wide coverage percentage or prove every historical alias is unresolved.

The existing price service was called directly against read-only stored data at local source `82d9352416bf0eabe3af12dc80b668b0f4753fd0`. It reads stored quotes when a card is opened; this does not populate missing quotes. The separate personal/owner-only access policy controls who may read prices. Four anonymous HTTP checks returned the expected 401 response; they do not establish signed-in Home/binder/card agreement.

### Artwork, search, and delivery reads

- All **40 of 40** sampled detail records had the expected identity and image association.
- All **117 of 117** prepared renditions passed byte, dimension, and CPU/WASM decode checks; one external original also decoded.
- Search returned the expected printing/variant and image in **39 of 40** cases.
- Follow-up review resolved **16** apparent first-row variant differences and **3** checksum-field diagnostics.
- All **234 of 234** core public API/image requests succeeded.
- **9** distinct image responses had malformed `Cache-Control` text: `public, max-age=public, max-age=31536000, immutable`.

### Desktop timing evidence

These are Windows desktop full-response-body reads. A first request in a process is not guaranteed cold server/CDN behavior and none of these timings measure iPhone loading, decoding, scrolling, or signed-in values.

| Read | Sample | Median | p95 | Maximum | Under 500 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| First card detail | 40 | 374 ms | 505 ms | 1,959 ms | 37 |
| First search | 40 | 528 ms | 904 ms | 1,801 ms | 18 |
| Images | 130 | 70 ms | 110 ms | 207 ms | — |
| Repeated card detail | 12 | 163 ms | — | 171 ms | — |
| Repeated search | 12 | 59 ms | — | 78 ms | — |
| Repeated images | 12 | 34 ms | — | 46 ms | — |

The existing local market-pricing, personal-price-access, image-preloading/window/lifecycle/rail (25 checks), and build-48 delivery regression suites passed. Controlled tests and desktop reads do not replace physical acceptance.

## Still required

- Use the existing implementation for a reviewed, paced catalogue refresh only after measuring eligible identities, exact provider mappings, and capacity; retain a quote or a specific unavailable reason per card.
- Resolve `SVAM GRA` direct search (scoped `GRA` and the native name work), prepare Japanese `M5 #002` display renditions through the approved artwork route, and correct the nine malformed cache headers without replacing verified bytes.
- Verify signed-in Home, binder, and card values plus freshness on the installed build.
- Complete iPhone checks for startup, scrolling, artwork/logos, values, haptics, gyro motion, and first/repeat timing.
