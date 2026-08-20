# Full catalogue metadata backfill trigger

This commit synchronises PR #48 so the trusted `main` operations workflow can run the hard-pinned backend commit `a65c495fefa6d41e6bda501d2c7ab307bd43bf8c` with the existing Railway staging service variables.

Scope: metadata only for English, Japanese, Traditional Chinese, Simplified Chinese and Korean. Card-front assets remain outside this run.

Trigger revision: 2 — issued after the trusted `pull_request_target` workflow was present on `main`.
