# Backend repair follow-through — 11 October 2026

The first local heartbeat pass implemented and independently reviewed a bounded
PDX-003 correction. Implementation revision:
`a00bcc5c744477e1e8471da343ab23bf86764652`, on
`codex/specialist-audits-backend-repair-20261010`, matching open PR #329.
Original `D:/Stackr-1` changes were preserved. No live operations were performed.

## Covered cases

The backend already recognised `nidoran-f` / `Nidoran♀` and `nidoran-m` /
`Nidoran♂`; the mobile ownership matcher did not. Both now agree and retain
opposite-gender exclusions. Two exact source-reviewed aliases bridge
`raichu-alola` to `Alolan Raichu` and the provider's default `deoxys-normal`
route to bare `Deoxys` titles and allowed card mechanics.

The backend source query reaches candidates before strict title matching.
Ordinary Raichu is rejected for the Alolan route. Explicit nondefault or unknown
Deoxys form qualifiers are excluded from the bare-title alias. Existing consumed
source cursors, bounded empty scans, printing/language filters and finish
variants remain intact. Legacy mobile fallback uses the aliases and retains
its honest incomplete state.

This is **partial PDX-003 completion**. Other regional/default/form aliases
remain unreviewed. Bare `Deoxys` does not establish the physical form depicted
by a card, and no artwork or absent metadata was used to infer it. Pokédex
species/form totals, stale account ownership and Trainer ownership eligibility
are separate unresolved findings.

## Verification and independent review

The specialist's [repair evidence](../audits/20261011/pokedex-name-repair.md)
records before/after actual backend/client cases, failing then passing service
and mobile regressions, exact primary-source links and remaining scope.
The [independent review](../audits/20261011/pokedex-name-review.md) records a
missed leading-qualifier case and its verified correction.

The initial alias expression accepted fictional test titles such as
`Cosmic Deoxys`, `Future Deoxys` and `Origin Deoxys V` for the default route.
Review caught this before publication. Both implementations now require the
complete bare title from its start, with only allowed trailing mechanics.
New actual-service and backend/mobile parity negatives failed before this
correction and passed afterwards. These are synthetic regression controls,
not claims that the live catalogue contains those titles.

Final checks passed:

- `npm run test:pokedex-release`, including the affected actual service and
  ownership/fallback consumers; independently rerun by the reviewer.
- Seventeen additional actual backend/mobile identity controls from the reviewer.
- `npm run typecheck`, `npm run typecheck:backend` and `npm run lint` after the
  corrected handoff; lint has zero errors and eight existing warnings.
- `git diff --check` and the two price-client regressions affected by integration
  with main's separate Chinese cache correction.

No shared import or package was added across deployment roots: Railway isolates
the backend service, and Metro excludes backend source. The two small alias
tables remain in their existing trees with explicit parity regression coverage.

## Integration and delivery

Before this pass, all nine applicable hosted checks on PR #329 head
`925461ebba900038c60cc5232567f910287049a9` succeeded. The release/canary jobs
were skipped under PR conditions; this is not production acceptance.
Main advanced to `38db6229f0dc419db37cca009320db9c1a7bbe92` through separately
owned PR #328. It was merged locally without conflicts, producing integration
parent `26b413d28014230f407bcc297136b4e6e59857aa`; overlapping price clients
were narrowly rechecked and passed. The current PDX code is locally committed
and reviewed. Updated-head hosted checks must be read separately after pushing.

The [shared queue](../audits/20261010/repair-queue.json) retains PDX-003's residual
mapping scope and records local/tested/reviewed states separately. API deployment,
catalogue changes, signed native upload and installed-device verification were
not performed. No background schedule or existing price-worker cadence changed.
