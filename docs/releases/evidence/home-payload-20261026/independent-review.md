# Independent review — Home payload candidate

Reviewer: stackr_reviewer, read-only. Baseline: b5d643a997041db2a8c42b5b6cb0180e8ddf28e7.

Final outcome: GO for draft publication and exact-head hosted CI. This is not approval evidence for a new live rollout or installed-phone acceptance.

Reviewed the explicit 20-column projection, exact optional-column error handling, first-query-only retry bound, same-account/revision/cancellation guards, projected result type and null-price hydration. Reviewed populated 30-column field parity and actual custom binder cache save/read parity. No remaining source correctness blocker was found. The existing cache lifecycle had no reproduced defect requiring a runtime change.

Independent focused Home reader test passed on final typed source. Independent local PGlite comparison passed: empty/small/large/multilingual populations and foreign-account exclusion retained, with analyzed and verification executions separately counted.

Initial required TypeScript check exposed the dynamic select result type. The coding lead corrected it using a typed projected row and explicit null price hydration; the required rerun passed. Query-plan execution wording was corrected. Final measurements.json matches the frozen coding-after.txt exactly, source baseline blobs match b5, and medians recompute. A PowerShell rendering artifact was ruled out with direct UTF-8 inspection; comparison arrows were normalized to ASCII.

Original 24-column large fixture: 1,256,922 to 1,080,420 bytes (14.04%), 11 reads unchanged and zero immediate warm reads. Populated 30-column synthetic savings are separately labelled. No latency improvement is claimed.

Publication privacy review found no credentials, JWTs, real QA identities, tester data or signed private artifact URLs. Synthetic test identities and public operational build/group/project identifiers are intentionally retained.

Private authenticated Home cap/latency, hosted real priced-printing coverage and installed-phone acceptance remain unverified. No migration/index, R2 mutation, service activation, deployment or native build was performed for this candidate.
