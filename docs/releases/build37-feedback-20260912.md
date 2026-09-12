# Build 37 retrieval and card interaction repairs

The owner reported slow binder retrieval, missing prices on berridge14, missing
set logos, duplicate Pitch Black, clipped card movement and insufficient foil
shine after testing build 37. This repair starts from main
`1459c99faf7c84a6c185c9ebaf9c77d53c519fd1`.

## Verified causes and changes

- Binder artwork used a full asset manifest after loading facts. A production
  VSTAR Universe manifest request returned HTTP 504 after 8,138 ms. The existing
  preferred-image set endpoint returned 258 printings / 347 variants, including
  343 approved variant images, in 1,615 ms (MISS). The actual replacement reader
  later returned the same identities and 343 images in 103 ms (gateway STALE
  cache). These are desktop API observations, not phone rendering measurements.
  Binders now use this preferred-image path, publish successful batches before
  optional fallback work, and save approved images in the existing owner-scoped
  reopen snapshot. Version changes cannot reuse an older snapshot's artwork.
- Set aliases are read concurrently and their returned metadata is reused
  briefly, avoiding an immediate duplicate set request. Tracked-set identity
  reads no longer wait for optional set branding.
- Price requests were repeatedly timing out against the gateway's existing
  four-second backend budget. Read-only production observations included
  49 HTTP 504s (8.47-second average across two attempts), 55 HTTP 503s and 15
  HTTP 429s in the diagnostic window. Successful responses also occurred;
  absence of all stored quotes was ruled out.
- A production EXPLAIN of a selected exact variant found the legacy alias view
  took 2,781 ms, versus 12.8 ms for its indexed exact snapshot lookup and 16.5 ms
  for catalogue metadata. The backend now tries an exact, source-validated
  snapshot before the expensive alias fallback. Canonical sold/market evidence
  still wins first. Auth, source permissions, conditions and deadlines are unchanged.
- The client reuses validated canonical facts for exact prices, merges quotes
  progressively and requests only the visible rows in batches of at most 12,
  with a 60-card-per-minute ceiling and bounded retries after service failures.
  It preserves saved prices on unavailable responses. Expired
  results and results older than the displayed source timestamp cannot replace
  them. Older source-timestamped estimates retain the existing cached-price label.
- Only the English `PBL` Pitch Black duplicate is hidden when its canonical
  `me5`/`me05` entry exists. The saved owner binder is not deleted or changed.
- Card previews have stronger bounded rotation, a small floating displacement,
  depth shadow and rotation-driven foil shine. The opaque backing and outer
  clipping are removed. Haptics, focus/background reset and reduced motion remain.

## Price investigation and unchanged coverage gaps

The deployed gateway, backend and active six-hour Railway worker all already
target berridge14. An early suspicion based on a different GitHub scheduled
queue variable was ruled out by live deployment logs and Railway Variables UI.
No authorization allowlist or owner configuration change is part of this repair.

Read-only owner dry run [34718796004](https://github.com/tberridge86/Stackr/actions/runs/34718796004)
scanned 300 owned rows, found 77 eligible and selected 30. It wrote no prices.
Skipped rows included 101 other finishes, 56 unresolved sets, 51 unsupported or
unpublished variants, ten ambiguous identities, four graded cards and one
unresolved card. The selected exact normal variants already have stored TCGdex
quotes. No apply run or source activation was warranted by this diagnosis.

Chinese logos are still an actual coverage gap. Existing approved packs contain
15 English logos and 177 exact Japanese set mappings. The reviewed Simplified
and Traditional Chinese provider records have no set-logo fields. The inspected
official product pages provide product artwork/shared branding, not an approved
standalone set-logo manifest. No logos, permissions or native-language identity
mappings have been invented. This change does not claim complete historic artwork.

## Validation and delivery

Local typecheck, backend typecheck and lint passed (existing lint warnings remain).
Focused binder catalogue, personal loading, card haptics/motion, canonical price,
preferred artwork and Pitch Black tests passed. The existing 18 reopen tests also
passed, including actual screen orchestration, account isolation and SQLite
reopen/rollback. Backend service tests and an independent scope/precedence review
passed. Added regression cases run in normal PR CI.

Implementation is prepared for the existing backend-only release and compatible
owner iOS update. Release identities and final checks must be recorded after
delivery. Physical iPhone rendering, haptics and perceived latency remain a
separate acceptance step; the owner's build 37 feedback is the failed baseline.
