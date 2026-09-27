# Card detail printing-front repair — 27 September 2026

The live catalogue verification matched 57,436 printings and all variant identities across 561 nonempty set/language groups. All 480 Storm Emeralda/30th set-list images were delivered and decoded. However, individual card detail returned a null image for each of the four new-set canaries.

The existing image-identity RPC omitted printing-scoped assets whenever variant IDs were supplied. Card detail supplies both arrays. This additive migration includes explicitly requested printing fronts in mixed requests; it retains the previous printing-only behavior and does not substitute a sibling finish. Existing publication, rights, visibility, cursor, input bounds and execution permissions remain in force.

The existing protected production deployment workflow gains one exact scope, with frozen SQL and previous definitions. It rehearses in staging and production, rolls back, verifies restoration, then applies only this function and its migration receipt. It verifies all 480 production printing-front hashes. Metadata, images, holdings and source permissions are not rewritten in production. The staging fixture uses the existing bounded metadata/reference rehearsal and rolls back.

Validation: local PGlite executes the actual SQL against mixed/printing/variant requests, sibling finishes, under-review assets, draft versions, deleted assets, bounds and keyset pagination. Publisher guards verify frozen sources, target identity, protected workflow and rollback. Production delivery remains pending until a successful deployment receipt and public card-detail readback are appended.
