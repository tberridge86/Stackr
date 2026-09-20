# Pricing timeout and saved-identity repair — 20 September 2026

This repair starts from released source `d5965bb5a824f49aa8a75cd2c70316b47b09b8ef`. It addresses measured server failures; it does not change the native build or rewrite saved holdings.

## Demonstrated causes

- Production `api.published_price_catalogue_revision()` scanned the full published-card view. A read-only execution plan took **8,136.282 ms**, exceeding the API role's **8-second statement timeout**. The equivalent version-metadata query took **34.553 ms**, with identical revision output, 85 shared blocks and no temporary blocks. These are individual database measurements, not end-to-end app timings.
- Prepared custom-binder valuation fetched stored prices for every catalogue member despite using only owned identities. It now reads resolved owned identities plus language-scoped official-set members needed for standard/master totals. The regression fixture requests 1 identity for a custom binder and 241 for an official binder, preserving the owned subtotal.
- The pricing resolver lacked catalogue's verified English SV/SWSH aliases. Identical replay of the private 366-unit saved cohort resolves **169 units before, 177 after**. The eight newly resolvable copies represent three distinct normal-print variants. Read-only production checks found no exact stored snapshots or canonical estimates for those three at diagnosis time; matching is not proof of a price.

## Change and safeguards

Migration `20260920130134_optimise_published_price_catalogue_revision.sql` replaces only the expensive revision function. A one-time preflight refuses language-membership drift or changed output. Service-role-only access, security-invoker semantics and an empty search path remain intact. Existing protected preparation supports a hash-pinned `pricing-repair` scope with physical/logical backup checks and a transactional rehearsal that verifies exact function restoration and unchanged migration ledger.

The ordinary owner worker obtains language context only when a potentially eligible legacy SV/SWSH alias needs it. It preserves the 1,001-row overflow sentinel, reads one exact-owner snapshot, and copies only unanimously evidenced language onto the existing bounded ownership rows. It adds no holdings, assumes no English default, and refuses conflicting prefixes, other languages, grades, conditions and substituted finishes. Prepared valuation reports safe phase timings/error codes and retains the previous published generation on failure.

## Validation before delivery

- Typecheck passed; lint passed with 12 existing warnings and no errors.
- Catalogue pricing, optimized revision equivalence/permissions/preflight, stable-price state and prepared-route authorization tests passed.
- Owner scoped worker (4 cases), saved references (27 cases), owner refresh and preparation/rollback tests passed.
- Independent review found no blocker in SQL preparation or the active worker's language/finish/owner isolation.

## Delivery and remaining acceptance

PR [#214](https://github.com/tberridge86/Stackr/pull/214) merged as `0ac3c79b668535a7fa982c8a248299dc75208581`. All eight applicable PR checks and merged-main Platform CI [35513020843](https://github.com/tberridge86/Stackr/actions/runs/35513020843) passed. The wider release-candidate gate was skipped by its existing invocation condition.

Production backup-first rehearsal [35513031305](https://github.com/tberridge86/Stackr/actions/runs/35513031305) restored the original function and unchanged 146-entry ledger. Backup-first apply [35513275777](https://github.com/tberridge86/Stackr/actions/runs/35513275777) applied only the pinned repair migration, producing 147 ledger entries. The deployed function completed in **13.215 ms** in a read-only service-role execution plan under the 8-second statement budget.

Exact-source Railway automatic worker `38723681-e8bc-42a0-b84d-6cad9fc15dad` and queue worker `4e28e591-ef89-4dba-aa2c-aee21efa0ef1` deployed successfully. The queue ran cleanly before preparation was resumed. Preparation resume deployment `3ef3f2c1-98a5-479a-b679-a4dec11de526` published complete generations at 13:36:20 and 13:40:49 UTC in **44,944 ms** and **39,595 ms**, with 163 owned price identities and 2,987 stored-price identities including official set totals. Neither run timed out or failed; the slowest stored-price reads took 4,235 ms and 3,989 ms. Both production readbacks confirmed **111/366 priced copies**, previously 103/366, and the same GBP 8.94 priced subtotal. Prepared app reads remain OFF pending coverage reconciliation and signed-in acceptance.

Owner dry run [35513033176](https://github.com/tberridge86/Stackr/actions/runs/35513033176) selected the three newly mapped normal variants. Bounded refresh [35513304106](https://github.com/tberridge86/Stackr/actions/runs/35513304106) selected seven, persisted all three newly matched variants and reported four unavailable provider identities, zero failures. Production storage and the service-role stored-price RPC both returned GBP 0.24, 0.09 and 0.06 for the three exact variants, covering eight copies. Their provider timestamp is 19 September 22:54:55 UTC, so these are older market estimates. Signed-in app/device readback is not established by those database checks.

The other four selected variants were English PBL collectors 85, 88, 95 and 117 with no approved TCGdex mapping. No catalogue records were changed or substitute providers selected.

## Explicit finish refresh follow-up

The ordinary owner worker rejected all saved non-normal finishes before reaching a provider service that already supports exact English holo and reverse-holo TCGplayer fields. The frozen 309-row ownership scan contains 102 such rows: 45 with Japanese context and 57 unscoped ME4 references. The existing verified English ME rule, constrained by each card's single coherent published English printing alias, exact set/collector, exact saved finish and unique physical variant, resolves **55** of those 57: 11 holo and 44 reverse-holo. The two missing physical identities remain unavailable; the 45 Japanese rows remain outside this provider's supported finish scope.

The worker repair accepts direct English canonical finish identities and this printing-bound ME case. It distinguishes absent binder context from conflicting or missing-language matched binders, applies explicit language prefixes before eligibility, and refuses foreign/conflicting aliases or a different finish. Generic unscoped non-ME references and printing-only substitutions remain excluded. Stored prepared valuation semantics stay unchanged. No saved holdings, catalogue rows, provider flags or paid sources change.

Six bounded production samples had approved matching TCGdex aliases. All 55 candidate identities had **zero** exact TCGdex snapshots before this follow-up. These are identity and baseline measurements, not quote availability; record the deployed bounded refresh and actual stored readback before reporting coverage gain.

Older save paths defaulted some records to `normal` without recording a physical finish choice. Exact holo-only matches cannot safely repair those records by assumption. Physical finish confirmation, unsupported provider scope, complete useful price coverage and signed-in app/device acceptance remain separate. Artwork and camera acceptance are unaffected and outstanding. No last-sold evidence or fresh price is inferred from a successful job.

Rollback: keep prepared app reads disabled and disable preparation if the canary fails; preserve existing stored prices and saved holdings. Revert worker source through the normal release path if needed. The optimized function preserves the old contract; reverting it would restore the measured timeout risk and should not be the first operational response.

## General card estimates requested on 20 September

The owner clarified that ordinary collection pricing should use general card estimates without requiring a finish choice for each saved copy. This supersedes the earlier exact-only display policy; saved holdings and their physical finish remain unchanged.

The new client requests `estimateMode=general`. A usable exact quote remains first choice. When it is absent, a general estimate may use the same published printing, set and language's unique normal base, or unique holo base when no normal base exists. The response and UI explicitly identify general estimates. Grades, unsupported conditions, ambiguous identities and missing provider prices remain unavailable. General values never become sold evidence or exact-finish history.

Prepared valuation publishes a separate, complete `summary.general` with exclusive exact/general copy counts and reconciled binder totals. The existing outer summary remains exact for build 46 compatibility. The new client validates the general summary before using it and does not draw an exact-only trend for a mixed estimate total. The gateway accepts only the two documented estimate modes and retains private owner access.

Bounded owner refresh can opt into proven general base identities through `general_estimates`; it continues to store an exact provider quote under the real base variant. It does not rewrite holdings or copy a quote into a different variant. Existing full-catalogue and extra-capacity flags remain off. No database migration is required for this additive contract.

Delivery evidence will be recorded in the release receipt and implementation PR after exact-source checks, backend/gateway deployment and the next standard iOS build. Source tests do not establish phone acceptance or complete price coverage. Missing artwork and physical camera acceptance remain separate outstanding work.
