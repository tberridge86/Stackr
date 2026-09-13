# Build 37 second feedback: collection retrieval and presentation

This repair starts from reviewed main `a00f85418da33435b72728bd14c5af5340deaf48`,
already delivered through PR #195. The owner reported empty prices, slow binder,
Pokémon and duplicate screens, missing grid images despite working detail images,
inflated master-set totals, clipped headings and inconsistent card presentation.
The owner reports running update `12/09/2026 22:36:24` UK time, matching the
previous owner update's published timestamp. This feedback therefore describes
the failed previous update, not an assumed older installation.

## Changes

- Home reads saved ownership before optional catalogue and pricing work. Collection
  prices use bounded snapshot batches instead of resolving every owned card.
  The first collection read mounts the compact Stackr loading animation.
- The snapshot API accepts one bounded group of exact variants, canonical normal
  printings, or legacy references scoped to their saved set and language. Legacy
  results are explicitly stale printing-level estimates, never exact finish,
  graded, first-edition or live sold values. Existing owner authentication remains.
- Binder visible-price reads retain saved estimates, respect service cooldowns,
  and display the stored estimate in the detail sheet as well as the grid.
  Bodyless cache responses recover once without replaying mutations or dropping
  authentication/cancellation.
- Preferred artwork arrives in pages of 96 variants. Thumbnail selection retains
  supplied images and can fall back to the full image. A constructed provider URL
  cannot replace a usable image without verification.
- Duplicate ownership comes from saved rows; Pokémon results no longer wait for
  a price request for every printing. Both screens reject stale account responses.
- Master-set totals expand only from canonical catalogue finishes. Marketplace
  price keys cannot manufacture collection slots. Cross-binder ownership remains.
- Search and Collection show their complete titles with purple `rch` and `ction`.
  Shared title clipping is removed. Market removes the redundant listing-count
  recommendation, reduces boxes and gives prices, titles and controls a hierarchy.
- Card previews have more bounded movement and stronger rotation-driven foil
  light, with rounded image clipping and no fixed white backing. Reduced motion
  and haptic controls remain. Rarity choices expand within the existing options.
  Login and initial profile copy are shorter; existing Stackr artwork remains.

## Observed evidence and limits

Production observations on 13 September 2026 used the deployed baseline above.
The queried activity window recorded 948 search rate-limit responses, 83 search
timeouts and 52 card-price timeouts. These support reducing request fan-out; they
do not measure the new app on the owner's phone.

The owner has 238 owned binder rows. Read-only exact saved card/set/language joins
found 218 ungraded Near Mint rows with numeric cached estimates, representing 204
distinct identities. Replaying those actual stored rows through the new service
and mobile helper recovered 204/204 estimates in 33 grouped client requests.
Their timestamps are 6 September: zero are demonstrated fresh quotes. Private
row fixtures remain ignored local evidence, outside this PR.

Public preferred-artwork reads returned images for all 237 Evolving Skies
printings and all 118 Abyss Eye printings; VSTAR Universe returned 254/258.
Twenty-three representative thumbnail/detail/original URLs returned HTTP 200.
The actual progressive reader delivered first images at 3,340 ms, 859 ms and
1,479 ms respectively on cold desktop requests, and completed at 5,433 ms,
1,230 ms and 2,565 ms. These are API delivery measurements, not image decoding,
warm reopen timings or physical-device performance guarantees.

Canonical Japanese names are present for Abyss Eye, including #001
`トロピウス`; its canonical English name is absent. Existing translated-name
coverage is insufficient. The four VSTAR basic-energy image gaps, missing English
card translations and remaining Chinese set marks are not closed by this code.
No catalogue/source activation or price-refresh job is part of this repair.

The 393×852 web preview renders the shorter login with the Stackr logo and
accessible controls. Signed-in layout, received update identity, iPhone loading
times, thumbnails and haptic/foil feel still require device acceptance.

## Validation and delivery

Focused regressions cover quote identity and batching, malformed API selectors,
cache recovery, stale-account responses, image precedence, rarity filters and
canonical master-set totals. The new regressions are included in existing CI
scripts. Required local TypeScript/backend TypeScript and lint checks passed;
lint reports 12 existing warnings and no errors. Gateway tests and generated API
contract validation passed. An owner-runtime iOS export succeeded; the final
frozen revision and GitHub results are recorded when delivery completes.

Release order: reviewed PR and checks, exact backend deployment, gateway query
support, then compatible owner-channel update for TestFlight 1.0.3(37), runtime
`1.0.3-owner-recognition-v1`. No native dependency or runtime change is needed.
Main remains protected outside the existing reviewed merge procedure.

Rollback baselines: backend deployment `e011f634-0a1d-4c8b-975b-62c8edf2f3f9`;
gateway version `adb42a22-b609-4aea-b2ba-0c5a7b8a23d2`, deployment
`e498ea36-b7a7-4421-a09f-a656f9b44d9b`; owner update group
`f9a7ee27-d599-420f-8040-7d41f1fb335b`.

Current state: implemented and locally tested; current-turn PR, merge, backend,
gateway and mobile delivery receipts remain pending. Device verification pending.
