# Exact L1b / LL crop supersession

Status: **published and verified**. Root committed the exact two-asset/two-membership supersession at 2026-11-01T21:16:56.997592Z. The configured public API returned exactly one approved replacement per set, each with all three verified renditions and no continuation cursor. No catalogue mutation was performed by the artwork specialist.

This batch closes the difference between two reviewed PR203 crops already committed on main and their older centrally published originals. Standing authorization for these exact supplied replacements applies. It creates no source-wide grant, card identity or independently audited vendor licence.

| Set | Exact set UUID | Previous immutable asset | Replacement asset |
| --- | --- | --- | --- |
| Japanese SoulSilver Collection (L1b) | `e8e16a23-fc7a-4ec8-abfe-b74448fa5f27` | `cabf15f1-addc-47e0-9aef-09e2f57bf476` | `49c872a8-aff6-455e-9042-dad770b2bd09` |
| Japanese Lost Link (LL) | `7dbeff79-cfb7-4ac8-8a4f-d7c73a523349` | `f7fc344c-9f7c-4298-af9d-1903b1bc8e5d` | `5bd25dc4-3c25-4822-ad4b-462387d1d08f` |

`batch.mjs` pins the new PNG SHA256 values, main Git blobs, dimensions, byte counts and historical crop coordinates. The retained supplied JPEG SHA256 is `078ae1be1255300fc818cf7d2a3d18dc44852e91f830f9f8b71244c7943fbfb3`. Existing committed PNGs are preserved unchanged. Historical extraction included cropping/resizing; these are not claimed to be untouched JPEG pixels or newly acquired HD originals.

`publication/object-manifest.json` records eight locally decoded objects: two PNG originals and six WebP renditions, 1,158,220 bytes total. Unchanged main pipeline files are retained under `pipeline/`; their Git blobs are recorded. The builder pins the entire canonical manifest digest, preventing coherent alteration of both a manifest and a matching verification claim.

`envelope.json` records exact Japanese identities, published version `1a23b7a7-c50e-4601-9180-a25c950d27ea`, manual source and no replacement candidates. `prior.json` contains the two complete effective memberships and two full immutable asset rows. The first read exceeded its five-second limit. `read-query-optimized.sql` materializes explicit logo links before joining active versions, retaining the original type-OR, inherited-set and overflow semantics; root successfully executed it. Independent local equivalence tests pass 19 cases and the 1,001-row cap.

`authority.json` binds current standing instructions to these identities, PNG hashes and the supplied JPEG hash. This clears the known operational approval hold without inventing licence or identity facts.

`actual-verified-objects.json` records all eight successful public GETs, downloaded-body SHA256/bytes, decoded dimensions, MIME and observed cache-control, verified at 20:55:19.553Z. Actual cache-control is `max-age=14400`; desired one-year immutable metadata was not observed. No fixture is used as live evidence.

Run from the repository root:

```powershell
node work/reconcile-20261101/jp-crop-supersession/test-publication.mjs
node work/reconcile-20261101/jp-crop-supersession/build-publication.mjs <actual-verification.json> work/reconcile-20261101/jp-crop-supersession/authority.json <new-frozen-directory>
node work/reconcile-20261101/jp-crop-supersession/test-publication.mjs <new-frozen-directory>
```

The builder has no remote effects. Generated SQL locks mutation and identity dependencies; rechecks complete original assets, exact identities and complete memberships; inserts two assets; then swaps exactly two memberships atomically. Membership comparisons include timestamps, normalized through native row types. Rollback requires unchanged new memberships and retained originals, deletes only the two new memberships, and restores the full original rows. All old/new asset rows and R2 objects remain intact.

Local validation: **40 cases pass against the frozen actual-input packet**, including coherent hash tampering, missing GETs, identity/rights errors, inherited extra links, version drift, asset drift, membership timestamp drift, exact rollback and second-insertion atomic failure. Independent review found the initial omission of membership timestamps; full-row guards and both timestamp regressions cover it. The reviewer independently rebuilt the actual plan/SQL and verified all bound input hashes.

`production-mutation-receipt.json` binds the committed mutation to publish SQL SHA256 `4f6667d128211982afafa5c35c155e0939481acb2b1be1f7ea2f438fd1e21188`. Guarded rollback SHA256 is `a010cfe11d8549f7981638089fe7217f824b6346f640ca468bebbe55222c929b`; old/new immutable asset rows and objects remain retained.

The exact API receipts are `api-l1b.json` (request `36b4d97c-a2a5-473e-9a59-fe936958f653`, 21:17:13.911Z) and `api-ll.json` (request `d97a732a-ad03-4716-8e71-89434df42259`, 21:17:26.264Z). The five-file client reconciliation is independently reviewed: two exact recorded original/detail mappings, 278 unchanged logo rows, 145 prior supersession receipts plus two new receipts, current API delivery preferred, and exact bundled aliases retained only for absence/error recovery. The conflicting UUID/name fallback regression is covered. Client release integration and physical-device appearance remain root's release acceptance; no device check is claimed here.
