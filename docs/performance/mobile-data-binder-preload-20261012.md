# Mobile-data binder preload — 12 October 2026

## Trigger and scope

The owner reports that Stackr can hang while opening away from Wi-Fi although
Safari works and cellular data is enabled. This is a qualitative device report;
no iPhone timing trace, signed delivery or physical diagnosis was performed.
The tested repairs address confirmed source blocking paths, without establishing
that they explain every failure on the installed phone.

This repair keeps Stackr's existing navigation, RLS, account boundaries,
pricing rules and persistence model. It changes only the route to useful saved
binder data and the bounded post-Home warm-up path.

## Smallest repairs

| Area | Change | Preserved behaviour |
| --- | --- | --- |
| Binder library cache | Version 2 cache envelopes bind the exact account and runtime URL. They reject v1, malformed, foreign and invalid/future timestamps; older writers cannot replace newer entries. | A first valid online sync is required. Cache data never authorises an account. |
| Saved view | A valid local session may choose **View saved binders** during pending or failed startup checks. The existing binder screen is read-only, rechecks owner/session/epoch at load and open, and hides write and outbound actions. | Normal routing and profile checks remain. Expired/denied/signed-out sessions cannot open saved cards; Back returns to the account check. |
| Home | Cached Home data can paint without waiting for `getUser`; fresh data remains owner/session/generation/mutation guarded. Binder list data is paginated. | A known auth denial revokes the local preview. Transport failure is not presented as a verified live account. |
| Deferred reopen warm-up | After Home's main work and interactions, at most eight recent owner binders are warmed sequentially. Official binders use existing facts-only, no-price/no-asset reads. Custom binders use only Home's verified, fully paginated private saved-card map. | Existing reopen storage limits remain: 8 entries, 8 MiB total, 2 MiB per entry, 24-hour age and 2,500 rows. Incomplete/foreign/late/expired data is not saved. |

The custom source records only its complete-source kind and card count. It
retains saved card identity, language, finish/condition, quantity and notes;
prices remain excluded. A custom binder with zero complete saved cards is
truthful. Normal card retrieval is also paginated so a later
default server page cannot replace that complete custom view.

## Local evidence

- `scripts/test-binder-library-cache.ts`: first write, account scope, stale
  writer/deletion, custom artwork retention, legacy/corrupt rejection.
- `scripts/test-binder-library-saved-runtime.ts`: disk-only saved route,
  A/B late-result mask, no remote refresh/pricing reads, sign-out and held-card
  open guard.
- `scripts/test-binder-preload-runtime.ts`: capped sequential warm-up, owner
  scope, current lease/session/expiry checks after awaits, complete custom map,
  zero custom binder, foreign/partial rejection, and existing official
  canonical strictness.

The original Home runtime regression was RED when online `getUser` never
resolved: eligible stored collection data did not paint. It now paints without
authorising a fresh read or write. A 1,702-binder service fixture also reproduced
the former first-page limit; paginated retrieval now returns every fixture row.
Private binder cards are likewise tested across two pages, without price reads.

Final local combined checks: `test:startup-loading` (including actual auth,
saved library, preload and achievement runtime suites), `test:startup-video`,
`test:personal-loading`, `test:binder-retrieval`, `test:integration-repair` and
TypeScript pass. The retrieval suite includes a real file-backed SQLite reopen,
isolation and rollback test; it does not execute Expo SQLite on the iPhone.
Scoped lint has zero errors; existing adapter/import warnings remain. Final
production-profile iOS Metro/Hermes export and hosted-head receipts are retained
in the dated owner-facing evidence file and PR337. At this documentation capture
the final copy-follow-up export and new hosted head are pending. These checks do
not measure iPhone launch time, network
throughput, physical memory or installed-device correctness.

## Separate achievement account repair

`ACHIEVEMENT-ACCOUNT-BOUNDARY-001` was reproduced in the earlier startup audit.
The existing provider now masks and rejects old account/session generations,
including batched same-ID A/B/A changes. The service captures its notifier at
request start and carries the checked account ID. A current B notification
arriving before B's refresh starts from B's empty state instead of merging
masked A values. Actual provider and service tests cover these paths, sign-out,
unmount and legitimate current notifications. Reward definitions, eligibility,
coin write semantics and server permissions are unchanged. This is a display
repair, not proof of server-side mutation or a measured speed improvement.

Independent final source review accepted the saved-cache/preload scope and the
early-notifier account-boundary follow-up. Runtime source is
`f3042f985ba1269ed25144f2c28d3e7ef2f09cbd`: mobile changes are isolated in
`33ac0437e66dd281f3ed73c2f75e8b556c58e0ff`, followed by the separate achievement
repair at `aeac8f3cfb6d722dc4cb768d9d292079c9677eda`. The last four-line saved-view
presentation follow-up labels prices as requiring connection and removes unknown
progress, rather than suggesting a price request is still running. Normal binder
labels/progress are unchanged; scoped lint passes. Signed delivery, merge and
installed-device acceptance remain unperformed.

The first hosted run at documentation head `ea211f1` exposed an older
catalogue-retry test double without the production query's `.range` method.
The test double now slices the requested saved-row page; existing catalogue
retry, quantity and ownership assertions are preserved. `test:binder-catalogue`
passes locally. This verification-only follow-up does not change application
runtime `f3042f9`; fresh hosted-head results are still required.

The next hosted retrieval job exposed the same missing method in the separate
parallel-retrieval VM fixture. Its mock now asserts the first requested page
while preserving the deferred ownership read; all twelve concurrency/retrieval
checks pass. Callback-only detail fixtures do not execute this paginator and
are unchanged. Application/runtime export is unchanged by either fixture repair.
The full hosted candidate command sequence now passes locally: typecheck,
catalogue, personal loading, first paint, parallel retrieval and reopen. The
mobile-recovery, server-delivery and Home-activity suites also pass on this source.
The remaining platform static check expected online identity confirmation before
local Home hydration. Its guard now checks local owner/generation/expiry,
owner-bound parsing and known-denial revocation, while separately retaining
live confirmation for fresh publication and cache persistence. The complete
commerce-release-lock suite and actual Home runtime tests pass. Independent
Home release, personal-pricing and account-request checks also pass. These are
verification-only updates; the application source and exported bundle remain
`f3042f9` and do not gain any server permission or payment capability.

## Proposed delivery after approval

The candidate remains in the existing draft PR337. A merge may trigger the
existing main-branch service watchers even though this candidate changes no
backend files. Keep the current production profile/channel, recognition and
commerce gates. The existing splash repair requires a signed native build;
an OTA alone cannot deliver the full candidate. The production EAS profile uses
remote versions and auto-increment: confirm the next number before requesting
the internal TestFlight build (intended next build 56). No public App Store
promotion, catalogue/database writes, access changes, paid provider or new
schedule is part of this repair. If the new candidate fails acceptance, stop
promotion and retain build 55 as the comparison baseline; it is not a known-good
rollback for the owner's existing CoroCoro/mobile-startup faults. Any corrective
source revert must be reviewed before live delivery.

## Device acceptance still required

On the owner's iPhone 15 Pro over 5G, test a retained signed-in cache, first
online sync, slow mobile data, offline-after-sync, expired/sign-out and an
account switch. Record time to first screen, saved library, fresh library and
first binder contents. Confirm that stale data never crosses accounts and that
the readonly route cannot edit/scan/create/delete/reorder or show current
prices. This work does not preload every binder, full offline imagery or price
data, and makes no performance claim until those measurements exist.
