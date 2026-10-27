# R2 eligible-scope closeout — 27 October 2026

**Verified eligible-scope completion:** 62,098 / 62,098 uploaded; zero eligible Supabase source rows remain. Latest database timestamp: 2026-10-27 16:44:39.110692 UTC.

The completed B run published its final 3,364 assets across 135 batches. The read-only collector verified all 946 evidence files (209,985,626 bytes), checkpoint/journal continuity, the acceptance chain, terminal exhaustion, absent runner lock, and no pending publication. The derived receipt SHA-256 is `affcbbf4b9d3f6e921ed73deada3e3bfbf5d36e4ba68e91d4aae859d3136f2b3`. The frozen runner writes a terminal checkpoint rather than a standalone final receipt file.

The original runner's final aggregate query timed out. Independent equivalent pointer-coherence checks passed across four disjoint exhaustive UUID ranges: all 62,098 originals and associated derivative pointers checked, with zero malformed rows. These checks used separate snapshots; the global count was reconfirmed afterward.

Thirteen fresh public GET checks across eleven distinct objects passed HTTP status, MIME, length and SHA-256 validation. This is a bounded retrieval sample, not a full object GET audit or a claim about every catalogue image.

Evidence: [machine-readable closeout](r2-eligible-closeout-20261027.json). The collector deployment was `267b1f73-eadb-412d-9f3a-76ff4fcfbd8d`; the uploader was not restarted. Source objects were not deleted.

R2 is no longer a blocker for the candidate TestFlight release. Authenticated QA, gateway attestation/rollback, scoped SQL/backend/gateway rollout and signed production build/distribution remain separate gates.
