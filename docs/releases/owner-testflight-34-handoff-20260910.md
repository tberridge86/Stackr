# Build 34 handoff to the five Stackr owners

Recorded 10 September 2026 for the owner's request to bring the existing agents
into the production bridge. Repository: `tberridge86/Stackr`. This receipt
publishes previously local desktop evidence; it is not a new deployment or a
fresh observation of every service. Evidence dates and limitations remain below.

**Acknowledgement only for this handoff; desktop owns ongoing bridge
coordination; no duplicate repairs.** Existing task scopes and schedules remain
in effect. Reconcile the matching workstream before taking its next action.

## Delivered artifact and separate candidate

| Layer | Verified release evidence | Boundary |
| --- | --- | --- |
| Reviewed client | [PR #167](https://github.com/tberridge86/Stackr/pull/167), reviewed head `3c5ae985dd340d73a9ab3b8eeb1a932de900a966`, merge `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e`; identical trees | This is build 34's source, not every service's revision. |
| CI | [Run 34445205132](https://github.com/tberridge86/Stackr/actions/runs/34445205132): seven standard jobs passed | `release-candidate-gate` skipped; not a full-platform approval. |
| Native | 1.0.3 (34), EAS `12b4d3c0-ff53-44f4-b1cb-ad698e3cdb77`; signed IPA SHA-256 `956f334966aa4b7a3969c0f29d4d79ab3bfebae677b064431dcca0a25c1a1ffc` | Native/package checks do not prove a phone installed it. |
| Delivery | Apple `14226732-fa9d-4e58-baf6-6191e0d272e9`: VALID, beta review APPROVED, IN_BETA_TESTING, attached to Stackr Beta Testers | Previously identified iPhone 15 Pro tester is a member; installation remains unconfirmed. |
| Submission | `8e726e6c-af0d-4c70-a732-78ed7562843b`, finished `2026-09-10T07:01:36.255Z` | Apple status receipt was read back on 10 September; it lacks an exact observation timestamp. |
| Updates | Profile `production-owner`, channel `owner-recognition`, runtime `1.0.3-owner-recognition-v1`, embedded update `c9f3c6b9-90e0-486f-8440-7538cef197b5`, commit time `1789023260310` | No separate OTA was published. The installed/received update remains unconfirmed. |
| Later work | [PR #168](https://github.com/tberridge86/Stackr/pull/168), draft/open head `9fdbeb06d6b2fe117bf345ae6a6407cebb71553e`, checked 10 September | Search/image continuity, recovered migrations and UI changes in this candidate are not in build 34. |
| Owner setup | [PR #169](https://github.com/tberridge86/Stackr/pull/169), main `31a3ffc5ee04b5bf80733efc4945ea944ae1e9c3` at handoff preparation | Documentation only; does not justify a native/backend rebuild. |

The [machine-readable receipt](owner-testflight-34-evidence-20260910.json)
contains Apple status, IPA inspection, submission, CI and scheduled price-run
results, with original file hashes and evidence provenance. The Apple group
entry is reduced to delivery-relevant fields; its original remains local.
Credentials, capture content, tester identifiers and private task-management
identifiers are excluded from this public repository handoff.

Build 34 includes the light palette, startup/recovery states, mounted native
haptics, best-available enlarged artwork, private scanner/teaching flow, Home
valuation/manual refresh, profile and marketplace browsing. The package contains
all 81 expected magazine cover files with matching bytes. Binder confirmation
and save recovery were validated against the actual handlers. None establishes
physical haptics, visual acceptance, real camera accuracy or signed-in iPhone
loading speed. Selling, checkout and experimental on-device recognition remain
disabled.

## Production data map baseline

This table condenses the desktop's 9 September reconciliation and 10 September
release receipts. Recheck live state before changing a dependent component.

| Data | Authoritative physical source and production read path | App consumers and publication boundary |
| --- | --- | --- |
| Sets/cards/languages/finishes | Production Supabase `oakdbbzdqwurpjnoqhmu`: `catalog` records and published `catalogue_versions`; `api.catalogue_sets`, `api.catalogue_cards`, names and external identifiers through Railway `/v1` and Cloudflare | Search, sets, details, binders, correction pickers. Published, non-deprecated membership and exact identifiers; names alone are insufficient. |
| English descriptions | Approved display fields and aliases in the published snapshot | Surrounding text where verified; preserve native artwork and exact language/printing/finish. Missing translations stay explicit. |
| Artwork/logos/symbols | `catalog.assets`, immutable Supabase Storage `stackr-catalogue-public`, `api.asset_manifest`, Railway asset delivery | Browse, cards, binders, previews. Approved, active, public and linked to exact published identity. External Japanese references remain a separate source class. Cloudflare is the gateway; no R2 binding was observed. |
| Comic/magazine covers | Expo bundled assets; 81 existing-identity magazine covers byte-verified in build 34 | Relevant cover surfaces. Not 81 newly created catalogue products or evidence of all comic coverage. |
| Accounts/collections/binders | Supabase Auth, `profiles`, `user_card_variants`, `binders`, `binder_cards`; authenticated API and retained direct authenticated collection paths | Account, collection, binder, Home. Owner scope and session isolation preserved; direct legacy paths are not staging. |
| Prices/history | Canonical estimates and `market_price_snapshots`; Railway market-pricing service, exact identity routes and owner queue | Details, Home/collection valuation. Preserve language, finish, condition, currency, source and provider time; estimates are not completed sales. |
| Recognition/teaching | Private capture/feedback records and storage plus private reference gallery; protected recognition/feedback routes | Scan, review and correction choices, private capture persistence. Review/export/evaluation precedes any training; saving does not retrain automatically. |
| Insights | Home valuation/cache and labelled snapshot-trend fallback | Home. `minty-insight` is not deployed; legacy identity/source issues remain. |

Public gateway: `https://api.stackrtcg.com`, version
`70fa3447-3213-49f1-ba73-cf374dd6be36`. Backend:
`https://pocketvault-production.up.railway.app`, Railway project
`d205637b-5376-41aa-9169-1015ba88fec3`, production environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`, deployment
`2e2ca7d9-e3d8-41cb-b2c1-7e57a79dc1af`, source
`178a37fe05e8b9999f3d7b71c7276ba58878a287`. Staging Supabase
`lmwfhvexfcoyeuoyrlco` is for comparison/rehearsal and is not the phone's source.
The IPA inspection independently confirms the production URLs. This receipt
does not contain a complete live migration ledger; Backend owns that next check.

## Coverage and measured limits

The [per-set CSV](catalogue-current-public-coverage-20260909.csv)
is a 9 September snapshot of 696 published canonical sets. Its publication and
linkage counts are not pixel-quality or device-rendering measurements.

| Language | Published sets | Variants with linked public artwork / published variants |
| --- | ---: | ---: |
| English | 217 | 21,793 / 33,168 |
| Japanese | 163 | 7,919 / 13,771 |
| Simplified Chinese | 136 | 19,431 / 20,408 |
| Traditional Chinese | 83 | 2,146 / 8,166 |
| Korean | 97 | 0 / 239 |

- Abyss Eye: 70/118 variants illustrated. Retain exact language/finish gaps.
- 47,737 Supabase-backed manifest references had physical objects; 4,037 external
  Japanese routes passed bounded HTTP-header checks including retries. Neither
  count proves decoded pixels, native language, resolution or correct identity.
- Perfect Order's boxed logo came from losing transparency in JPEG conversion.
  The bounded repair restored 138 approved English logos to transparent WebP;
  three historical provider 404s retained their old approved JPEGs.
- 750 Chinese candidates remain held without positive printed-language proof.
- Historical cached public API samples: 45–304 ms; some cold calls reached
  7.18 seconds. No device-wide sub-500 ms or fresh p95 claim is supported.
- The existing six-hour worker's 10 September run refreshed 30 exact estimates
  with zero failures, from 84 eligible candidates. It selects the first 30 from
  the newest 300 owner rows and does not yet rotate all eligible cards. The
  five-minute manual queue is a distinct worker. Neither schedule proves whole
  collection coverage. Supported normal/raw Near Mint GBP estimates use fixed
  currency factors; unsupported identities and completed-sale coverage remain
  explicit gaps.

## Existing owners and the next coordinated work

The source task, **Configure Stackr agents**, reported all five persistent tasks
enabled on 10 September. Its five session agents acknowledged this baseline;
that acknowledgement does not invoke or modify the persistent tasks. Task
management identifiers are not cross-thread message addresses. Daily times are flexible
within an hour; no next-run timestamps were returned.

| Existing task | Existing trigger | Focused next handoff |
| --- | --- | --- |
| Stackr Release Owner | Repository PR opened, ready-for-review or closed | Reconcile this artifact with PR #168 and its dependencies; collect installed-device acceptance. Do not dispatch the older frozen iOS source unchanged. |
| Stackr Pricing Owner | Daily around 08:00 Europe/London, from 11 September | Freeze a dated owned-identity cohort; trace supported, missing and unsupported controls from worker to snapshot, authenticated API and app. Diagnose the largest loss before expanding work. |
| Stackr Performance Owner | Daily around 10:00 Europe/London, from 11 September | Reuse PR #168; measure expected IDs/images, request amplification and cold/warm useful-result timing. HTTP 200 alone is not a pass. |
| Stackr Backend Owner | Daily around 12:00 Europe/London, from 11 September | Reconcile production/staging ledgers and file hashes for the five recovered migrations in PR #168; identify rehearsal needs without replaying or editing applied migrations. |
| Stackr Catalogue Owner | Daily around 14:00 Europe/London, from 11 September | Update language-specific coverage and trace PR #168 Japanese continuity through identity, asset, API and file delivery. Share a ten-case EN/JA/zh-cn/zh-tw cohort; keep actual KO support separate. |

Opening this documentation PR supplies the existing Release event trigger. The
four scheduled owners discover the linked receipt through `docs/agents/README.md`
on their existing runs. No schedules, prompts, workers or paused reports are
changed by this handoff. The release coordinator chooses one implementation
owner for overlapping issues; the others supply independent acceptance evidence.

## Device acceptance still pending

Record installed version/build and received update first. Then verify launch,
sign-in, Home/profile, multilingual search and imagery, enlarged previews, tab
and card/long-hold haptics, real camera capture/correction/private persistence,
immediate two-pocket confirmation/save, price states/manual refresh and
marketplace browsing. Capture timings separately for cold and cached signed-in
flows. Do not close these checks based on build availability or package markers.
