# CoroCoro magazine reveal continuation — 16 October 2026

The original Shining Mew paper pull, printed sleeve and card reference remain the visual benchmark. This candidate adds eleven verified issue-to-printing navigation links, ten documented insert distributions and named source references for all eighteen missing preview covers. New cover images and physical-variant ownership bindings remain held.

## Result and delivery state

The local demonstration at `http://127.0.0.1:58412/` retains the original reveal, skip and replay, then opens an unselected magazine browser. It contains 43 unique direct-insert rows, 25 unchanged owner-supplied covers, eighteen rows with cover source-page links and eleven links to exact official card pages. Only the original two Mew cards have preview ownership controls; those controls are an in-memory simulation with no collection writes. Cover pointers never become image sources.

Artifacts are under `D:/Stackr-recovery-artifacts-20261009/runtime-temp/corocoro-continuation-20261016`. `original-benchmark.html` remains byte-identical to its recovered source, SHA-256 `6d195a76f228ba3971961ed758d9763ca072de3ad23cd315bdb83cc4a19e22c7`. `preview-source-receipt.json` records the inventory and limitations. The prototype's Jirachi row retains its unresolved date association, so 43 is a recorded inventory rather than a complete historical denominator.

The native archive preserves all 36 baseline distribution rows and appends ten primary-source insert rows. It now groups 46 distribution records into 44 publication-separated issues, with 64 card references and 43 insert records. Monthly CoroCoro, Bessatsu and Ichiban retain separate identities. July–August 2025 Ichiban is one issue, searchable by either month, with its combined label used on the shelf, placeholder, opening and card/set backlinks. The separate CoroCiao deck and ticket research remains evidence rather than invented individual inserts.

The optional native opening uses the existing permitted supplied issue cover. Cards remain browsable during motion; reduced motion, skip, replay, backgrounding and focus loss use bounded cancellation. The native candidate does not bundle the third-party printed-sleeve photos whose production-use evidence remains missing. The previously rejected six-scene implementation remains withdrawn.

## Exact printing navigation and ownership

[Printing evidence](corocoro-exact-printing-evidence-20261016.json) records twelve API printing candidates, eleven verified issue-to-printing navigation proposals and one held issue-link candidate. The eleven are Snorlax 156/S-P, Pikachu VMAX 265/S-P, Pawmi 035/SV-P, Cetitan 058/SV-P, Shroodle 087/SV-P, Cyclizar 097/SV-P, Grafaiai ex 088/SV-P, Pachirisu 129/SV-P, Zarude 162/SV-P, Kangaskhan 172/SV-P and Team Rocket's Meowth 259/SV-P.

`corocoroVerifiedPrintings.json` keeps these links separate from `mappedStackrCardId`. Navigation and artwork wait for the fetched card to match the approved card ID, set ID, Japanese language, collector number, set code and native name. Artwork then passes through the existing approval, bound-identity, unavailable-scan and shared-reference contract. Shared reference artwork is labelled. An offline, stale, wrong-card or unapproved-image response cannot enable a link or display an unverified image.

All eleven physical editions and finishes remain unverified; none enables new collection controls or issue-completion credit. In particular, the publisher describes Snorlax as special foil while the current API provides a normal variant with no finish evidence. The SV-P cards retain their acquisition-required scan states. A numbered card-page match cannot resolve those physical differences.

The two original manual Mew mappings are preserved. Scoped read-only API searches did not establish canonical bridges; the later Shining Mew SM3+ 041 was rejected. The existing collection reader remains bounded to the two established Mew card/set pairs, authenticates the account boundary before and after reads, and rejects truncated results. Exact lookup validation gates the existing binder/quantity review. Binder-owned copies open the actual binder; variant-owned copies open existing set controls. No separate magazine collection store or blanket removal is added. Actual API/manual-ID compatibility and installed-device save/restart behaviour remain unverified.

## Cover evidence and unresolved matches

[Cover evidence](corocoro-cover-source-evidence-20261016.json) records eighteen missing-cover rows plus a separate July 2003 Jirachi date-conflict candidate. The nineteen review rows contain 26 named image pointers; only their source pages are linked in the preview. No new original cover bytes were acquired, no new public image was approved and no new image URL was promoted into the app. The existing 25 preview covers passed the bounded quality review without below-detail or aspect flags.

The supplied ComicVine page was inaccessible through the available browser and reader. Its terms do not establish a licence for website-cover reuse. Alternate publisher and legacy scan pages provide issue leads, but photo production-use evidence and exact printed-date verification remain outstanding. The separate July 2003 source page was visually inspected locally: its cover shows month 7 and decodes at 750 × 1000, but the full printed year and a direct 014/ADV-P magazine-insert binding were not established. Four sampled Pokemon pages are not proof of a complete issue audit.

Iono's Tadbulb 257/SV-P remains held because direct issue-to-number evidence is missing. Jirachi's July 2003 association has stronger source evidence, but its exact 014/ADV-P binding and the current June conflict remain unresolved. Charizard EX 030/XY-P has an official March 2014 card-page source, but no exact API card UUID was returned by the scoped set query. Historical P/ADV-P queries also remain unresolved. Thirty-one wrong-printing or number-only API results were rejected; these scoped failures do not establish absence from the entire catalogue.

[Additive evidence](corocoro-additive-issue-evidence-20261016.json) preserves the ten later direct-card distributions, the distinct bundled deck and the excluded redemption-ticket distribution. A sixty-card deck does not prove sixty distinct printings. The complete eligible-issue checklist, remaining physical insert/carrier layouts, cover rights, exact historical mappings and finish evidence remain outstanding. No generated or upscaled replacement is used.

## Verification and release limits

Local checks pass: `npm run typecheck`; `npm run lint` (zero errors, eight inherited warnings); all four `test:corocoro-binder` scripts; `test:curated-catalogue`; the individual archive and mobile-delivery regressions; and `git diff --check`. The archive and mobile scripts use the repository's configured tooling runtime. An initial bare strip-types invocation could not resolve extensionless imports; the correct tooling rerun passed.

Meaningful cases cover all six identity fields, wrong printings and set codes, unapproved/bound/shared/unavailable artwork, offline retry, stale Pawmi-to-Tadbulb response isolation, exactly one stable card fetch, held ownership, baseline preservation, the single combined issue, either-month search and its visible placeholder label. Existing account-boundary, truncation, binder management and opening-cancellation regressions continue to pass. Simulated offline failures are expected test assertions.

The independent read-only Stackr reviewer reproduced strict binding, archive, screen and preview checks. Review corrected combined-month search and placeholder/mocked-component label coverage; no unresolved actionable source finding remains. Final parent checks passed after those repairs. Browser checks establish original reveal/skip to an unselected 43-row browser, the combined Meowth issue with its exact official printing link and disabled finish action, and Tadbulb with no printing link and a disabled match action. New source candidates never appear in image elements. The pending-match view has no horizontal overflow at widths 320/390/430/820. Current local receipts are `current-browser-checks.json` and `current-preview-sanity.json`; verified captures are `original-mew-final.jpg` and `exact-printing-final.jpg`.

Browser proof is local preview evidence only. Source tests do not establish the owner's installed iPhone motion or real collection save/restart experience. Opening direction remains an interactive reconstruction rather than physical unsealing proof.

No deployment, main merge, remote database/catalogue mutation, price refresh, native build, OTA publication or TestFlight submission occurred. The separate ordinary-artwork workstream and its production ledger were preserved. Before TestFlight, retain this feature's cover-rights, identity/finish, original-sleeve and installed-device gaps in shared release evidence.

## Unpacking follow-up

[Seven bounded packaging cases and a separate peel-motion study](corocoro-unpacking-study-20261016.md) now distinguish paper packets from card backing sheets. The original Mew benchmark and native source behaviour are preserved. No complete unwrapping sequence was watched; starting corners, carrier seams and hand/extraction movement remain explicit evidence gaps. The local illustrated study uses the supported November 1996 two-card arrangement and does not assign its mechanics to other issues.
