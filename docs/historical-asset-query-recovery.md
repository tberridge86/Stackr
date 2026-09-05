# Historical asset-query recovery design (review only)

Status: design for a later, release-coordinated implementation. The release
coordinator is paused: this document is not approval to merge, deploy, change
the database, or query production.

## Observed failure and invariant

A production `api.asset_manifest` read for six known Japanese variant IDs
timed out at five seconds. The current view derives identities with
`coalesce(cva.variant_id, a.variant_id)` and
`coalesce(cva.printing_id, a.printing_id, av.printing_id)`. Its plan begins at
published `catalogue_version_assets` rows, so a view-level variant predicate is
not reliably pushed to a selective base-table index.

The recovery query must return exactly the same identity membership as the
current two reads:

```sql
m.variant_id = any(p_variant_ids)
or m.printing_id = any(p_printing_ids)
```

It must then join the **unchanged** `api.asset_manifest` view. That final join
retains published-version, visibility, permission, rights, retention, deletion,
storage-provider, and RLS rules. No candidate query may recreate, loosen, or
replace those rules.

## Inputs and exposure

One request is bounded by the canonical page's identity arrays:

- `p_variant_ids uuid[]`, bounded to the page size
- `p_printing_ids uuid[]`, bounded to the page size

The request may carry language, set, and source catalogue-version context for
observability, but those values must not narrow candidate membership unless an
equivalence proof covers every coalesced and same-artwork case. In particular,
the current hydration deliberately accepts a same-artwork asset from another
published catalogue version.

Expose the eventual function only to the service-role backend path, as a
`SECURITY INVOKER` function with a fixed schema-qualified search path. It is
not a public-client RPC or a way to expose asset-source identifiers. Validate
array cardinality, UUIDs, language, and set/version coherence before calling.

## Complete candidate branches

The candidate CTE must produce distinct `(catalogue_version_id, asset_id)` rows
from every source that can contribute to the manifest's coalesced identity.
Branches must remain separate rather than relying on one broad `OR` predicate.

1. **CVA variant identity**: `cva.variant_id = any(p_variant_ids)`.
2. **CVA printing identity**: `cva.printing_id = any(p_printing_ids)`. This
   aligns with the existing
   `(language_code, asset_type, set_id, printing_id, variant_id)` CVA index.
3. **Asset variant identity**: `a.variant_id = any(p_variant_ids)`, joined to
   CVA by `asset_id`. This uses the existing variant-oriented asset index and
   captures rows where CVA leaves variant identity null.
4. **Asset printing identity**: `a.printing_id = any(p_printing_ids)`, joined
   to CVA by `asset_id`. This is required for correctness even if it
   currently lacks a selective index.
5. **Variant-derived printing identity**:
   `av.id = coalesce(cva.variant_id, a.variant_id)` and
   `av.printing_id = any(p_printing_ids)`, joined to CVA by `asset_id`. This
   covers the final `av.printing_id` arm of the manifest coalesce; an
   `a.variant_id`-only branch is incomplete because CVA can win that coalesce.

All branches may filter to `card_image`, but must otherwise remain a provable
superset of manifest rows for the supplied IDs. They then use
`UNION`/deduplication. The final projection alone must apply the exact current
membership predicate after joining the canonical view:

```sql
select m.*
from api.asset_manifest m
join candidate c
  on c.catalogue_version_id = m.catalogue_version_id
 and c.asset_id = m.asset_row_id
where m.asset_type = 'card_image'
  and (m.variant_id = any(p_variant_ids)
       or m.printing_id = any(p_printing_ids))
order by m.catalogue_version_id, m.asset_row_id;
```

Do not ship a limited candidate query that omits the asset-printing or
variant-derived-printing branches: it can hide historically approved native
assets whose identity is inherited rather than stored directly on CVA.

## Required measurements and indexes

Before implementation, run `EXPLAIN (ANALYZE, BUFFERS)` for the current and
candidate reads with the same affected six-Japanese-ID page, and representative
Traditional and Simplified Chinese pages. Capture elapsed time, rows, scans,
and index use for every branch.

- `catalogue_version_assets_lookup_idx` is ordered
  `(language_code, asset_type, set_id, printing_id, variant_id)`: it is
  selective for the printing branch, but a variant-only predicate is only
  prefix-narrowed.
- `catalogue_version_assets_asset_lookup_idx(asset_id, catalogue_version_id)`
  supports the asset-to-version join.
- `assets_variant_public_idx(variant_id, asset_type, publicly_servable,
  rights_status)` supports the asset-variant branch.
- Determine whether a public/approved `catalog.assets(printing_id, ...)` index
  and/or CVA `(language_code, asset_type, set_id, variant_id, ...)` index is
  needed. Add no index until the plan proves the candidate branch requires it.

## Equivalence and release gates

For each test page, compare a sorted multiset of
`(catalogue_version_id, asset_row_id)` from the current manifest queries with
the candidate query. Also compare DTO fields used for delivery, attribution,
permission/rights, and native variant/printing IDs. Include cases for direct
CVA identities, asset-owned identities, CVA-or-asset variant-derived printing
fallback, and same-artwork assets from another published catalogue version.

The candidate result may improve latency only after it is proven equivalent in
all of those cases. A timeout, missing index, or unmatched row is a fail-closed
condition: retain the current controlled placeholder/fallback behaviour and do
not broaden image rights, language scope, or public delivery.

As an operational diagnostic, inspect whether catalogue table statistics are
stale when reviewing the execution plan. That observation is not permission to
run `ANALYZE`, alter planner settings, or otherwise mutate production; any such
maintenance remains a separately authorised release operation.

## Candidate measurement — 5 September continuation

The parameterized, read-only prototype is retained in
`docs/sql/asset-manifest-card-image-candidate.sql`. It expands requested variants
with all variants belonging to requested printings, then unions CVA-owned and
asset-owned variant/printing matches. This covers all five identity sources
above without narrowing by language, set or published version. `MATERIALIZED`
candidate identities plus a lateral final view lookup keep the measured plan
from starting again with all published assets. This is a prototype, **not an
installed RPC, migration, or activated backend path**.

The same six-Japanese-variant page was checked read-only:

- The candidate's estimated plan uses `card_variants_printing_idx`,
  `assets_variant_public_idx`, and the covering CVA asset lookup index. Its
  final manifest join uses individual asset and version identities and retains
  the unchanged view filters.
- It still includes a sequential CVA variant scan and an unindexed
  `catalog.assets.printing_id` scan. At this observation, estimated rows were
  76,657 CVA rows (12 MB heap) and 60,281 asset rows (214 MB heap, 433 MB including
  indexes/TOAST). These are storage/plan diagnostics, not image-gap counts.
- `EXPLAIN (ANALYZE, BUFFERS)` of the complete candidate was cancelled by its
  five-second statement deadline. A separately isolated SELECT of asset IDs
  for the same six printing IDs also exceeded a two-second deadline. Neither
  timeout returned an execution time or actual row count; do not report either
  as a completed benchmark.
- The existing `api.asset_manifest` view was confirmed to have
  `security_invoker=true`. No view, index, function, table statistic, catalogue
  row, storage object or ownership record was changed.

The first index rehearsal should test a covering asset-printing lookup, such
as `(printing_id) INCLUDE (id)` with a non-null-printing predicate, against this
unchanged candidate. A narrower card-image partial index requires the matching
asset-type predicate in the candidate as well as an equivalence check. Do not
remove the printing branch to obtain a faster result. Rehearse any additional
CVA indexes only if the next actual plan proves they are needed.

This work does **not** clear the release gate: no complete current/candidate
production multiset comparison finished, no Chinese candidate timing was
established, and no production repair was applied. The release pause remains
in force. The next owner-authorized database rehearsal must establish full
row/DTO equivalence and end-to-end page latency before backend activation.

### Non-vacuous identity regression proof

`docs/sql/asset-manifest-card-image-equivalence-fixture.sql` contains only local
`VALUES` CTEs: versions, assets, version-asset links and variant identities. It
does not reference application tables. The fixture mirrors the current view's
coalesced identities and eligibility rules, then compares complete projected
rows in both directions using `EXCEPT ALL`. A required eight-row reference
population prevents two empty results from passing. URL, attribution, MIME,
permission/rights/retention/storage and effective identities are compared.

The fixture was executed read-only on PostgreSQL 17 on 5 September: `passed`
was true, expected and actual counts were eight, and missing/unexpected arrays
were empty. Four additional fixture-only mutations disabled each candidate
branch independently. All four correctly failed: removing CVA variant, CVA
printing, asset variant and asset printing branches left respectively six,
seven, five and seven of the expected eight rows. No real catalogue table was
read by those fixture executions, and no database object was created.

`npm run test:asset-manifest-query-equivalence` runs the offline JS model,
including negative branch-removal and missing-inheritance tests. It explicitly
does not claim to run PostgreSQL. `--sql` on its underlying script emits the
self-contained SQL for a separately authorized database test. These fixtures
prove the tested semantic cases, not live four-language coverage, RLS policy
behavior, production query equivalence, or image delivery performance.
