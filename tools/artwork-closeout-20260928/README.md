# Artwork recovery, 28 September 2026

This is a read-only acquisition and offline preparation workstream. It does not
publish images, change rights records, alter canonical identities or certify foil
finishes. The initial live baseline is 12,161 missing printings in 225 sets,
including explicit same-artwork resolution. The final live count is unchanged.

## Result

- 1,709 Japanese originals: pinned metadata plus exact live official-page name,
  set, number, denominator, image URL, image MIME, full decode and SHA-256 checks.
- 424 English originals: exact pinned provider set, number and name, image MIME,
  full decode and SHA-256 checks. Three use the source's small rendition after a
  large-image 404. Fifty targets failed both available rendition requests.
- 6,399 display derivatives: 240px grid, 96px search, up to 720px detail. No
  enlargement. Sharp 0.35.4 and the exact pipeline specification hash are recorded.
- 116 earlier TW originals and 348 derivatives reverified; 365 earlier TW
  previews and exact current identities reverified. The 365 full originals remain
  in existing GitHub artifacts, not in this local workstream.
- 53 TCGdex references fetched and decoded without retaining image bytes.
  Six overlap acquired English images; the complete ledger counts 47 separately.

The approved production source for Japanese official images was rechecked as
`578df62a-7912-488c-b75c-bec7e158e882`, active and approved with the owner's rights
confirmation. English's source remains `under_review` for this new cohort.
Official Taiwan's new acquisition population remains review-required. No source
permission flag was changed, and no earlier narrow approval was extended.

## Repeat local preparation

Use a workspace containing the saved baseline JSON files and exact source
checkouts. The PTCG metadata pin is
`90e28f12dde837353c3f4d231edfe236cfe9ba80`; English metadata was inspected at
`39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11`.

1. `match_snapshots.py --workspace <workspace>` regenerates metadata candidates.
2. `acquire.py --input <snapshot-matches.json> --output <directory> --language ja|en`
   uses exact host checks, bounded requests and verified successful cache entries.
3. `prepare-local.mjs <acquired-directory> <prepared-directory>` verifies local
   originals and creates all three standard display sizes without network access.
4. `compose-ledger.py --workspace <workspace> --output <evidence-directory>`
   reconciles every baseline printing exactly once.
5. `package-files.py --workspace <workspace> --output <output-directory>` saves
   hash-verified originals and derivatives in bounded ZIPs.

The Python acquisition path requires Pillow and aiohttp. Offline preparation uses
Sharp from the Codex primary runtime. No dependency or upstream code is executed
from the metadata repositories. Eight targeted identity tests pass, including
wrong-set, wrong-number, wrong-image, cross-host, prism-symbol and unreviewed
qualifier rejection.

## Existing TW originals

The new workflow only retrieves artifacts `10917120115` and `10916269076`, verifies
their frozen archive hashes, prepares the 365 exact saved originals offline and
retains a result artifact. Its token has only `contents: read` and `actions: read`.
It uses no production environment, service credentials or database client.
It is prepared locally, not pushed or run. The full-original archive exceeded
the connector's 512 MiB download ceiling; that ceiling was not bypassed.

The already-existing protected read-only TW preflight is still waiting:
https://github.com/tberridge86/Stackr/actions/runs/36270453935

## Delivery blocker and next release work

Automatic approval review rejected pushing this new branch to
`tberridge86/Stackr`: it did not find explicit authorization for disclosing the
generated files and changing that remote branch. The remote and connected push
permissions were subsequently verified, but the rejected write was not retried
through another tool. The branch remains local. No PR was created or merged.

After that write is explicitly approved, push this branch, run the offline saved
TW preparation, and continue through the existing catalogue release owner and
protected production workflow. The newly acquired cohort still needs a bounded
publication implementation and staging rehearsal. These prepared files are not
an executed import or a deployment-ready assertion.

Bind exact current printing IDs and published version IDs again at execution.
Preserve all variant/finish and ownership records. Publish printing fronts only,
add asset/version memberships atomically, refuse conflicting existing artwork,
and record created asset/link IDs for narrowly scoped rollback. Reuse the
existing protected release lane; do not introduce a second production deployment
system. Then measure API delivery and decoded files for the actual inserted
cohort. Installed-app rendering still needs separate device evidence.

The downloadable worklist keeps the 4,276 missing-source/download cases, 660
identity/artwork reviews, 4,564 acquisition-gated TW pointers, 47 working
references, 365 archived originals and 2,249 prepared files separate. Their sum
is the same 12,161-printing baseline. No item was removed to improve coverage.
