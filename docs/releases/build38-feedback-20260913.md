# Build 38 feedback repair — 13 September 2026

Prepared for the existing owner TestFlight audience. Release status: candidate; deployment and device acceptance are not yet established by this source receipt.

## Changes

- Repair legacy binder pricing reads: saved provider-era IDs resolve through the published set/language/printing identity to one normal canonical variant. Existing canonical snapshots become visible without a refresh or database rewrite. Ambiguous identities and capped query results fail closed. Retain old snapshots for unresolved legacy references.
- Resolve 280 approved, already-published English/Japanese logos immediately by exact identity, without waiting for global optional artwork. The known Mega Evolution Energy expansion may reuse its parent Mega Evolution logo for presentation only.
- Bundle the six previously prepared Traditional Chinese identification marks. The source, exact file hashes and owner's selection are recorded separately. Add approved existing pack-art cover fallbacks for 43 exact Simplified Chinese sets; these remain cover artwork, not replacement logos.
- Preserve the floating card haptics/foil and remove the added white backing/outline. Clip to one rounded card silhouette. Add a subtle Minty idle animation respecting Reduce Motion; restore the calm startup animation for a minimum 480 ms while account loading runs concurrently.
- Correct Discover Sets safe-area spacing/purple branding, use Market consistently, and remove the default browse listing count.

## Evidence and limits

Live read-only evidence found the owner refresh already persisted 30 TCGdex canonical snapshots on 13 September, while legacy binders still requested old IDs. The repair exposes saved source-timestamped estimates; it does not make all prices fresh or establish full provider coverage. No provider refresh or database write was performed by this task.

The live M5/Abyss Eye API returned 118 distinct cards with image delivery URLs across both pages. Facts and image identities match. This establishes available API artwork, not successful rendering on the user's phone. The existing facts-first, progressive artwork path remains intact; no global asset request was added to the initial set load.

All 48 HTTP image probes passed (43 Simplified Chinese covers and five representative English/Japanese logos). The logo population is 141 English and 139 Japanese approved entries. All six bundled Traditional Chinese image hashes pass. These scoped populations do not establish universal historical set coverage or complete English translations.

TypeScript and lint passed (12 existing lint warnings). Narrow pricing, identity/collision/cap, production smoke, binder catalogue, startup, haptics, and logo integration checks passed. The ordinary official English logo test required the installed bundled Python runtime on this Windows host.

## Delivery plan

Release the reviewed backend first using the existing owner TestFlight backend workflow, then deliver the compatible owner iOS update/native build. Runtime `1.0.3-owner-recognition-v1`, channel `owner-recognition`, app `com.tommo86.Stackr`. Record the exact reviewed SHA, checks, deployment, update/build IDs and external **Stackr Beta Testers** assignment in the delivery receipt.

Cloudflare was verified at 100% on version `7d724981-b3f1-4ab6-9769-87cf6783e12e`, tag `gateway-privacy-297f1d878f93253f1d1862e751fcde212b1c3fbe`. This change requires no Worker update, database migration, catalogue mutation or permission expansion. Native device cropping, motion, signed-in collection values and cold/warm binder timings require device acceptance; server health alone must not be reported as that proof.
