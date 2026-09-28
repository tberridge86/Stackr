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
- 116 earlier TW originals and 348 derivatives reverified. A further 365 earlier
  TW originals were recovered, checked against their frozen exact current
  identities, and prepared into 1,095 display derivatives. All were fully decoded
  and SHA-256 checked again after downloading the workflow output.
- Total saved preparation: 2,614 original card fronts and 7,842 derivatives.
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
The owner approved publishing this work on 28 September 2026. Branch
`agent/catalogue/artwork-closeout-20260928` was published at
`503bd440847e9218a2cf177563336419cff3b2de`, with an exact tree match to the saved
local work, and draft PR #247 was opened. The first preparation run is
https://github.com/tberridge86/Stackr/actions/runs/36405253060.

The workflow also preserves all 365 checksum-verified originals in two bounded
90-day artifacts, so the existing source archives' expiry does not discard the
recovered work. Preservation copies only the previously verified source bytes.

Run [36405653464](https://github.com/tberridge86/Stackr/actions/runs/36405653464)
completed successfully at source `92a6fc63cda4b7611d06b55c0436407b80594ccb`.
Its 365 originals, 1,095 derivatives and two original archive parts were downloaded
and independently checked. The original parts contain 247 and 118 cards.
All three archives matched GitHub's reported SHA-256 digests. Their 90-day GitHub
retention ends on 27 December 2026; separate durable recovery copies were saved.

The seven standard Platform CI jobs passed in
[run 36405657481](https://github.com/tberridge86/Stackr/actions/runs/36405657481).
The release-candidate gate and local Supabase reset step were skipped.
Owner Pricing Identity Tests also passed in run 36405657696. These checks do not
establish production or device delivery. A read-only production recheck still
returned 12,161 missing printings with unchanged per-language counts.

The already-existing protected read-only TW preflight is still waiting:
https://github.com/tberridge86/Stackr/actions/runs/36270453935

## Delivery blocker and next release work

An earlier automatic approval review rejected the branch write for missing
explicit authorization. The owner's reply, "I do approve this", resolved that
blocker. The approved content is now published through the connected GitHub
account. The separate protected production environment review remains in place.

Offline saved TW preparation is complete. Continue the existing catalogue release
owner's protected workflow. The newly acquired cohort still needs a bounded
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
references and 2,614 prepared files separate. No originals remain archive-only. Their sum
is the same 12,161-printing baseline. No item was removed to improve coverage.

`compose-ledger.py` reconstructs the initial acquisition-stage ledger. The saved
recovery evidence adds the 365-card preparation receipt and updates those rows
from `Originals archived` to `Files prepared`, preserving every printing ID and
the manual notes. Do not describe the initial generator's archived state as the
current saved recovery state.
