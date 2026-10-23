# Build 60 backend retrieval sweep

Inspected the active repair checkout on 22 October 2026, branch
`repair/build60-feedback-20261022`, baseline
`bdad4ea26e4f8f7bf83fe3e108ca2e6cbd01c4e5`. All previously staged Build 60
changes were preserved. The old recovery checkout is superseded for this task.

## Implemented defect: set fallback lets optional artwork block card facts

`backend/routes/v1.js` falls back from `fetchFastSetCards` to the catalogue
service after an ordinary transport/database failure. The fast implementation
supports `includeAssets=false`, used for binder facts. The fallback ignored that
flag and always awaited artwork. Unlike detail/search, it also propagated
optional artwork errors and had no artwork deadline.

The actual service and installed Supabase SDK reproduced both failures using
local mocked transport, without a database or network:

- A facts-only page issued one artwork RPC; the assertion requiring zero failed.
- An optional artwork `57014` error rejected the entire successful facts page.

The fallback now preserves the fast path's existing boolean/string opt-outs.
For default or explicit artwork reads it uses the existing 500 ms optional
enrichment policy. Ready facts survive artwork failure, stalled transport or a
stalled response body, with an explicit missing image. Essential facts errors
still fail, and a disconnected parent request still cancels. Set/version,
language, cursor, pagination, variants and source attribution remain intact.
No artwork identity, permission, publication or price is invented.

Changed source: `backend/lib/stackrApiV1.js`. New regression:
`backend/test/set-card-artwork-fallback.test.mjs`. The staged reordered-name
search change belongs to the existing repair batch and was preserved.

## Bounded sweep

Inspected catalogue routes and client selection in `backend/routes/v1.js`, core
list/detail/set/Pokedex/search/manifest methods in `stackrApiV1.js`,
`fastSetCards.js`, `traceContext.js`, and current published-view and identity-RPC
migrations. The default route uses the existing service-only bounded asset RPC;
the facts path binds reads to the set's published version. Detail and search
already bound optional artwork and preserve their useful facts. No source
evidence supports one backend bug explaining every image, price and ownership
failure. Ownership and pricing have separate request/authentication paths.
The coordinator owns production read receipts and operational log inspection;
this report makes no live-coverage or measured-speed claim.

## Verification and limits

- `node --test backend/test/set-card-artwork-fallback.test.mjs
  backend/test/set-card-version-binding.test.mjs`: 8/8 passing. Includes SDK
  query scopes, image provenance, actual cancellation signals, ignored aborts,
  delayed bodies, late-page immutability and parent-disconnect propagation.
- `node scripts/test-backend-search-enrichment.mjs`: passed.
- `node scripts/test-printing-asset-manifest.mjs`: passed.
- `npm run typecheck:backend`: passed.
- Scoped `git diff --check`: passed.
- Existing `backend/test/public-catalogue-cancellation.test.mjs` was attempted
  but could not exercise its HTTP routes in this sandbox: loopback connections
  fail with `EACCES 127.0.0.1`. Its 13 failed tests are not recorded as passing.
  The new SDK regression verifies the changed cancellation path without sockets.

Supabase's current abort-signal documentation was checked; the changelog's
Markdown endpoint could not be read by the browsing tool, so its HTML index was
checked instead. No related current SDK-breaking change was identified.

State: implemented and locally tested; independent review subsequently passed
the fallback change and independently ran its five SDK tests. No commit,
merge, deployment, migration, provider refresh, catalogue mutation, production
job, or installed-phone verification was performed. Rollback is the inverse
of the focused helper and fallback change; no data rollback is necessary.
