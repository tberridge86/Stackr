# Automatically prepare started binders

The owner asked for already-selected, started binders to load automatically on
the phone, reducing repeated retrieval waits. This change extends the existing
private saved-view cache; it adds no new screen or catalogue download system.

Baseline: main `60103db61fd42a1168ade395571ba08d0e1a2c5b`.
Only the isolated `codex/binder-started-preload-20261016` checkout was edited.

## Confirmed gaps and resulting behaviour

- Home scheduled complete binder preparation only after valuation and chart work.
  It now schedules after the complete private saved-card read, independently of
  optional prices. A runtime test leaves valuation unresolved and confirms the
  binder warmer still starts after interactions.
- Opening the binder library directly did not prepare binder contents. An
  account-bound hook now schedules the existing loader after the library renders.
  Saved read-only mode, account changes and unmount cancel queued work.
- Custom binders could be prepared only from Home's complete card map. They can
  now also use the existing fully paginated private binder-card read. Opening a
  custom binder saves that complete result for the next launch.
- Disk restoration discarded custom-source completeness information. A baseline
  cold-restore probe returns an unusable custom snapshot; the same probe against
  the repair preserves the marker and returns a complete saved view.
- Preparation and disk retention stopped at eight binders. Disk retention and
  the preload pass now cover up to 64 recent started binders, within 64 MiB.
  Working memory remains limited to eight entries / 8 MiB. Preparation stays
  sequential, skips complete current snapshots, deduplicates binder IDs, and
  excludes optional prices and artwork retrieval.

## Persistence and account boundaries

Existing owner, runtime namespace, session-expiry, cancellation and invalidation
guards remain. A cached view is read-only until fresh ownership is established;
it never authorises an edit. Sign-out/account changes revoke stale work. Full
official-set identity/count/version validation remains mandatory, and a partial
response cannot replace a complete saved view. Cached views continue to exclude
prices, credentials, arbitrary provider payloads and controlled live references.

The existing retention window remains 24 hours. Per-entry size and card-count
limits remain. This stores binder data and existing image references, not every
full-resolution card image. Image loading continues to use the existing image
cache and visible-card preloading. The first successful sync still needs a
connection; no zero-wait or measured mobile-network latency claim is made.

## Verification and release state

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors; eight warnings in unchanged source.
- Focused lint on the changed hook/cache/detail/Home modules: zero errors;
  ten warnings in unchanged source.
- `npm run test:mobile-cache`: passed, including the new actual React hook
  runtime test and custom cold-restore checks.
- `scripts/test-home-startup-runtime.ts`: passed, including stalled-price
  independence and account/cancellation guards.
- `scripts/test-binder-reopen.mjs`: 19 cases passed, including actual detail
  loader behaviour, custom saving, a real file-backed SQLite restart, retention
  beyond eight entries, the storage cap and transaction rollback.
- `scripts/test-binder-library-loading.ts`: passed.
- Baseline-versus-repair cold-restore probe: baseline complete=false;
  repaired complete=true, with custom-source metadata retained.

Independent review is requested before merge, particularly for the new custom
source marker, library-trigger cancellation, and retained account boundaries.
No sub-agents were used in this side conversation. No API/database mutation,
deployment, native build or OTA publication was performed. Installed-iPhone
behaviour and timing remain unverified. The change is prepared for release
review and must be included in an authorised app release to reach users.

Rollback: revert this change before release, or ship a subsequent approved
client rollback. Existing cache keys and table schema remain compatible; older
clients safely ignore the new custom-source kind. No remote rollback is needed.
