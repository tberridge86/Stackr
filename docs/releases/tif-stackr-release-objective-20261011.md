# Stackr release objective

Your objective is to complete Stackr and prove it is ready for release. Stackr is a Pokémon card collection app covering search, catalogue browsing, scanning, pricing, binders, Pokédex ownership and community features.

First inspect the current repository, its agent instructions, repair queue, existing branches and PRs. Establish what already works, what needs repair and what is awaiting release. Existing notes are context, not proof of current behaviour.

Use these completion targets:

1. **Reliable core journeys**
   Verify cold and warm launch, registration, login, password recovery, sign-out, account switching, search, set browsing, card details, binder changes, Pokédex ownership, scanning, pricing and community access. No reproduced critical or high-severity defects may remain in the agreed release scope.

2. **Fast browsing**
   Target the first usable search, set or card result within 2 seconds warm and 4 seconds cold at the 95th percentile on a stated reference device and network. Measure a baseline first. Aim for 30 cold and 30 warm observations per changed journey; disclose smaller samples.

3. **Correct catalogue identity**
   Verify English, Japanese, Simplified Chinese, Traditional Chinese and Korean against a declared test cohort. Preserve language, set, collector number, printing and finish throughout search, card details, scanning, binders and pricing. Resolve incorrect aliases, translations, species and forms using source evidence.

4. **Accurate artwork and presentation**
   Reviewed cards must display the correct image, name, set and logo. Images must load reliably, preserve aspect ratio and provide useful fallback states. Record source and rights evidence. State catalogue coverage and outstanding exceptions.

5. **Trustworthy prices**
   Every displayed quote in the reviewed cohort must match the exact card and finish, and retain currency, timestamp and provider provenance. Preserve exchange-rate provenance where conversion occurs. Clearly label estimates, market observations and completed sales. Show unavailable or stale prices honestly.

6. **Dependable binders and ownership**
   Adding, editing and removing cards must persist correctly. Quantities, finishes and Pokédex ownership must agree. Failed or partial writes must provide recovery without silently losing changes or creating duplicates. Private collections must remain private.

7. **Useful scanning**
   Test a declared sample across supported languages, lighting conditions and card finishes. Record identification accuracy and time to result. Ambiguous matches must offer confirmation or manual selection. A wrong printing or finish must never silently become a confirmed match.

8. **Safe accounts and community**
   Test private-data access, sign-out, account switching, cancelled requests and delayed responses. Previous-account data must never appear in the next account. Verify sharing permissions and enabled community safeguards. Require independent review for account, identity and pricing changes.

9. **Clear failure handling**
   Test offline use, slow connections, empty results, pagination, failed reads and partial responses. Every journey must recover or explain the next action. Eliminate indefinite loading, missing items presented as complete results and false success messages.

10. **Release evidence**
    Pass applicable repository checks and relevant regression tests. Record the exact source commit, backend and gateway deployment identities, mobile build and rollback procedure. After approved delivery, verify affected journeys on an installed iPhone. CI success and service health alone do not establish completion.

Working rules:
- Prioritise critical/high-severity retrieval and account faults, then prepared fixes awaiting delivery, then performance, catalogue, scanning and pricing gaps.
- Reuse matching work; avoid duplicate issues and PRs.
- Preserve unrelated edits and canonical card identity.
- Work autonomously on investigation, isolated fixes, tests, issue reports and draft PR preparation.
- Request approval before live deployments, native/OTA publication, remote database or catalogue changes, credential/access changes, destructive actions or spending. Include deployment-triggering merges in this boundary.
- Keep commerce gated until explicitly approved.
- Never invent prices, source evidence, test results or completion percentages.

Maintain a completion ledger with:
Target | Scope/test cohort | Current result | Evidence | Remaining blocker | Next action

Track implementation, testing, independent review, merge, deployment and installed-device verification separately.

Stackr is complete only when every agreed release target has acceptance evidence, no critical/high-severity defects remain, approved changes have reached their intended environments, and the installed iPhone passes the release checklist. Report unfinished work explicitly; do not claim completion from code changes alone.
