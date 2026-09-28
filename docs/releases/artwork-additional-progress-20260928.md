> Superseded checkpoint. All preparation runs are complete; use [the final 7,911-front approval packet](artwork7911-approval-ready-20260928.md) and its 4,250-record exception list.

# Additional artwork preparation — active checkpoint

Measured 28 September 2026 at 21:02 UTC. This is ongoing preparation, not a production delivery receipt.

- Original recovered release: 3,303 fronts and 9,909 derivatives, unchanged frozen plan `d047cb0475f5b676f2ee6e3bdab27352a3d5cad4c462b41e9acbf368014ee259`.
- Additional verified at this checkpoint: 2,103 fronts and 6,309 derivatives, including all 47 English Pocket references. Combined: 5,406 fronts and 16,218 derivatives.
- All 4,611 additional candidate identities match both production and staging (4,889 variant rows). No same-artwork references. Separate saved preflight receipts contain exact results.
- Production has no visible manifest artwork for these candidates. The 47 existing unavailable asset rows are preserved. No production writes.
- Exactly 4,247 records outside these two cohorts are classified in `artwork4247-source-and-identity-exceptions-20260928.json.gz`: 3,530 exact source needed; 50 unavailable provider images; 2 insufficient resolution; 605 language conflicts; 33 denominator conflicts; 20 artwork choices; 7 native-name/provider identity conflicts.
- Source permission flags and final publication approval remain pending. Additional files still require frozen release integration and a staging rollback rehearsal before asking for final push approval. The existing 3,303 plan and its evidence remain intact.

## Active runs — continue these, do not restart successful acquisition

1. [First Taiwanese pass, complete](https://github.com/tberridge86/Stackr/actions/runs/36480589353): all 4,564 checked; 890 fronts prepared, remaining candidates preserved with exact reasons.
2. [Corrected retry and 47 Pocket fronts](https://github.com/tberridge86/Stackr/actions/runs/36482384653), source `1087ea1d29db5c702a92fcdb581120b444ac4c2a`: running. Retries only failed cards from the immutable first-pass evidence. The Pocket job passed 47/47.
3. [Final SV3 symbol-format retry](https://github.com/tberridge86/Stackr/actions/runs/36482868316), source `ffa2c9dc4fa5f0f12b67ea8f8bd6fdf056ae942b`: queued behind the preceding run, only its failed batch 16/17 rows.

The abandoned pending run 36481708250 never acquired files; it was replaced before starting to include verified promo-series and printed energy-code formats. The active retry's V-UNION number mismatches are genuine review exceptions, not relaxed matches.

## Continuation

Use `tools/artwork-review-20260928/fetch-evidence.py` to download the small evidence ZIPs by immutable ID with SHA-256/size checks. Then use `build-ledger.py` to account once for all 12,161 baseline IDs, and `freeze-additional.py` to prepare the supplementary object plan and download/checksum list. These tools never publish.

The local workspace is `../artwork-publication-3303`; saved evidence is `additional-evidence/<run>/`; the joined records are in `complete-ledger/`. `additional-plan-checkpoint/` currently holds a partial 2,103-front frozen plan and must be regenerated after every active run completes. Do not treat failed records awaiting their active retry as final manual exceptions.

Keep metadata, holdings, pricing, finish attributes and existing artwork untouched. The initial 12,161 denominator is a saved artwork-gap worklist, not proof of missing card metadata or whole-catalogue completeness. Installed-client rendering and request latency are not measured here.
