# StackR website source

This directory contains the standalone StackR website, Worker source, database migrations, tests and 7 captured catalogue metadata bundles. It is separate from the native app source at the repository root. Media is held at the recorded public origins; no image, font or PDF library is included here.

Use Node 24 (validated with 24.22.1). The build has no npm dependencies to install.

```sh
npm run restore:media
npm run build
node --test --test-concurrency=2 worker/*.test.mjs
npm run dev
```

Restoration verifies every file's exact byte count and SHA256 before creating it. Existing mismatched files, symlinked paths, unapproved redirects, credentials in URLs and oversized responses are rejected. It never overwrites changed media. To restore from an existing checkout without network access, run `node scripts/restore-media.mjs --restore --offline --from /absolute/path/to/checkout`. A SHA256-named local cache can be supplied with `--cache-dir`. Restored files and generated output are ignored by Git.

`media-manifest.json` records the media identities and approved origins. Some fallback URLs refer to the public Site version 64; a future Site update or removal may stop serving a pinned file. Checksum verification fails closed. Preserve those exact bytes on approved durable media hosting before retiring that Site.

`catalogue-cache/` contains complete public catalogue metadata snapshots and external artwork references, including source-row counts and language/set identities. It contains no user collections or account data. Delta Reign’s 141 numbered English cards are published in the canonical catalogue and can be collected by number. Physical finishes remain unclassified; the source data does not identify holo, reverse-holo or other finish variants. Public activation evidence and its limits are recorded in docs/delta-reign-catalogue-release-20261106.json.

The runtime expects hosting-provided DB and BUCKET bindings and environment variables. No credentials, live database contents or local working logs are supplied. The project association in `.openai/hosting.json` does not deploy anything. Building locally does not apply migrations, enable commerce, publish the website or release an iOS app.

`source-manifest.json` records every exported source file's checksum, the source revision, catalogue checks and media inventory. Run `npm run verify:media` before building and `npm run test:export` to check the restoration safeguards.
