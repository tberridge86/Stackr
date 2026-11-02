# Saved card name delivery repair

Baseline: `832eba78ad8bbdd8dea1d358b811f2c11bc3f013`. Scope: Home/Search/Binders client delivery; no translation generation, artwork acquisition, database writes, deployment or native build.

## Demonstrated defect

The published API supplies an English display alias, but a serialized Binder row can retain an earlier `translation pending` title. `enrichSavedStackrCardArtwork` copied image fields only, and `mergeBinderArtwork` discarded the current English alias even when the printing and selected variant matched. A name-only response was also discarded by the Binder orchestration. This is a delivery gap, not missing translation evidence.

The new regression runs the actual shared mapper and merge with the captured Japanese Varoom printing `d82428b0-594f-4e9c-9b5a-ae2b0f7170cc`, selected variant `0ab06d35-40e5-4ed7-83b1-76c51051534f`. Fresh mapping produces **Varoom** and the declared R2 card-grid URL. Against an older saved title, the exact baseline leaves the title pending while changing the image; the repaired path fills the alias. The baseline failure is an expected title assertion, not a missing test dependency.

## Repair boundaries

- Fill only missing/pending English display aliases from the current canonical response. Existing English titles remain untouched.
- Require the same canonical printing, selected variant, canonical key, variant code, finish, set, language and complete native title. Preserve native text and identity, quantities, condition, notes and slot order.
- Copy the English display provenance with the alias. A missing image does not suppress a valid name, and it does not clear existing artwork fallbacks.
- Reuse the existing read. No per-card lookup or additional network request was added.
- Keep provider reference images nonserializable. Independent review reproduced a descriptor-loss issue in the initial candidate; the fix and regression preserve both the helper and merge boundary.

Changed runtime files: `lib/stackrDomainAdapter.ts`, `lib/stackrSetRetrieval.ts`, `lib/binders.ts`. The existing saved-artwork harness receives the new real helper dependency without weakening its assertions.

## Bounded live evidence

| Sample | API request/time (UTC, 2 November) | Observation |
| --- | --- | --- |
| Japanese Pikachu, limit 3 | `2652b792-47c8-4789-8881-b297798b9ca2`, 12:15:09.027 | All three have English card names and approved image descriptors; SM9 031 includes recorded R2 grid/detail renditions. |
| Japanese Varoom, limit 3 | `8c382780-e250-4d4e-a78b-ce9b1145605c`, 12:15:53.833 | All three map to Varoom. Two SV1S results select their recorded R2 240×330 card-grid URLs; MC uses its approved external original. |

Exact public JSON is retained in `public-search-pikachu-ja.json` and `public-search-varoom-ja.json`. Retrieval used Firecrawl raw response content with `maxAge: 0`; both HTTP responses were 200. These captures verify API descriptors, not phone rendering or image-byte downloads.

MC's API set English field contains Japanese text, but the maintained client supplement resolves **Starter Deck 100 Battle Collection**. It is not a reproduced set-name display defect. Both live search samples explicitly report `search_pagination_unavailable`; that backend limitation is disclosed separately and unchanged by this repair.

## Validation and limits

- PASS: `node scripts/test-saved-card-display-alias.mjs` — actual mapper, adapter, shared merge, Binder orchestration and snapshot/reopen; name-only recovery; identity rejection; existing-title preservation; transient image boundary; private fields and abort.
- PASS: `node --import tsx scripts/test-saved-binder-artwork-recovery.ts` — original saved-artwork recovery/identity/cancellation assertions retained.
- PASS: `node --import tsx scripts/test-foreign-card-presentation.ts`.
- `test-native-language-display` could not start in the isolated app snapshot because its backend module dependency was absent; this is not recorded as a passing check.
- Independent re-review PASS after the provider-overlay descriptor correction; the reviewer independently ran the actual captured-record regression.
- Parent owns integrated typecheck/lint and the final validation record.

Fresh translation/thumbnail loss was not reproduced for these six public results. The saved-name fix does not establish that every reported missing image, saved custom row, card/set or installed-phone state is resolved. There were no rights or permission changes.
