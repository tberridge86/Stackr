# SEARCH-002 final refresh recovery review

The first reviewed repair (`e9582f87`) exposed the existing retry warning when fresh factual card retrieval failed while cached/early cards remained. Combined runtime checks then found that generic failed-group recovery could replace useful current cards with older same-query rows.

The smallest follow-up changes the existing helper and its caller. Failed groups use prior rows only when the current group has no rows and no known factual result. The caller passes explicit `canonicalCards !== null` state, so a known current empty result remains empty with a refresh warning instead of reviving old cards. Current useful exact rows remain visible; a genuine no-factual-result failure can still retain the same-query fallback. Errors/retry, per-group settlement, query/account guards and stale-result suppression remain intact.

Independent review found and required the known-empty control before acceptance. Corrected runtime tests cover prior cards versus new useful cards, prior cards versus explicit current empty, timeout, successful fresh/empty results and stale requests. The original failing timeout assertion was retained; no error was suppressed and no gate weakened.

Reviewer and coordinator passed `test:personal-loading`, including actual extracted search coordinator/progressive callbacks and the original settlement runtime. Application typecheck and affected-file lint passed (no errors; existing warnings only). No new interaction, dependency, request pipeline or persistent data change. Source only: not merged, deployed or phone-verified.
