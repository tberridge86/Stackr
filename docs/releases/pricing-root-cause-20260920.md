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

At source review, the new migration and worker changes are not yet deployed. Record the merged SHA, CI, protected rehearsal/apply receipts, worker deployments, actual bounded refresh outcomes and production readback in the PR before calling the repair delivered. Keep prepared app reads off until real output/coverage is reconciled; resume preparation only after the database repair passes.

Older save paths defaulted some records to `normal` without recording a physical finish choice. Exact holo-only matches cannot safely repair those records by assumption. Physical finish confirmation, unsupported provider scope, complete useful price coverage and signed-in app/device acceptance remain separate. Artwork and camera acceptance are unaffected and outstanding. No last-sold evidence or fresh price is inferred from a successful job.

Rollback: keep prepared app reads disabled and disable preparation if the canary fails; preserve existing stored prices and saved holdings. Revert worker source through the normal release path if needed. The optimized function preserves the old contract; reverting it would restore the measured timeout risk and should not be the first operational response.
