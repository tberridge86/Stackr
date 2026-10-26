# Cancellation fixture follow-up review

Source: 8f8d521b5fc6101515e2663206707b176eddac28; only backend/test/public-catalogue-cancellation.test.mjs changed from6bff530. Reviewer independently read the full57-line diff and transport implementation and verified Git blob c1f9029c05f4d090146e723993cc4ab9f5bcdb92. Static verdict: GO.

The transport explicitly returns named404/PGRST202 for the absent search RPC. Essential request and body cancellation now exercise both POST RPC and legacy GET. GET503 backoff retains one visible RPC probe, one GET attempt, signal abortion and no response write. Existing cache, artwork, translation, concurrent-request and late-response assertions remain. Normal finish now asserts honest continuation-unavailable metadata. Runtime code is unchanged.

Syntax/lint/diff checks pass. Local HTTP execution is blocked by loopback EACCES; full local backend execution also lacks sharp/stripe dependencies. No assertion or dependency was weakened to hide these host limitations. Exact-head hosted checks remain required.
