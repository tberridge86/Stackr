# Build 49 image preloading candidate

## Source and scope

This local candidate starts from `dfdc1ddf4df3ad04d3d288a2f6b80a8113a4ff29` (the same tree as the reviewed patch base `4b191ecb1092975aafcb3ca3ac9f41dbd2d7df5e`). It applies the independently checksum-verified preloading patch:

- patch SHA-256: `e9c3e27e4b16e12f021813366e5f5eabc4b461d2e8325c53b1b992fd49b03a18`
- handoff SHA-256: `e91ec1eaf435b64110a011a99dd3a266b4aac2e446e5b68bba247aac0851dfa3`

The change virtualizes the Cards search rail, warms only visible card thumbnails plus a bounded look-ahead, and moves binder thumbnail warming to the currently visible grid window. It preserves the supplied printing-specific thumbnail URLs; it does not construct URLs, select a different language/finish, preload full-size artwork, or write catalogue, pricing, or ownership data. The new regression test is included in `test:personal-loading`.

## Evidence and limits

The supplied desktop diagnostic sampled 40 cards across seven sets and four languages. It verified 117 prepared images, plus one external original; it is not a complete catalogue audit. Its repeated desktop request timings were image 32–64 ms (median 37), search 55–3,184 ms (median 65), and detail 161–3,293 ms (median 170). One repeated search and one repeated detail call exceeded 500 ms. Two initial 504 responses are retained in the diagnostic evidence even though later requests succeeded.

This does not prove native rendering, scrolling smoothness, memory behavior, offline cache behavior, or installed-phone acceptance. Native first-open/reopen, rail height/layout, swipe smoothness, long press, and offline testing remain required device checks.

Known omitted data cases remain separate from this UI candidate: Japanese M5/002 has an external original but no prepared derivatives. The combined Traditional Chinese query `SVAM GRA` returned no results; scoped `GRA`, `gra` and the native name found the correct Energy and artwork. This is a collector-query exception, not evidence of missing artwork. The change does not claim complete artwork or reliable sub-500 ms response times. The SV4a 40-card gap, authoritative English/descriptive metadata, provider coverage, authenticated values and exact foil masks remain separate exceptions in the [feedback repair record](build48-shared-repairs-20261001.md).

## Validation completed for this candidate

The 25 bounded image-preload checks, full project TypeScript typecheck, personal-loading suite (including the new test), binder-retrieval suite and search-recovery tests passed. Independent review found no concrete regression. Cancellation stops queued work; an already executing prefetch is allowed to finish, and the visible image reader remains independent. Full GitHub CI and exact-source native delivery remain required. No Apple submission, API mutation, database operation or artwork publication was performed while preparing this candidate.

[Original diagnostic handoff and limitations](evidence/build49-image-delivery/handoff.json), [classified identity and artwork results](evidence/build49-image-delivery/classified.json), [preserved request evidence](evidence/build49-image-delivery/evidence.json), and [collector-query exceptions](evidence/build49-image-delivery/search-exceptions.json) retain the original verified bytes and hashes.
