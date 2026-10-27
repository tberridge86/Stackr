# Account switching and missing-image recovery — acceptance follow-up

Observed 27 October 2026, completed 15:26 UTC. Candidate PR #446 source:
`d76f5099f1cb1811df01b3eace6532d8eaf83a59`. This is fresh source/runtime-fixture
verification, not an installed-phone, authenticated two-user or live storage test.
No application code, remote data, deployments or schedules were changed.

## Fresh results

| Check | Result | What the executed fixture establishes |
| --- | --- | --- |
| Binder account boundary | Passed | The actual binder modules and edit-screen logic returned `leakedPrivateName=false` and one new read for B after A → logout → B. Private card caches, A → B → A, held record/card/session/artwork responses, stale save callbacks, legacy write retry, ownership loss and public-read/private-edit separation passed. All 103 fixture cards survived lower-cap pagination. |
| Search continuation boundary | Passed | 137 rows across three pages; exact variant identities remain distinct. Held pages are aborted and cannot append after query/language/refresh/logout/A → B → A/blur generation changes. Retry, duplicate request, cursor-loop and catalogue-revision assertions passed. |
| Missing/failed image display | Passed | Actual StackrImage component logic retries each exact rendition, tries its approved fallback candidates and ends with an honest placeholder. A corrected source becomes usable; old error/load callbacks cannot poison it. This does not exercise native decoding. |
| Artwork recovery into card detail | Passed | Actual Card Detail logic starts bounded recovery for cached metadata, shows loading then honest no-image state on exhaustion, accepts exact enriched artwork, and rejects old route/account responses. Positive artwork reassignment clears an incorrectly associated cached image; failed or empty rechecks preserve existing usable artwork. |
| Stored asset repair metadata | Passed | Actual repair library reconstructs two missing WebP derivatives from a tiny PNG through a fake R2 writer, preserves the existing rendition and original source, and prepares checksums/dimensions/format metadata. Guarded updates retain asset/source/variant identity and original storage pointers. No real object or database write occurred. |

Commands executed successfully against the candidate:

```text
node --import tsx scripts/test-binder-account-cache-runtime.ts
node --import tsx scripts/test-search-pagination-runtime.ts
node --import tsx scripts/test-stackr-image-recovery.ts
node --import tsx scripts/test-artwork-loading-recovery.ts
node scripts/test-stored-catalogue-asset-repair.mjs
```

The first four used isolated test dependencies: tsx 4.23.1, TypeScript 5.9.2,
React 19.1.0 and react-test-renderer 19.1.0; no project dependency file changed.
The repair test initially could not load missing dependencies in the checkout.
It then passed from ten exact candidate files in an isolated fixture directory,
using already-installed sharp 0.35.5 and supabase-js 2.105.0. Source identity was
verified; unrelated existing backend dependency edits in the source checkout
were not used or modified. All five commands exited zero.

The binder test emitted expected denied-save errors, renderer deprecation
warnings and two React `act(...)` warnings. These did not fail assertions, but
the harness is not a substitute for observing actual screen transitions.

## Remaining acceptance

- PR #446 must reach a release before these checks describe an installed client.
- On that exact installed build, use two designated test accounts: start a slow
  private Binder/Search load as A, sign out and enter B, then let A's work finish.
  Confirm no A fields or ownership overlays appear and an old edit cannot save.
- A controlled missing-image case still needs actual decode/display verification
  and a normal repair upload receipt joined to its database asset/variant record.
  The local fake-writer test proves repair logic, not Cloudflare credentials or
  live destination wiring.
- No full database restore or D: restoration is established by these tests.

No new implementation is justified by these passing focused checks. Continue
the existing candidate's delivery and acceptance instead of duplicating fixes.
