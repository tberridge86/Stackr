# PERF-001 set-detail facts-first repair

## Scope

- Base revision: `b0d079e5a6f3d929b1b7519633573a5126bec1f7`
- Branch: `agent/performance/set-facts-first`
- Initial commit: `980e009217b2148656eaf6412b7338bd67c9e9e0`
- Corrected after independent review: add per-card artwork recovery without
  blocking factual first paint.

## User problem

Set Detail can feel stalled while optional card artwork is fetched. The screen
must show correct card facts promptly without leaving cards permanently without
their approved artwork or accepting stale account/route results.

## Current state

The initial asset-enriched request blocked facts on optional artwork. The first
facts-only revision then exposed a second problem: the facts projection strips
images and Set Detail did not recover them. Review also found that a printed
total can be lower than the canonical total, so it is unsafe as an exact
facts-reader count.

## Proposed state

Set Detail publishes complete factual cards first, validates them against the
authoritative canonical `total`, then recovers artwork in the background. A
known set count is used only if the resolved canonical record has no total;
`printedTotal` alone is never used as an exact count. Artwork can update only
the same printing, language, selected finish and catalogue version on the
active account/route.

## Confirmed failure

Set Detail called `fetchCardsForSet` with its default asset-enriched lane. The
helper waits for optional provider/image reference attachment before resolving,
so factual cards could not be published until optional enrichment completed.

The new regression initially failed against the base source because the set
screen did not request `includeAssets: false`.

## Repair

Set Detail now requests factual card rows through the existing facts-only lane.
It passes the resolved language and a minimum count derived from the known-set
override or the resolved set metadata. It immediately publishes those rows,
then starts the existing bounded `enrichStackrCardArtworkFromFacts` path in the
background. Its progress and completion handlers require the same active
request/account generation and an un-aborted artwork request before they merge
image fields.

`mergeSetCardArtwork` accepts artwork only when card ID, set, language,
printing number, selected variant/finish and catalogue version all match. It
merges image/presentation fields only, retaining factual fields, prices,
ownership, order and the displayed rows. Replacing a route or unmounting aborts
the optional artwork request. An artwork failure leaves the factual rows in
place.

This change does not alter the API, data, account ownership reads, or artwork
policy.

## Considerations and acceptance criteria

- First paint must not await artwork or provider enrichment.
- The exact facts reader must accept a complete canonical set and reject both a
  smaller expected printed count and a partial response.
- Artwork must retain facts, prices, ownership and order, and must not repaint a
  superseded route or account.
- Failure to retrieve artwork must preserve usable factual rows.

## Evidence

- `node --import tsx scripts/test-issue304-cold-retrieval.ts` — passed after
  failing on the base source. The added Set Detail contract proves the screen
  uses the facts lane, keeps a completeness minimum, publishes cards before
  optional enrichment, and cancels/guards late per-card artwork work.
- `node --import tsx scripts/test-pokemon-set-card-cache-minimum.ts` — passed.
  Its pre-existing cache case covers the outer asset-lane cache; its added
  behavioural cases prove facts remain visible while artwork is unavailable,
  exact late artwork paints, and wrong language/set/version/finish cannot
  replace a factual row.
- `node --import tsx scripts/test-binder-first-paint.mjs` — passed, 14 cases.
  This is the real facts-reader control: complete facts pagination, identity and
  version rejection, image stripping, canonical 180-versus-printed-131 count
  behaviour, and non-persistence of partial pages.
- `node --import tsx scripts/test-preferred-set-artwork.ts` — passed. It
  exercises the shared progressive artwork reader's exact identity merge and
  cancellation boundary.
- `npm run typecheck` — passed.
- `npm run lint` — passed with 0 errors and 8 pre-existing warnings outside
  the changed paths.
- `git diff --check` — passed.

## Limitations and handoff

The tests establish source and helper behavior only. No live API, deployment,
or installed-iPhone measurement was performed. Independent review should check
that the selected minimum is appropriate for a known set with a partial response
and that the intended release includes this mobile source.
