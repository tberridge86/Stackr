# Candidate device acceptance — 26 October 2026

Status: NOT RUN. No native build of the current PR446 candidate has been distributed. Build1.0.6(61) does not contain these fixes and cannot qualify them. Use the final app source recorded in infrastructure-priorities-provenance-20261026.json, never the documentation-only evidence commit.

Before execution, record EAS build ID, app version/build, fingerprint, TestFlight receipt, installed version, gateway deployment, serving backend source and database function checksum. Identify designated accounts A/B and empty/small/large/multilingual fixture coverage; do not modify customer accounts. Configure credentials locally using the approved QA file or interactive sign-in.

Record device/iOS version, network, cache state, sample count, requests, decoded bytes, authentication calls and time to useful content. Use matching conditions for baseline and candidate. A public desktop response or simulated delay is not a phone measurement. Prepared GET may update generation-request metadata; do not trigger price jobs.

| Case | Action | Required observation | Result |
| --- | --- | --- | --- |
| Account boundary | A opens private binder edit; logout; B opens the same route within30seconds; repeat A/B/A | No A metadata under B; correct ownership denial; pending A responses cannot repopulate B state | UNVERIFIED |
| Binder edits | Add/remove placements; edit owned binder; switch account during save/retry | Exact counts, no foreign write, appropriate refresh and late-response rejection | UNVERIFIED |
| Home cold | Fresh app/session cache using each available collection cohort | Full counts and exact pricing coverage; prepared summary can appear independently; record all requests/bytes and usable-content time | UNVERIFIED |
| Home warm/refresh | Return navigation, then explicit refresh | Useful cached data retained; edits reflected; freshness honest; no refresh loop | UNVERIFIED |
| Offline/recovery | Cache useful content, disconnect, navigate, reconnect and retry | Cached content remains useful and labelled appropriately; retry recovers without disappearing sections | UNVERIFIED |
| Search completeness | Query more than50 matches; continue through every page | All expected exact variants reachable once; no premature complete state; filters/counts disclose loaded scope | UNVERIFIED |
| Multilingual identity | Compare language/set/number/finish variants across pages | No sibling printing price/image/ownership substitution | UNVERIFIED |
| Search cancellation | Rapidly change query; blur/refocus; logout/account switch while requests are pending | No obsolete query, account or optional result overwrites newer state | UNVERIFIED |
| Search revision/refresh | Refresh after a stale cursor; interrupt optional image/source response | Canonical cards stay useful; continuation/retry recovers without loops or lost rows | UNVERIFIED |
| Pokédex | Browse ownership/completion before and after collection edits | Correct exact-account ownership, complete counts, independent image recovery | UNVERIFIED |
| Pricing | Inspect priced, partially covered, unavailable and stale entries | Honest coverage and timestamp states; no invented current value | UNVERIFIED |
| Media privacy | Open known legacy/R2 public artwork and designated private media; switch account | Correct approved artwork, no private bytes or signed references in public catalogue cache | UNVERIFIED |

Any failure must record exact build/account fixture (non-secret label), reproduction, expected/actual result and request IDs where safe. Do not mark a whole screen accepted from a screenshot or successful launch. Preserve reversible test receipts and restore designated fixtures after edits.
