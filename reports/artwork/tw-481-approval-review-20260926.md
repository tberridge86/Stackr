# TW SV4a / SV2a artwork — approval review

Review date: 26 September 2026
Decision: NOT CLEARED FOR COMBINED PRODUCTION IMPORT
Scope: 481 unique Traditional Chinese printing fronts (294 SV4a; 187 SV2a).

## Package reconciliation

The 116 prepared TCGdex fronts and the 365 official Taiwan source-verified fronts were reconciled by language, set code and collector number. There are 481 distinct target keys and no overlap between the two batches. This is manifest reconciliation, not a new image-byte or exact-foil certification.

- TCGdex package: 116 prepared originals and 348 derivatives; PREPARED_NOT_UPLOADED.
- Official Taiwan package: 365 source-verified fronts, with review previews and provenance. Full originals remain in the recorded original artifacts; previews are not production renditions. Source permission remains REVIEW_REQUIRED.
- The package manifests remain unchanged. No approval is implied by successful discovery or decoding.

## Source-use review

### TCGdex — 116 fronts

The current `ingest.sources` record `tcgdex` is active, not deprecated and marked approved. It is unchanged. Its recorded terms point to the MIT licence for the TCGdex software/database. That licence is not treated in this review as a separate grant of rights in third-party Pokemon card artwork. The source record also says automated refresh is disabled pending provider-terms review; no scheduled refresh is being authorised.

Terms reference: https://github.com/tcgdex/cards-database/blob/master/LICENSE

### Official Taiwan — 365 fronts

HOLD_PENDING_SEPARATE_AUTHORISATION.

The official Taiwan site's Terms of Use, Article 7, restrict copying, modification, publication, transmission, distribution and use of its content outside the service. Article 11 also addresses commercial use. No separate grant covering Stackr's hosting, resizing and commercial display was evidenced in the reviewed materials. This is an operational release-readiness assessment, not a legal determination about every possible use.

Terms reviewed: https://asia.pokemon-card.com/tw/policy/
Contact route: https://asia.pokemon-card.com/tw/contact/

Required evidence to clear this hold: a licence, rights-holder permission or documented legal clearance applicable to the intended use. Record issuer, scope, permission reference, commercial display, storage/CDN delivery, resizing/format conversion, duration and attribution. Do not publish private licensing documents into this public repository. Do not reuse the Japanese official source ID or relabel Taiwan assets as TCGdex to inherit an approval.

The current request authorises the review and controlled engineering work; it is not recorded as a statement that the rights-holder has granted permission. No new source approval or active Taiwan source entry has been created.

## GitHub production approval

Run: https://github.com/tberridge86/Stackr/actions/runs/36270453935
Workflow: TW artwork production import read-only preflight
Environment: production
Required reviewer reported by GitHub: tberridge86
Observed state: still waiting for review.

No approval was submitted. The available GitHub connector supports reading the pending deployment and repository changes, but exposes no deployment-review submission action. The environment protection was not removed, bypassed or weakened.

Required GitHub action: open the run, choose Review deployments, select production, then Approve and deploy. Despite the button wording, this specific workflow performs read-only access checks. It does not upload artwork, release an app, or grant source-image permission.

The existing preflight checks the TCGdex source only. A successful run must not be interpreted as permission for the 365 official Taiwan images. A combined importer still needs a separate Taiwan source-use gate and full-resolution preparation/verification.

## Independent read-only production check

Checked through the existing authorised database connector at 2026-09-26 22:08:07 UTC. This does not satisfy or replace GitHub's environment review.

| Set | Published printings | Published variants | Image-backed printings | Missing fronts |
| --- | ---: | ---: | ---: | ---: |
| SV4a | 314 | 407 | 20 | 294 |
| SV2a | 207 | 360 | 20 | 187 |
| Total | 521 | 767 | 40 | 481 |

These totals describe the current published cohort, not a fresh certification that the underlying set catalogues contain every real card.

## Change boundary

This commit is an audit document only on the existing artwork branch. No production source registry, assets, storage, prices, catalogue identities or protected Supreme Victors mappings were changed. No importer was executed and no main-branch merge or app release was performed.

Next executable steps after the two gates clear: a bounded rehearsal, exact identity and source-policy recheck, backed-up import using the existing asset pipeline, required derivatives, published manifest membership checks, and API/device delivery validation. Do not present the 481 recovered fronts as live repairs before those steps pass.
