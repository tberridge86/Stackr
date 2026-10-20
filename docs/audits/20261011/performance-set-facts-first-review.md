# PERF-001 independent final review — exact-total candidate

Reviewed `2a9ccb2099a90b5c6fb0bee48d2d69cd239dff41` against
`b0d079e5a6f3d929b1b7519633573a5126bec1f7` in
`D:/Stackr-recovery-artifacts-20261009/runtime-temp/worktrees/set-exact-total-source`.
Read-only review completed 11 October 2026.

## Decision

**Accept for integration review.** The candidate closes the three source-level
issues identified in prior reviews: factual cards no longer wait for optional
artwork, optional artwork has a guarded identity-preserving recovery path, and
a printed display count cannot be mistaken for an exact catalogue total.

This is code and controlled-test evidence. It is not a release approval,
production deployment, live API measurement, or installed-iPhone acceptance.

## Confirmed behaviour

- Set Detail requests the facts-only card lane, publishes factual cards, then
  starts optional per-card artwork recovery without blocking the screen.
- Artwork progress and completion require the current request and authenticated
  account, and are aborted on route replacement and unmount. Exact image merge
  requires card, set, language, printing, selected variant, canonical identity,
  finish and catalogue version; it retains facts, prices, ownership and order.
- The screen's exact-total helper uses a positive safe canonical `total` before
  any known override. A printed count alone returns no exact minimum.
- The facts adapter independently rejects a missing or malformed canonical
  total rather than falling back to `printedTotal`.
- `stackrSetToLegacySet` now preserves the distinction through the public
  `fetchStackrSet` path: `printedTotal: 131, total: null` becomes display hint
  131 and exact total 0. Set Detail therefore cannot bypass the adapter guard.
- The only current known override is English `me5`; its printed and canonical
  totals are both 120, and it does not match a non-English request.

## Independently validated

- `node --import tsx scripts/test-english-set-identity.ts` — passed. It runs
  the public mapping and facts-reader path: printed-only 131 rejects, canonical
  180 accepts, and a 131-row partial canonical response rejects.
- `node --import tsx scripts/test-pokemon-set-card-cache-minimum.ts` — passed.
- `node --import tsx scripts/test-binder-first-paint.mjs` — passed (14 cases).
- `node --import tsx scripts/test-issue304-cold-retrieval.ts` — passed.
- `node --import tsx scripts/test-preferred-set-artwork.ts` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — zero errors; eight pre-existing warnings outside the change.
- `git diff --check` from base to candidate — passed.

## Remaining limits before release approval

The checks use controlled clients and do not mount a React Native Set Detail
screen, decode imagery, exercise a real signed-in account switch, measure live
catalogue latency, or confirm cancellation at every network transport. No
build, merge, deployment, device install or user-data write occurred. A release
packet still needs the target revision, CI evidence and installed-iPhone
acceptance.
