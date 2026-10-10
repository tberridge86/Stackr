# Chinese duplicate identity correction — 10 October 2026

Five falsely labelled Simplified Chinese sets (SV7a, SV8, SV8a, SV9, SV10) duplicate existing Traditional Chinese identities. Exact reviewed matches cover 605 printings and 750 finish variants. The source guard in PR #326 prevents reimport.

This repair retains all source IDs, retires false duplicates with corrected-by pointers, and routes old set/card/variant/UUID-search links to their exact published Traditional Chinese targets. Ordinary language filters remain separate. No language fields, holdings, image mappings or prices are transferred. Backend mappings are bound to fixed reviewed hashes; malformed mappings fail startup.

The mobile catalogue cache removes deprecated sets, printings and variants, including dependent lookup aliases. Variant retirement clears a cached default image if necessary. Background sync follows pagination and rejects repeated cursors. An exact five-set replay also repairs an older app that already consumed correction deltas. Offline scan queues and unrelated records remain intact. This client repair requires a compatible mobile update; backend deployment does not establish installed-device delivery.

Production project: `oakdbbzdqwurpjnoqhmu`. The manual SQL defaults to ROLLBACK and has passed production rehearsal. It checks exact 5/605/750 mapping hashes, published target language, absent source artwork, absent affected ownership/business/price references, and 605 exact open conflict receipts. It locks checked tables during the transaction, records full pairing evidence in `audit.catalogue_events`, and publishes 1,360 deprecation deltas. Staging is deliberately excluded because it has 667 source asset associations requiring separate review.

Delivery order: review and merge; deploy backend using the existing owner TestFlight backend lane; prove old links resolve; execute guarded production COMMIT; verify canonical/public views and deltas; deliver compatible mobile cache repair and verify on device.

Rollback: before database COMMIT, revert runtime/mobile changes normally. After COMMIT, preserve the resolver and source guard. Any database reversal must use the recorded before-pairs, verify the exact retirement reason and pointers, restore only that cohort, and append restoration deltas; never delete history or republish broad language data. No automatic destructive rollback is supplied.

Validation: backend suite (49 tests), API integration checks, cache regression covering multiple delta pages and previously consumed correction cursors, and TypeScript checks. Final deployment and database receipts are recorded separately; this document alone is not delivery evidence.
