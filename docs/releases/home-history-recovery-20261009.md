# Home collection history recovery, 9 October 2026

Included in the coordinated release candidate, PR [#323](https://github.com/tberridge86/Stackr/pull/323). This is source and local validation evidence; the correction has not been deployed or installed through TestFlight.

## Confirmed live failure

Read-only production metadata for `oakdbbzdqwurpjnoqhmu` showed an RLS-enabled `activity_feed` containing existing records, with the base columns `id,user_id,type,title,subtitle,card_id,set_id,value_change,is_positive,created_at`. None of the seven artwork/canonical snapshot columns existed. Migration `20261003101500_issue304_activity_artwork_snapshots.sql` was absent from the recorded migration list.

A public publishable-key REST request selecting base fields with `limit=0` returned HTTP 200 and an empty array. The same zero-row request selecting `card_name_snapshot,canonical_variant_id` returned HTTP 400 / `42703`, explicitly reporting the missing `card_name_snapshot` column. No collector rows were retrieved, no remote SQL script was run and no database changes were made.

Home previously selected all seven missing fields, causing the whole history read to fail. The event writer also inserted them unconditionally and swallowed the error after the collection save. Owned batch additions omitted event creation entirely. Quantity increases to existing stacks also lacked an event in several callers. These are release/schema and write-path gaps; changing the tester account or reinstalling build 54 does not correct them.

## Candidate behavior

- Home reads the newest 20 owner-filtered events and renders up to ten collection entries before optional artwork enrichment. Only explicit missing snapshot-column errors allow a retry using base columns. Permission, network and other schema errors stay visible, and a failed refresh retains successful rows. Transport authentication failures are distinguished from signout. Request and account guards reject stale enrichment.
- Event writes use the same strict optional-column compatibility rule, capture the mutation's owner, and return an explicit result. Exact optional artwork lookup has a 450 ms cancellation deadline and cannot delay or change a completed event after timing out. No fuzzy printing substitution is introduced.
- Owned batches record one addition per aggregated exact card with stable operation-bound event IDs. Duplicate IDs count as success only after verifying the same owner and payload. Batch results distinguish a committed collection from a failed history entry.
- Real and virtual binder quantity changes, plus direct set/binder variant changes, record actual increases and decreases. Unowned placeholders count as zero owned copies; unchanged quantities create no extra event. Unowned placeholders added to a binder without ownership remain outside collection history.
- Manual and scan recovery keep the original request. A committed receipt permits history-only repair, without reapplying holdings or finishes even if quantities, notes or ownership were subsequently changed. Reopened binder-page reviews reuse the frozen original binder, page and cards rather than rebuilding the request from reset controls. Account changes cannot attribute the event to the next account, and history failure cannot roll back a successfully saved quantity in the UI.

## Release verification

`test:home-activity` runs eight narrow fixtures covering both schemas, actual Home/UI callbacks, actor switches, quantity increases/decreases/no-ops, stable IDs, rejected writes, original review edit barriers, interrupted saves, and history repair after restart/later edits/removals. It is required in Platform CI and the frozen iOS release workflow before live delivery proof and native build dispatch.

The live prebuild gate uses the selected frozen mobile profile's publishable key for two exact-production-origin `activity_feed` reads, both with `limit=0`, omitted cookies and rejected redirects. Base schema must return HTTP 200 and no rows; snapshots may be available or explicitly legacy-compatible. Other failures stop the gate. Its receipt contains contract/status metadata, never keys or private records. This proves the server schema contract, not a collector's authenticated history or write permission.

Local application typecheck, lint (zero errors/eight existing warnings), the eight history fixtures, Home release checks, mobile recovery and server-delivery groups passed. Independent review and the final production-profile iOS export are recorded in the coordinated [server/mobile receipt](server-mobile-delivery-20261009.md).

## Limits and publication

This correction supports the current schema without applying a migration. Persisted rich artwork snapshots still require the separately reviewed existing migration; it has not been run. Existing recorded events can be displayed again. Events never stored cannot be reliably reconstructed from today's holdings, and this candidate does not invent a historical ledger or run a backfill.

Actual iPhone acceptance still needs an authenticated add, increase, decrease and remove, followed by Home navigation and restart; verify correct counts, ordering and the absence of duplicate holdings on a history retry. No new server deployment, database mutation, provider refresh, catalogue job or TestFlight upload was performed for this follow-up.
