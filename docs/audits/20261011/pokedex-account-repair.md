# PDX-002 account ownership repair

Observation date: 11 October 2026. Source baseline:
`80c8eab31619e30fa6bf03b7eb48015bfcbf5338`, branch
`codex/specialist-audits-backend-repair-20261010`, maintained checkout
`D:/Stackr-release-recovery-20261009`. These are local source and fixture results;
no real inventory/account was changed.

## Ownership and scope

Exclusive specialist files: `app/(tabs)/pokedex.tsx`, `app/pokemon/[id].tsx`,
`lib/pokedexCollection.ts`, new `lib/pokedexOwnershipState.ts`, new
`scripts/test-pokedex-account-boundary.ts`, and this report. Assigned
`scripts/test-pokedex-loading.ts` needed no changes. The parent owns
`package.json`, shared queue and release receipts. Original `D:/Stackr-1` was
read only for the specialist definition; its dirty state was preserved.

Inspected current list/detail consumers, collection service, existing ownership
fixtures, account generation, `components/auth-context.tsx`, collection context,
and the name/foreign modules' boundaries. No species/form mapping, pagination,
artwork, AuthContext, catalogue, schema or deployment change is included.
The index remains the existing published contract and
`stackr:pokedex:pokemon-list:v2:published` cache; identity totals are outside
PDX-002 and this report does not validate National Dex species coverage.

## Reproduced baseline

The backend lead's unchanged read-only runtime harness was run **before edits**:
`node D:/Stackr-recovery-artifacts-20261009/runtime-temp/pdx002-current-consumer-controls.cjs`.
It extracted and executed the actual baseline consumer callbacks and returned
11 observations. Exactly **8 defective observations and 3 positive controls**
are listed below. Grouping failed-first-read missing/zero together and grouping
late-account detail behavior with retained detail behavior yields seven broad
defective scenarios; that grouping must not be substituted for the 11-row
denominator.

| Actual baseline control name | Observation | Classification |
| --- | --- | --- |
| `list-pending-refresh-retains-previous-account-names` | `pikachu` retained | Defective |
| `list-late-A-result-publishes-after-fixture-switch-to-B` | late A publishes `mew` | Defective |
| `list-failed-next-focus-retains-prior-names` | prior `mew` retained | Defective |
| `list-existing-blur-guard-rejects-late-result` | late `raichu` rejected | Positive |
| `detail-failed-new-account-retains-A-owned-key` | `set-a:printing-a` retained | Defective |
| `detail-failed-first-read-claims-all-missing-and-zero-owned` | 2 fictional missing / 0 owned | Defective |
| `detail-sign-out-null-user-cannot-clear-old-owned-key` | `set-a:printing-a` retained | Defective |
| `detail-final-account-check-rejects-A-result-but-retains-displayed-A-key` | new A rejected, `set-a:old-key` still displayed | Defective |
| `detail-current-account-success-publishes-exact-printing-key` | `set-b:printing-b` published | Positive |
| `detail-current-account-successful-empty-read-is-known-missing` | empty success clears old keys | Positive |
| `detail-old-A-mutation-rollback-can-delete-B-displayed-key` | B same-printing key deleted | Defective |

The new regression also has a baseline mode that loads the actual screens and
service from `git show HEAD:<path>`. With `PDX_BASELINE=1`,
the initial `node --import tsx scripts/test-pokedex-account-boundary.ts` failed (Node exit 1)
on the first pre-effect A-to-B rendering assertion: the baseline still rendered
`1/2 owned` and `50% complete` instead of unknown ownership.

## Implemented behavior

The shared hook tags successful ownership snapshots with the account ID and
projects them against `useAuth` during render. A different account, sign-out or
initial auth loading cannot display old badges/counts, even before effects run.
Existing `createAccountLoadGeneration` invalidates old requests on account/auth
readiness changes, blur and unmount. The existing auth provider remains the only
subscription; server-backed `getUser` checks remain in the service and final
read publication guard.

Unknown/loading/error differs from a successfully empty collection. Unknown
ownership shows neither a zero count nor a completion percentage; species
accessibility labels also say unknown. Owned/Missing filters are disabled while
unknown, while factual cards and detail/inspection navigation remain usable.
Only a successful current-account snapshot enables marker changes. A same-account
successful snapshot survives an offline refresh, displays saved ownership with
an error and retry action, and stays read-only until refresh succeeds.

Marker optimism is an account-scoped overlay over the authoritative snapshot.
Every mutation has an initiating account and generation; stale success/failure,
rollback, reload, alert and completion cannot affect another account or a newer
marker operation. The service rejects a mismatched expected account or invalid
consumer intent after the initial `getUser`, and checks both again immediately
before writes after any collection guards. All writes remain manual
`user_pokedex_cards` operations. Physical variants and owned binder rows still
block removals before a write; marker deletion still uses user, exact card and
set, including explicit null sets. Stable paged reads, bounded binder filters,
provenance contributions, native/form names and exact `set:card` keys are retained.

## Independent review corrections

The initial frozen repair passed 11 broad acceptance groups but missed two
independently reproduced P2 review findings. Those original passing groups did
not establish optimistic-overlay validity or synchronous initiation locking.

- `PDX-002-REVIEW-01`: after a verified-empty A snapshot and pending optimistic
  add, auth error, auth loading/ready, A-to-B-to-A before effects or blur could
  invalidate the service intent while the overlay still displayed one owned
  printing. The actual complete-consumer regression reproduced RED: with
  `authError` and `intent.isCurrentAccount() === false`, the screen still showed
  `1 / 2` and labelled it saved ownership. Pending overlays now carry the same
  mutation-generation/account/auth-readiness/focus validity predicate as the
  write intent. Invalid overlays are excluded during render, including the
  return to A before effects, so only verified saved ownership remains.
- `PDX-002-REVIEW-02`: two calls to the same tile's `onPress` before rerender
  reproduced RED with two persist invocations instead of one. A synchronous ref
  lock now binds initiation to the active token; a duplicate cannot supersede
  the first valid intent. Only the matching token clears the lock. Existing
  late-A/new-B tests now also retap B after A's stale `finally` and prove B stays
  locked with its current intent intact.

Both RED controls were added before correcting the frozen helper and failed
with Node exit 1. Both now pass alongside the original 11 groups, initially for **13/13
named broad groups**. The test fixture's internal memo helper was renamed to
avoid two false React hook lint warnings without changing memo dependencies or
test behavior. Independent review of this corrected freeze is still the parent
handoff gate.

The second freeze's 13 passing groups still missed `PDX-002-REVIEW-03`:
a failure returned by the hook could alert the next account after its promise
handoff to the screen's unconditional catch. The reviewer reproduced this in
the full consumer runtime. A deterministic regression then held only exposure
of the actual hook's settled promise to the TSX continuation, switched/rendered
B and released it. This reproduced RED with one alert for account B where zero
were expected, without relying on a fixed microtask depth.

The hook now returns a failure together with the original intent's
account/auth/focus/mutation-generation guard. The screen checks that exact guard
immediately before its synchronous error log/alert, with no intervening await.
Successful/stale/blocked operations return null and produce no final screen side
effect. The handoff group retains the current-A alert positive and suppresses
alerts after B, A-to-B-to-A, a newer mutation, blur or auth error; it also verifies
late successful completion cannot cause a side effect after B renders.
The final suite passes **14/14 named broad groups**. The initial 11 and corrected
13 passing results must not be presented as proof that this later boundary was
already covered.

## Validation and limits

After correction, the new script executes both complete TSX consumers and the
actual shared hook/service with deterministic hooks, fixture auth and fixture
ownership. It deliberately controls when effects run, so masking is tested at
the first render after account change, rather than only after reset effects.
No native modules are executed and no live query/write is made.

Commands passed:

- `node --import tsx scripts/test-pokedex-account-boundary.ts`: **14/14 named
  regression groups**, covering both consumers' pending A-to-B/failed B/failed
  first/sign-out/valid empty/same-account offline and retry states; late reads
  after account render, blur and unmount; marker success/failure after A-to-B,
  a newer pending B mutation, blur and unmount; same-account marker success and
  failure; service expected-account/auth-pending/pre-write mismatch with zero
  writes; physical/binder refusal and exact/manual/null-set positive controls.
- `npm run test:pokedex-release`: existing route and loading checks plus the
  new account-boundary script, included by the parent's `package.json` change.
- `node --import tsx scripts/test-issue304-cold-retrieval.ts`: existing persisted
  cache, progressive canonical Pokédex paging, retry and stale request controls.

The 14 post-repair groups are broader acceptance groups, not the same denominator
as the 11 baseline observations. No overall coverage percentage is claimed.
The parent runs full `npm run typecheck` and `npm run lint` and obtains independent
read-only review. Native rendering, installed-device transitions, actual offline
timing, live RLS and a switch during an already-dispatched database request remain
unmeasured. Existing RLS remains authoritative for database requests; a local
guard cannot revoke a request already sent to the server.

Supabase guidance was read from the installed skill. The current
[changelog](https://supabase.com/changelog.md) and official
[getUser](https://supabase.com/docs/reference/javascript/auth-getuser) /
[onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
docs were checked. No relevant client auth API migration was identified and no
dependency was changed. React Native skill guidance was applied to preserve
existing virtualization and keep ownership reads outside list items.

## Delivery state and rollback

Implemented and focused-tested locally; independent review and parent quality
gates pending at handoff. This work is not committed, merged, deployed or
device-verified by the specialist. The baseline is integrated in this local
branch; that does not establish delivery of this uncommitted repair. The parent
owns integration/release claims. Rollback is the isolated source diff; there is
no schema, catalogue or live-data rollback requirement.
