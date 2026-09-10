# Binder-page confirmation and save — 10 September 2026

When a user confirmed another pocket and immediately saved a binder-page scan, the save handler could read the previous rendered pocket list before the confirmation reached local storage. The later confirmation could then be hidden inside a session marked saved, although its card had never been added to the binder. Replaying with the enlarged batch conflicted with the earlier recovery intent.

The regression executes the actual confirmation and save handlers with delayed storage, proving every included pocket comes from persisted review state. It covers rejected local writes, Save retried without repairing the failed confirmation, a successful confirmation retry, edits attempted during a save, and replay after an interrupted collection response. The original release source fails the same delayed-confirmation assertion by submitting only the previously confirmed card.

The release patch coordinates local review mutations with the save operation and labels the final action as saving confirmed cards. A failed review write prevents saving until the affected pocket is durably retried or resolved outside the active save. A successful edit to another pocket cannot clear that failure. Failures from an older loaded session do not affect a new session. Existing exact-card identity, owner checks, recovery intents and duplicate protection remain in place. No database or catalogue migration is needed.

The interrupted collection-response test verifies reuse of the actual recovery intent/request key against a stub collection adapter. The existing durable recovery suite separately checks the collection journal; the new test is not a new production duplicate-write verification.

Device check: confirm two pockets in quick succession, immediately save, and verify both physical copies are present once. Repeat after a recoverable save failure and check that retry does not double-count either copy.
