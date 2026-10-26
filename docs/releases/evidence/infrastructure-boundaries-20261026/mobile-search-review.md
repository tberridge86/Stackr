# Independent mobile review - 26 October 2026

Reviewer: stackr_reviewer, read-only. Verdict: GO for the mobile scope after findings were corrected. Backend/SQL review is separate.

Resolved findings:
- Keep exact variant identity while using printing identifiers for ownership/listing lookup. Ownership matches selected finish and set, accepting canonical codes and existing collection aliases. Printing-only listing counts are labelled.
- Enable card continuation independently of optional sections; retain appended pages through late first-page reconciliation.
- Restart invalidated query generations for A-to-B-to-A and whitespace round trips even when debounced text is unchanged.
- Prevent a pending debounce from dispatching a new search after blur; refocus restarts current work.
- Display a known finish code when its optional label is absent.

Independent checks passed: test-search-pagination-runtime.ts, test-search-settlement-runtime.ts, test-search-artwork-batching.ts, test-progressive-card-search.mjs. The final focus/finish changes were rerun through pagination and settlement.

Evidence includes actual production callbacks with simulated setters/transports, and a React test-renderer mount of the production focus/debounce/dispatch hooks plus runSearch useCallback. It is not a full native screen, hosted authentication or installed-phone acceptance.

A nonblocking contract comment requested structured Error envelopes for 409/503; root added the existing Error response reference and regenerated the contract.

## Required explicit-refresh follow-up

Root reproduced an obsolete cached cursor after explicit refresh. The adapter now sends Cache-Control:no-cache for an explicit Search refresh; gateway search uses its existing origin-refresh/coalescing path while preserving useful cache on failure. Independent review found and corrected browser preflight compatibility: only the Search route adds that header to its allowlist, without changing allowed origins. Two new gateway regressions and the adapter-header assertion passed independent review. The complete gateway suite passed62/62 locally. This change is not deployed.
