# Japanese Crossing the Ruins artwork

This frozen publisher contains 51 accepted Japanese Pokémon fronts from 57 fixed
tasks: 25 from `JP-CARDS-007`, 24 from `JP-CARDS-008` and two from `JP-CARDS-009`.
Six tasks remain excluded. Alias `049` returned an English Eevee 38/75 front;
`053`, `055` and `056` lack exact Trainer identity bindings; Wall-art variants
`054` and `057` were not captured. The complete 55-capture source evidence and
all exclusions remain outside the image package. Partial batches stay partial.

Every printing, current native name, singleton variant, catalogue alias, source
URL, original hash and observed full body is frozen. Printed National Dex numbers
remain separate from catalogue aliases. Production uses Japanese version
`1a23b7a7-c50e-4601-9180-a25c950d27ea`; staging uses
`d560cd01-de2a-4713-9518-b967fb4c5ac9`. This is their sole binding difference.
The exact metadata scope is 31 normal and 20 holo variants. No current names,
forms, variants, metadata, source policies, ownership or prices are corrected.

Ten exact rows retain provider/pixel discrepancies: aliases `015`, `019`, `025`,
`026`, `027`, `033`, `036`, `043`, `045` and `050`. Every exception is bound to
its printing, unchanged original SHA, retained metadata SHA and complete body
SHA. Ordinary rows retain strict artist, name, stage and ordered cost/damage
checks. The actual Scizor first damage column is blank, while the source reports
`?`; its second column is `20+` and the observed body adds 20 per heads. The full
observed artist on `043` is `K. Hoshiba / CR CG gangs`. Actual attack orthography,
Unown target effects, Sandstorm's exclusion of Fighting Pokémon and Baby-rule /
evolution direction remain separate from provider text and paraphrases.

Only the two root-approved D/F cross-bindings use the explicit correction receipt
`0820a366b34ae46c9667e98230651f29a7be10740f44a7e2b4299b7a15cf7153`
and approval
`d1bcbe07659f0e0b71ac79d91a84cdf547dece34b4f558b7bf99c33455fd7a99`.
Canonical `025` retains actual D / DARK df; canonical `026` retains F / FIND.
Their wrong provider titles/effects and initial crossed request associations
remain historical evidence. Complete glyphs, abilities and ordered attacks are
pinned for all six Unown forms. No other row inherits these exceptions.

The finite decision is
`9bff75f8339e88b45eb9b590484b4f8d876f72e355dd4293660f57684ddc47c0`.
The accepted 51-row subset is
`05c0f6681346d6b316958f30772b53c63f7fb7f167556b808a068e01854aeb22`;
the complete handoff is
`f7610d61a4c2ccdeab8cba87cacd2eaca7edbe350e94c2e576228cc5a0a45ada`.
All 131 named frozen source file hashes were checked locally. Source capture
used 55 bounded original GETs, with no automatic retry or additional fallback
image request. Scrydex's provided-image app use and local-hosting documentation
is retained. Independent vendor licence, source-wide approval, physical edition
and physical finish remain false. Scrydex stays inactive and under review.

All 51 unchanged WebP originals are readable at the detail minimum and below the
HD threshold. Outer scan-edge irregularities remain; aspect ratio does not prove
cropping. No copyright/date line was claimed and no year is inferred from the
expansion release date. The accepted Sharp 0.35.5 pipeline produces 240px/Q82
grid, 96px/Q78 search and at-most-720px/Q86 detail files without enlargement.
The unchanged pipeline hash is
`642eb05d57c921901cfa6241e1f0d32a71da602ea3594693b8d63247a05b0bb0`.

Immutable release asset `641543488` contains
`stackr-ja-artwork-crossing-ruins-fronts51-20261014.zip`, 27,170,559 bytes, SHA-256
`2bbfdde7b2cb5c7619bf272b24ec6cc3b90af1c4d24abb6cd405c98c18adc492`.
Its exact 208 members contain 51 originals, 153 derivatives and four metadata
files. Every member hash and size is checked before extraction; corrupt images,
changed metadata, duplicates, extra members, traversal, symlinks, encryption and
oversized entries fail. All 204 image files were fully decoded locally.

The protected `artwork-crossing-ruins51-production.yml` workflow requires
`PUBLISH ARTWORK CROSSING RUINS 51`, the exact main revision, the production
environment and shared production deployment concurrency. It reuses eleven
unchanged transaction/source/metadata dependencies. Staging and production
rehearsals roll back. Private full baselines contain 213 production rows and
209 staging rows: 51 printings, 51 variants, 102 names, one set, two set-mark
assets, five production/two staging links and one production source. Every old
row remains. There are no existing scoped card images; staging needs only a
rollback-only Scrydex source fixture. No artwork visibility fixture is needed.

Production inserts only journalled new front assets and catalogue links.
Immutable objects, bounded transfers, failure journals, private-output isolation
and public manifest/byte checks are retained. A secret scan must pass before
hosted evidence upload. Receipt-bound rollback SQL can hide only new cohort
assets using exact UUID, printing, content SHA and cohort predicates; old assets,
objects, links and source policies remain. Rollback is prepared, not executed.

Focused checks from the repository root:

```text
node --test tools/artwork-crossing-ruins51-push-20261014/publish.test.mjs tools/artwork3303-publish-20260928/publish.test.mjs tools/artwork3303-publish-20260928/native-name-corrections.test.mjs
python tools/artwork-crossing-ruins51-push-20261014/download-package.test.py
node --test tools/artwork3303-publish-20260928/journal.integration.test.mjs
python tools/artwork-crossing-ruins51-push-20261014/download-package.py <packages> --archive <frozen-local-zip>
node tools/artwork-crossing-ruins51-push-20261014/verify-packages.mjs <packages>
```

`freeze-local.mjs` is offline and never runs in production. `before-query.sql`
contains bounded read-only private evidence queries. `validation.json` records
actual checks and hashes. Review, hosted checks, production publication, current
API/image proof and installed-device acceptance remain separate delivery gates.
