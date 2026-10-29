# Independent search review - 26 October 2026

Verdict: GO for the frozen integrated mobile, gateway, backend and SQL source. Reviewer independently verified all 14 backend files in reviewed-backend-source.json and repeated the actual backend/SDK/PGlite suite plus four-cohort query-plan and rollback harness. Mobile and refresh review is recorded in ../infrastructure-boundaries-20261026/mobile-search-review.md.

Resolved findings include selected-set scoping, composite card/set identity deduplication, complete set-code resolution under short server pages, optional-section independence, query/account generations, selected-finish ownership, focus cancellation, and refresh CORS. Existing compatibility assertions remain meaningful.

Proposal LF SHA-256: a84c5dd7f6ee6e5fc1831b37b7ef5319554325e48efb40ed7d3be8baae5f1ed3. Rollback SHA-256: baaf257bdd376a29eb1cabb1fc9129c8c6ec3819fb9af9977f45650406cad7f4.

The membership fence preserves publication checks and changes the large local plan from a 5,601-row membership scan to 601 indexed one-row probes. Matching-name and eligibility work still exceeds the requested page. This is not production latency evidence; the empty local cohort is slower.

Release holds: exact-head hosted CI and native PostgreSQL17 qualification, iOS export, separately authorised SQL registration/application and compatible backend/gateway/app rollout, authenticated QA, and installed-phone acceptance. No production writes or deployments were performed.

## Native JIT finding and reviewed follow-up

The first native run exposed compilation overhead absent from PGlite. The reviewed follow-up changes only function-local jit=off; the function body and ACL are unchanged. Current proposal LF SHA-256: d8f15108792dd828f4beb979245e66add90aba7b0bc1aaed7d0ce331eefd70b8.

Reviewer independently verified the four-file follow-up manifest, reran actual backend regressions and the full local four-cohort A/B/plan/rollback harness. Exact entries/hasMore, stable per-definition revisions, obsolete-cursor409, invoker/stable/search_path/grants and caller settings are preserved. PGlite timing is not used to claim a JIT speed improvement. Static/correctness verdict: GO for publication, with native exact-source A/B still required.

The missing ordered-keyset API fixture was independently reviewed without removing original identity/isolation assertions. The existing dependency-audit artifact upload is also reviewed: no new scan, threshold, dependency or schedule change. Full hosted API suites remain required because local loopback and Git Bash execution are unavailable.
