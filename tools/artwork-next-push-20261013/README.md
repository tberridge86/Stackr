# Ten English fronts for the next artwork push

This bounded publisher adds the queued Oddish, Gardevoir ex and eight Mega
Evolution Basic Energy fronts using the existing immutable storage and
transaction publisher. It accepts only the frozen ten originals and thirty WebP
display files in release asset `637933079`. Newly gathered cards need a separate
frozen cohort; they cannot be added to this run.

The owner authorised internet sourcing, queueing and production delivery, and
removed extra human batch reviews. `approval.json` records that exact business
decision. It does not claim an independently issued vendor licence. Per-asset
approved delivery is tied to this exact decision in `licensing_review_notes`;
source licence status stays `under_review`, Pokémon TCG API activity stays true,
and Scrydex activity stays false. The absent staging Scrydex provenance fixture
exists only inside a transaction that rolls back. No source-wide activation or
provider requests occur during publication.

Canonical names, numbers, variants, physical finishes and prices are unchanged.
Gardevoir remains `cel25cc/CC014/Gardevoir ex`; the sourced front's printed
`93/101`, Delta Species title, Celebrations badge and product `250331` evidence
remain explicit in the frozen plan. Oddish stays at its actual 597×834 source
resolution. Energy fronts stay at 727×1018. Display derivatives never upscale;
no physical finish or capture evidence is asserted.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| `plan.json` | `0a0417e1afbfb0176ef8ac55b184247efd3b255711e2f3e2497cd22a15313b6a` |
| `approval.json` | `f3cbadd0500e69947534216038818e460af8001147a1f37b30505b3c7421c042` |
| Release ZIP, 5,828,179 bytes | `de494b5c6a98b462db09738034df10c7deef226f552283354008dd9cf1056fd7` |

The release asset belongs to `tberridge86/Stackr`, tag
`artwork-residual-recovery-20260930`, and contains exactly forty image files and
three acquisition/preparation metadata files. The archive downloader validates
its fixed size, digest, member list, per-image hashes and safe extraction paths.
`verify-packages.mjs` fully decodes all forty files without opening a database.

## Commands

Run from the repository root. Offline verification accepts an existing ZIP:

```powershell
python tools/artwork-next-push-20261013/download-package.py <packages> --archive <frozen.zip>
node tools/artwork-next-push-20261013/verify-packages.mjs <packages>
node --test tools/artwork-next-push-20261013/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-next-push-20261013/download-package.test.py
```

The coordinated, protected GitHub artwork workflow supplies production secrets,
`GITHUB_ACTIONS=true`, `GITHUB_EVENT_NAME=workflow_dispatch`, the exact protected
main revision in `STACKR_EXPECTED_MAIN_SHA`, the fixed confirmation
`STACKR_ARTWORK_NEXT_PUSH_CONFIRMATION=PUBLISH ARTWORK NEXT PUSH`,
`STACKR_ARTWORK_NEXT_PUSH_PACKAGES`, and `STACKR_ARTWORK_NEXT_PUSH_OUTPUT`:

```sh
python tools/artwork-next-push-20261013/download-package.py "$STACKR_ARTWORK_NEXT_PUSH_PACKAGES"
node tools/artwork-next-push-20261013/publish.mjs --execute
```

`SUPABASE_STAGING_DB_URL` must identify `lmwfhvexfcoyeuoyrlco`;
`SUPABASE_DB_URL` must identify `oakdbbzdqwurpjnoqhmu`. The existing verified
Postgres transport keeps its pinned CA and strict TLS checks. Storage uses the
existing production server key resolver. Credentials never enter the plan or
receipts.

## Preservation, completion and rollback

The guard validates all eighteen current API card bindings, including native
names, collector numbers, variant UUIDs, finish codes and published catalogue
version. In the same serializable transaction it locks and snapshots the ten
printings, eighteen variants, thirty-six name rows, three sets, their assets and
links (including the existing set logos), and both relevant source policies.
It aborts before commit if any existing scoped row changes, disappears, or any
unexpected metadata is added. Only the journalled card assets/links may be new;
an identical rerun creates no new assets or links. Both staging and production
rehearsals roll back before immutable production transfers. Transfers share a
two-operation limit, 700 ms pacing and bounded transient retry.

Public `receipt.json` contains preservation hashes/counts, exact created UUIDs,
storage hashes, byte-verification results and separate rehearsal/publication
states. Set `STACKR_ARTWORK_NEXT_PUSH_PRIVATE_OUTPUT` outside the public receipt
directory to save raw before/after rows privately. Do not upload that private
directory as a release artifact. `before-query.sql` is a separate read-only
before-image query for release evidence.

Only `published_manifest_and_public_bytes_verified` confirms this publisher's
successful delivery. The release owner separately verifies the actual configured
API card responses and links before counting these batch items complete. No
installed-device verification is inferred from this job.

On that successful status, `rollback-receipt.json` and `rollback.sql` are prepared
without execution. The SQL verifies each newly created asset's UUID, printing,
immutable hash and cohort decision, then hides only those assets. Existing logos,
metadata, source policies, links and immutable objects remain. Reused assets are
excluded. A `commit_outcome_unknown` or post-commit verification failure requires
current readback; it is never relabelled as safe failure or successful publication.

Local implementation and offline verification alone do not mark any artwork live.
