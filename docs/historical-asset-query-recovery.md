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
