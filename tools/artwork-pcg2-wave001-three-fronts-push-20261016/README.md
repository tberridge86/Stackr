# PCG2 wave001 three shared reference fronts

Publishes the three verified Japanese fronts 008, 010 and 031 from one immutable archive. The publisher preserves all current catalogue values, including null English/category, the holo non-default 008 tuple, both normal default tuples and the existing PCG2 logo/link. Source and asset variant IDs remain null for shared printing fronts.

Production is scoped to 19→25 rows (three assets and three links); staging rehearses 13→20→13 with one temporary inactive Price fixture. All four existing production sources retain all 17 fields and timestamp precision. Raw source observations retain their original null evolution placements and false author flags; separate root readings are hash-bound. No physical edition, finish, provider resolution, optical gain or handset verification is certified.

The protected workflow requires `PUBLISH ARTWORK PCG2 WAVE001 THREE FRONTS`, the exact merged main commit, the production environment and the existing production deployment concurrency group. Its archive is already uploaded; do not upload it again. Local tests and private queue simulation grant no live publication result. Root integrates the queue and dispatches only after independent publisher review.

Offline checks: `node --test tools/artwork-pcg2-wave001-three-fronts-push-20261016/publish.test.mjs`; `python tools/artwork-pcg2-wave001-three-fronts-push-20261016/download-package.test.py`; `node tools/artwork-pcg2-wave001-three-fronts-push-20261016/freeze-local.mjs PRIVATE_EVIDENCE_ROOT`. Live API default/explicit selection and every published image still require verification after publication.
