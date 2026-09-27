# Owner refresh after price history grows

Protected dry run 36351007635 stopped before any provider calls because the
existing snapshot-recency query reached its 1,000-row cap. After the earlier
complete refresh, historical rows can exceed that cap despite fewer than 500
owned price identities. Increasing the cap or interpreting truncated history
as missing prices would not preserve oldest-first selection.

Keep the existing filtered TCGdex snapshot query, but remove identities whose
newest snapshot has already been observed from each subsequent bounded read.
Each nonempty read must resolve at least one remaining identity. An empty read
proves the remainder has no qualifying snapshot; transport failures and
unexpected identities fail before provider work. Existing provider limits,
owner scope, queue behaviour, full-pass behaviour and price writers are unchanged.

Regression: a 1,000-row history for one recent card must not hide an older card
on the next read or a never-priced third card. Verify missing-first/oldest-next
selection, newest timestamp retention and fail-closed errors.

Preceding publication evidence: run 36350681881 committed and read back the
reviewed 242 Pitch Black alias corrections after staging/production rehearsals.
All holdings, binders, placements and asset preservation hashes matched. The
first pricing refresh (36349491995) published 345/366 copies, GBP 1,103.79 general
estimate subtotal, with all 348 valuation comparisons passing. The 15 corrected
Pitch Black holdings still require this next price refresh and final readback.
