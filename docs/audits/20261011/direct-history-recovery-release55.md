# HISTORY-DIRECT-WRITE-001 — direct quantity history recovery

Source revision at assignment: `23c64b0e28c2260ba7b5312fbc0fee1bba8dbc6f` on `agent/release/tif-readiness-20261011`. This is a locally prepared Release 55 repair; the coordinator records its implementation revision and candidate delivery separately. It has not changed Supabase, a hosted runtime, EAS, TestFlight, or the deployed backend.

## Confirmed fault

Two direct quantity consumers committed their holding before a distinct activity-feed request, then only displayed an alert if that second request failed:

- `app/set/[id].tsx` updates/deletes `user_card_variants` before `createActivityPost`.
- `features/binder/BinderDetailScreen.tsx` updates/deletes the exact variant and synchronises existing binder cards before `createActivityPost`.

The existing scan/manual batch mechanism in `lib/collectionBatch.ts` persists a binder-batch journal and is intentionally not reused here: these direct operations do not have its binder batch identity and must never replay a holding write.

## Repair

`lib/directCollectionHistoryRecovery.ts` adds a small AsyncStorage journal dedicated to the second write only. Each entry contains an immutable canonical activity payload, the initiating owner ID, a stable UUID derived from a one-time operation ID, and an integrity hash. It is written only after the holding commit succeeds. The helper then calls `createActivityPost` with both the initiating owner and stable event ID. Its existing duplicate-row verification makes a transport failure after a server insert idempotent on replay.

Both direct consumers:

1. retain their existing holding mutation and optimistic state;
2. capture only their already-loaded card name, number, language and catalogue image fields at the mutation, then journal and attempt that exact activity only after the holding succeeds;
3. retry pending history when a mounted Set view becomes ownership-visible, or a mounted Binder Detail view becomes editable for its signed-in owner (not on every focus or reload); and
4. display the existing honest failure wording when the journal itself could not be persisted, or say that history is waiting only when a durable intent exists.

Recovery scans the current owner's private key prefix, never reads another owner's intent, and executes at most 20 history writes per run, sequentially. Invalid local records are retained and reported in the result; they cannot take the first 20 valid attempts away from valid records found later in the scan. The in-memory coordinator also coalesces duplicate local replays; server-side stable event IDs cover a restarted client. Pending entries are ordered by stable UUID key, so offline actions are not guaranteed to replay in original action order; the current activity API records `created_at` at recovery time and the journal stores no original action timestamp.

Binder Detail captures the owner, account generation and load generation before the await. A changed or ABA account generation cannot receive an old history alert.

## Verification

- `node --import tsx scripts/test-direct-collection-history-recovery.ts`
  - failed activity after a committed holding; restart recovery; real activity-writer duplicate verification after an ambiguous server insert with a changed catalogue lookup; duplicate local replay; account change; immutable nested snapshot payload; corrupt record before valid intent; bounded valid replay; and storage failure.
- `node --import tsx scripts/test-binder-direct-history-recovery.ts`
  - extracts and executes the real Binder Detail callback with focused mock persistence; verifies exactly one holding/binder update, original activity payload, and late-account alert suppression. It is not a mounted-device test.
- `node --import tsx scripts/test-home-activity-ui.ts`
  - executes the real Set Detail quantity callback and now verifies the owner-bound durable history call after a saved holding.
- `node --import tsx scripts/test-set-account-boundary.ts`
  - executes the complete Set Detail consumer with the new recovery dependency stubbed, preserving its A/B/ABA privacy and stale-write checks.
- `npx tsc --noEmit --pretty false` completed with no TypeScript diagnostic after the nullable owner fix.
- Focused ESLint completed with zero errors. Binder Detail retains eight pre-existing warnings unrelated to this repair.

## Limitations and delivery state

The database holding mutation and device journal are independent operations. A process termination after a successful holding commit but before the journal write remains an unrecoverable window without a server transaction/outbox; this repair does not claim atomic history. Set Detail also preserves its existing generation check before recording history: an account invalidation between the holding commit and that check has no persisted intent to recover. The twenty-attempt cap bounds write count, not network duration; the existing activity writer has no new transport deadline in this repair. Activity `created_at` remains the later successful activity-write time, so it does not claim the original quantity-mutation timestamp. Existing invalid local records are retained for investigation rather than deleted.

Implemented, locally tested and independently reviewed; the two snapshot issues found during review were corrected. See `direct-history-recovery-release55-review.md`. Coordinated delivery and installed-iPhone verification remain open.
