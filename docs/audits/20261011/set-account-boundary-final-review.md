# Set Detail account boundary: final repair and review

Finding `SET-ACCOUNT-BOUNDARY-001`, P1. Reused the existing held draft and the current facts-first Set Detail implementation in the maintained integration checkout. Historical baseline `16031bfa4f61d0b437077f2862afd559455ac82f` reproduces prior-account ownership on the first A→B render before effect cleanup.

## Existing element and smallest change

Set Detail kept quantities, ownership-ready state, counts/filters and the quantity editor from account A until an effect cleared them. Async account checks alone did not protect this synchronous render; returning A→B→A could also reuse the old ready A snapshot.

Tag ownership with its loaded generation and invalidate the current generation on account/auth-ready boundaries. Feed the existing card tiles, filters, count/summary and quantity editor an empty visible map until the loaded account/generation is current and auth is ready. Keep unknown ownership separate from confirmed empty results, and reuse the existing summary action for a failed ownership retry.

Public set/card facts remain browseable during auth loading/error; their request freshness is separate from ownership readiness. Preserve facts-first publication, approved artwork recovery, exact variant/set/card identity, quantity schema, haptics, navigation and price overlays. No new dependency, screen, service or interaction architecture.

Guard asynchronous ownership reads, mutation rollback, activity entry/alerts and editor cleanup by the initiating generation. A same-key mutation lock belongs to that generation: it prevents duplicate current writes, allows a new account/generation to proceed and stops an old completion from unlocking newer work. This does not add the separate durable history-only retry tracked by `HISTORY-DIRECT-WRITE-001`.

## Verification and review

The regression executes the complete compiled TSX and its actual `CardItem`, filter/summary and sheet consumers with synthetic React hooks and fixture sources. It deliberately delays effects at the boundary; it is not a mounted native React screen or physical-device test.

- Meaningful RED on historical source: the first changed-account render exposes A's summary/quantity. Corrected GREEN covers A→B and immediate A→B→A masking before effects; public browsing, current empty and sign-out remain available.
- Deferred auth and variant responses cannot publish a prior generation. Only the new generation can expose ownership. Initial auth loading/error still renders public cards while masking private quantities.
- Failed current ownership exposes retry; a valid empty retry becomes a known empty collection.
- Actual quick-add begins a counted upsert with asserted account/card/set/variant/quantity and conflict key. Current failure rolls back with an alert; stale failure cannot repaint or alert the next account.
- Stale successful writes produce no activity under a newer generation. A started current history request carries the expected account; its failure after A→B→A cannot raise a stale alert.
- Current double taps stay locked; a new generation can start the same key while an old operation is pending; the old `finally` cannot unlock newer work, which releases only on its own settlement.
- Independent review corrected the missing loaded-generation tag, public-auth spinner regression and a test that originally pressed the editor instead of starting a write. Final implementation has no remaining P1/P2 finding in scope. Exact write/history assertions were added before source freeze.
- Relevant cold-retrieval/cache-minimum checks, application typecheck and focused regression passed. The regular `test:personal-loading` command now includes this test; coordinator final results and lint are recorded in the integration receipt.

## Delivery state

Implemented, locally tested and independently reviewed; unmerged, undeployed and not installed-device verified. No private production records or live writes were used. The real account-switch/edit/empty/error/retry journey on the owner's iPhone remains required after approved matching delivery. This repair does not establish all app account boundaries or full production readiness.
