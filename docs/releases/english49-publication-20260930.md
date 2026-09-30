# English 49-front publication

The owner approved this exact cohort in PR261, merged as `33158370fe6961d02b79fecd40702debf54e49c4`. Publication is now complete and independently verified, as recorded below.

Run [36762457639](https://github.com/tberridge86/Stackr/actions/runs/36762457639) attempt 1 stopped before publication because its read-only GitHub token could not download a draft release asset. The preserved, checksum-verified package was published as an [artwork prerelease](https://github.com/tberridge86/Stackr/releases/tag/artwork-english49-review-20260930), explicitly not an app build or the latest release. Archive asset ID, hash and bytes are unchanged. The extracted package passed the secret scan (108 evidence files).

Attempt 2 verified all 196 local image objects, then stopped before uploads or asset/link changes. Its [receipt](english49-attempt2-20260930.json) and [independently verified artifact digest](english49-attempt2-download-20260930.json) preserve that failure. Read-only checks found the exact expected inactive Scrydex provenance in production, but no Scrydex row in staging. The source guard incorrectly assumed staging also contained the prior production-only MEP provenance.

The bounded correction passes the target environment to the existing source resolver. In staging only, the rehearsal inserts an inactive, under-review provenance fixture if absent, checks it with the same strict guard, and rolls it back with the rehearsal. Existing rows are never updated; conflicting rows fail. Production remains read-only for source provenance and fails if that row is absent or changed. Neither source acquisition nor source-wide artwork permission is enabled. All 29 publisher tests pass, including missing staging source, rollback, conflicting source and unchanged production protections.

Frozen scope remains 49 English fronts, 147 derivatives and 196 immutable objects: McDonald's 2014/2015/2017/2018 (12 each), plus Oddish SVP102. Cohort SHA256 `f7478efffa3f74a3e7e07fa768c3a7e34b894bd43693469812d697d9f34f68a8`; archive SHA256 `ac6bb248dee86f9c83b68b25fd9a184470cc717a2a44220fa2c4a71d0adea3d5`. The previous 7,911 cohort is excluded and preserved. No metadata, prices, holdings or existing artwork replacements are authorized by this lane.

## Verified completion

[Run 36764129972](https://github.com/tberridge86/Stackr/actions/runs/36764129972) succeeded on reviewed source `57502c11220e4bf6fb15ff124b1d322ade2f52bc` (PR264; eight applicable CI checks passed, release-candidate gate skipped). Both 49-asset/49-link rehearsals passed and rolled back before publication. All 196 immutable files were created and publicly verified, then 49 asset/link associations were committed and read back. The final artifact SHA256 is `2a7529fb7825395c1d934afc3680b1d456a7c10d5c9d7582b52d123b1fca4c07`.

Independent verification passed for every **49/49 public card identity/front/three-derivative manifest** and **196/196 image byte hashes, formats and dimensions**. First reads encountered six connection failures and 16 storage HTTP 429 responses; failed-only slower retries all passed. The earlier multilingual continuity sample passed **30/30**, including one failed connection retried successfully. These transient delivery failures remain in the evidence; this is not universal instant-retrieval proof.

Fresh database readback confirms **7,911 earlier assets/printings/links/manifest entries plus 49 new ones**, totalling **7,960 published fronts**, **23,880 derivative references** and **31,786 distinct stored objects** across the two disjoint frozen plans. The staging fixture is absent after rollback; production Scrydex remains inactive and under review with its prior notes unchanged. Metadata, prices and holdings were not rewritten. No app build or device acceptance is claimed.

[Completion receipt](english49-published-20260930.json), [production journal](english49-production-receipt-20260930.json), and [independent API, image, database and continuity evidence](english49-live-verification-20260930.json).

Still separate: **4,201 artwork cases**, **94 sets without published card checklists**, the six Gym-pack display links, Scarlet & Violet Energies grouping, and 30thD/30thDC cover/alias work. Pricing/device exceptions and the October 1 TestFlight continuation are unchanged. This is completion of the approved 49-front batch, not a claim of catalogue-wide completeness.
