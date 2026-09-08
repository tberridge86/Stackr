# Approved staging asset recovery — 2026-09-08

Production received **3,908** approved, public Japanese card-image records from the existing staging catalogue. Each record was checked against the current published production variant, printing, set, language, collector number, variant code, finish code, source approval, and asset policy before insertion.

The recovery manifest is pinned at SHA-256 `29F8DDBA5D7E67F129DBD3FFF30FEEEF979E6D34DC7633E84ACE5058973CC8E9`. Durable [rollback evidence](../../deploy/evidence/catalogue-art-recovery-20260908.json) records every inserted asset ID and current-version link pair. Post-write verification found 3,908 inserted records, all approved/public/active card images from the approved official Japanese source, plus 3,908 matching current-version links.

A fresh public API request shows 59 illustrated variants in Japanese M5 (Abyss Eye), from 118 variants. A Chinese control set remains unchanged by this recovery.

The recovery intentionally did not alter 750 TCGdex storage-linked records: production already owns those storage identities, and reassigning them would remap existing records. It also excluded staging rows whose source has no approved production source record. No catalogue version, set, card, variant, source, storage object, or existing asset record was changed.

A subsequent read-only check found that the 750 Simplified Chinese candidates comprise 746 stored images byte-identical to existing Traditional Chinese assets. Their provider URLs use different language paths, but no captured evidence verifies the printed language. The version-link model can technically reuse existing assets; it must not be used here without positive printed-language evidence. Four shared files also span normal/reverse targets and need explicit artwork-association modelling. These Chinese images remain unrecovered.

If rollback is required, delete only the recorded `catalogue_version_assets` pairs first, then only the recorded inserted `catalog.assets` IDs. Do not roll back by set, source, or variant predicates.
