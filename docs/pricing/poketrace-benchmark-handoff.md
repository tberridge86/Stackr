# PokeTrace/Terapeak private benchmark handoff

This is offline-only tooling. It has no provider client, must not scrape or automate either source, and does not enable PokeTrace or production ingestion.

Keep any manual sample, rights evidence, terms snapshot, and report outside the repository (for example, in a private access-controlled folder). Do not commit provider payloads, terms copies, account data, or raw Terapeak rows. The committed example fixture is synthetic and is only a schema guide.

The two rights-review files remain `pending`. A private-use scope record and internal approval do not substitute for the source-specific written permission required by the operating boundary. Attach that permission and complete the review outside this template before attempting a benchmark.

After the review passes, create a private manifest with the required hashes and attestations, then run:

```
node scripts/benchmark-poketrace-terapeak.mjs --input <private-manual-sample.json> --manifest <private-evidence-manifest.json> --output <private-report.json>
```

The benchmark only reports `activationEligible: true` for an exact, unique, manually reviewed sample meeting the strict thresholds. It does not change any activation flag. Keep the output private; record only reviewed artifact references and hashes where the release process requires them.

Validate the offline tool itself with:

```
node scripts/test-poketrace-terapeak-benchmark.mjs
```
