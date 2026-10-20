# Direct collection-history recovery review — Release 55

Reviewed 2026-10-11 against the uncommitted direct-history recovery candidate. This is a local source and fixture review. It is not a deployed, submitted, installed-device or production-data acceptance record.

## Scope reviewed

- `lib/directCollectionHistoryRecovery.ts`
- the direct Set Detail and Binder Detail quantity consumers
- the existing `createActivityPost` owner, duplicate-event and snapshot contract in `lib/activity.ts`
- `scripts/test-direct-collection-history-recovery.ts` and `scripts/test-binder-direct-history-recovery.ts`

## Findings

The change is a narrowly scoped history-only recovery after an independently committed direct collection mutation. It does not replay quantities, binder writes, pricing, or unrelated activity producers.

- The intent snapshots the supplied activity through canonical serialization and freezing before persistence. Later caller mutation cannot change the persisted title, IDs, type, polarity or supplied card snapshot. Both direct consumers now supply a non-null snapshot from their current target card; Set supplies an explicit all-null snapshot when that card is no longer loaded, preventing a replay lookup from substituting newer catalogue facts.
- Each operation has one stable deterministic event ID derived from the owner, operation ID and frozen payload. The local in-flight coordinator shares an identical persisted event between concurrent callers.
- Recovery uses an owner-hashed storage prefix, verifies an exact schema and payload hash, checks the parsed owner and canonical storage key, and limits a run to 20 valid entries. Corrupt data remains retained rather than being silently replayed or deleted.
- `createActivityPost` authenticates the expected owner before writing, checks it again after optional snapshot resolution and on duplicate handling, and verifies the exact existing event on a duplicate-ID response. A stale A request cannot write under B after an A→B or A→B→A boundary.
- Set and Binder recovery entry points are owner-scoped. Their post-write notices also check the consumer's current owner/generation before presenting a pending/failure message. A late activity result therefore cannot show a collection-history notice to a later account generation.
- A persisted intent remains after a transport failure; restart recovery submits the original event ID. A persistence failure is reported as non-durable rather than represented as a queued recovery.

## Narrow validation

- `node --import tsx scripts/test-direct-collection-history-recovery.ts` passed: immutable payload/snapshot, stable replay ID, real activity-writer ambiguous-insert handling after changed catalogue facts, restart, concurrent replay, account switch, bounded corrupt-record handling, and storage failure.
- `node --import tsx scripts/test-binder-direct-history-recovery.ts` passed: actual Binder Detail quantity/binder writes occur once, snapshot/payload facts are preserved before awaited writes, and a late account-generation change suppresses the old notice.
- `node --import tsx scripts/test-set-account-boundary.ts` passed: the complete Set screen preserves its existing A→B→A ownership, stale write/history, retry and mutation-lock boundaries with the direct-history consumer installed.

## Review decision and remaining limits

No P1/P2 issue remains in the reviewed direct-history recovery path. The change preserves the existing collection mutation as the source of truth and makes the crash window visible to the user as either waiting-for-recovery or not-durably-recorded history. Recovery is initiated on screen mount and owner/visibility or editability changes; it is not retried on every focus or same-user refresh.

The fixtures are local source execution with mocked storage/auth/activity boundaries. They do not establish deployed RLS behaviour, a real mobile restart, an installed iPhone journey, or actual production history delivery. Those remain separate Release 55 acceptance evidence.
