# Active Chinese mobile cache correction

PR #327 fixes the reviewed backend identity aliases and catalogue delta store. The actual Search/binder screen path also uses canonical Search snapshots, persistent set facts and binder reopen snapshots. The standalone catalogue delta synchronizer currently has no screen call site, so its repair alone cannot establish active screen cache delivery.

This follow-up versions the active API catalogue cache namespace (shared by set facts and account-scoped binder reopen snapshots) and canonical Search snapshot key. A compatible mobile update consequently reads current identities instead of old snapshots; saved holdings and offline scan queues remain unchanged. This causes one fresh catalogue read after the update. Old caches are retained under their bounded retention policies.

Exactly the five reviewed false set UUIDs also resolve to their matching Traditional Chinese UUIDs before active set metadata/card facts reads. Stale Simplified Chinese hints on those identities become Traditional Chinese hints; unrelated set codes and contradictory Japanese/Korean/English requests keep their existing checks. The legacy exact-set fallback applies the same correction, avoiding a stale Simplified Chinese retry after a canonical read failure. Ordinary language browse filters are unchanged.

Validation: map equality against the reviewed backend receipt, actual facts-first set/card adapter execution with an old UUID and Simplified Chinese hint, explicit wrong-language and unrelated-code preservation, old Search snapshot rejection, English set/variant regression, API cache recovery and TypeScript checks.

Backend delivery remains the frozen PR #327 revision `7b6cb00eff1d9d85b11a0af5700cb1bba0fd7cd6`; this follow-up needs mobile delivery only. Production deployment run #38091507505 is awaiting its required GitHub environment review. No canonical database correction or phone publication is claimed by this source change. An actual iOS export of the preceding revision passed the retained 33 recovery assets and Chinese delta repair checks; this follow-up must be exported again for its own mobile receipt.

Rollback is a normal mobile source rollback. Do not undo corrected database identities or remove the backend resolver to reverse a client cache version.
