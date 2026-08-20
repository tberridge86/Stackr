{
  "requested_at": "2026-08-19T19:45:00Z",
  "wait_for": "StackR Complete Catalogue Metadata Backfill",
  "target": "staging",
  "strict": true,
  "checks": [
    "provider set coverage",
    "completed deterministic set runs",
    "raw set/card/variant retention",
    "failed and incomplete imports",
    "canonical metadata gaps",
    "open reconciliation conflicts"
  ]
}
