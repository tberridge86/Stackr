# Letter-only Energy collector searches

The September 29 public API acceptance check found two valid published identifiers that search did not resolve: English anniversary `R` and Japanese M6a `WAT`. General search rejected a one-character query, and collector parsing required a digit.

The repair accepts a single letter or digit only with a canonical selected-set UUID. Inside that set, one-to-four-letter collector identifiers use exact case-insensitive matching. Both the indexed collector path and the existing direct catalogue fallback retain set and language isolation. General one-character searches and wildcard searches remain rejected. Name search remains available when an identifier does not match.

The client adapter and OpenAPI contract now express the same exception. No database schema, catalogue data, prices, artwork, holdings, source configuration or access controls change.

Validation completed locally on September 30:

- Search printing/language suite: uppercase and lowercase R/WAT, both query paths, wrong-language and wrong-set rejection, no unrestricted alphabetic collector scan.
- Progressive search suite: selected-set R reaches the API; missing/invalid set and wildcard queries do not.
- Existing Stackr API v1 suite passed.
- TypeScript check and generated API contract check passed (40/40 routes).

Merged in PR259 at `2ef619c2f4b4761d7c4734c746d0d48192ca6af7`, with 11 applicable CI checks passing. Protected backend-only run 36680646429 failed before creating a new deployment; its second attempt explicitly reported an expired Railway trial. Live delivery remains blocked. See [current evidence](backend-deployment-blocker-20260930.json). Client delivery remains part of the October 1 normal production-profile TestFlight build. Live identity and timing checks must be repeated against the deployed revision; these local checks do not establish production or phone performance.
