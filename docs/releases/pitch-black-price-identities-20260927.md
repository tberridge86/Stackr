# Pitch Black printing-reference correction

The published English catalogue contains both the old 120-record `PBL` set and
the richer `me05` set. The source aliases `me5` and `me5-N` still point to the old
default variants, while reviewed printing aliases point to `me05`. This prevents
15 saved copies from obtaining the existing labelled general estimate.

Use the frozen 120-pair cohort already verified by the artwork publication and
independently check the current TCGdex set/card identity, collector number and
name. Correct only the Pokemon TCG API source's 121 current ingestion aliases
and the same 121 aliases in the current English published snapshot. The `me5`
set alias points to `me05`; each card alias becomes printing-only. No saved finish
is inferred and no old card, set, artwork, holding or price record is deleted.
Existing exact TCGdex variant aliases and the source's approved status are retained.

The manual workflow is exact-main-only and uses the existing protected production
environment and verified database connections. It rehearses against staging and
production with rollback/readback before an optional production commit. The
default is dry run. Unexpected aliases, changed names/numbers/language, changed
old finish metadata or a missing provider card fail before publication. Hashes
of holdings, binders, placements and asset rows must remain unchanged. Receipts
contain before/after aliases and preservation hashes, never credentials.

Rollback must restore only the 242 alias rows from a verified receipt after
checking they still equal its after-state; do not delete either catalogue or
rewrite saved holdings. An uncertain commit requires readback before retrying.
After repair, run the existing bounded owner refresh and verify the published
Home/binder valuation. This workflow does not introduce another pricing worker.

Local PGlite tests execute the actual update queries, demonstrate complete
rollback, reject changed identities and preserve saved card references/quantities.
Production publication and pricing remain unverified until a run receipt exists.
