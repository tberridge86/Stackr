import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = 'e74ef01a7a8d11570daee9bbb6c6922dacf12d02dcc3458b074e40acef885c29';
export const APPROVAL_SHA = 'b1ee32a8af2ef47e69ab6e78af12c9b238c8467a321a6541f26ef63680342b5f';
export const IDENTITY_TABLE_SHA = '75579691c48ee2566e45b8fb91860a4c3fb7ff9a0bf5b2c28c8066dfd61e78c5';
export const SAVED_TARGETS_SHA = 'b93ca3157bc3efe84518ff615e57f2a42a0431a0555c067b5e05bade69edb1f0';
export const SOURCE_MANIFEST_SHA = '0507956d091c670ef84370e2921313eca4e11850d2bd1a6db93cbcf7fb0e2f2f';
export const ARCHIVE_SHA = 'c06a56a780178351698794207b4bae873240ebab274dcb4e36f6561dfb8d5264';
export const ARCHIVE_ID = 641804110;
export const ARCHIVE_BYTES = 1084630;
export const FRONTS = 2;
export const QUEUE_ID = 'STACKR-JA-AWAKENING-FINAL-20261014-002';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'a15481a7-410b-4a98-8695-3bba0db9d226';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "handoff": "64a2bf59198952643cd000ce90da066b22496310a0baaf6b273e8bcfb084e736",
  "subset": "2d16d5ae7c67a1ef2501782bdd2f251991e8038fd5097ebd71830693c8666132",
  "metadata": "f55479b730d141ecaa1af14e8dd1e2ca7eabb00c3da06cb806039d3e9d879eea",
  "sourceQA": "3e3e639506359749c87e28320f0fc15196c39b9744cf1ee57844d97c6fb9daf0",
  "validation": "7ee649538102c7ad404754a1c9abeb0ab841fe9f7c6bcab695edb6e32f6cb401",
  "independentAcceptance": "00755f84b8baa9de2e809bed4dccf40ef25fa53c530e2f989b8408440fa50f5f",
  "decision": "ec414f1e139f7051736aae38ae500e100cd37d9219a3286aa08cc54cb967d8c8",
  "heldTrainers": "909aeadc4233f71fcd4f4c41a2fcaffbcb1aede6e5b9d0efcde960b5e0d11bad"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "6ad6da5c-02cb-45e1-ab7a-2de25855dbf4": {
    "alias": "051",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-51",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-51/large",
    "variant_id": "c563902f-3ed5-41c6-8289-60dbdc121a5b",
    "finish": "holo",
    "current_native_label": "Porygon2",
    "original_sha256": "64ac8b84198f0dcbf4c625edc2f2407f86cdd767d74ee0aa772971fb31bf837b",
    "metadata_sha256": "abad128a0a95f8aee8e052a2aeacf467d504740e2150e12a869fa5f67baa8213",
    "body_sha256": "9bcb6d94277fbc136970978d7702335dd84e031107121d29009e5ed52a2fea32",
    "discrepancies_sha256": "552cfc0f9bc7c534789aec72a1e426c9823dee93e8774c5c382f5d4645e18f29",
    "actual_signature_sha256": "196595e9da0fe40a0ef379190587adee43510751e39c4001e2304675a7ff6cff",
    "source_signature_sha256": "6cb352b31593584223d1336175894138be6c0d90efc330d1ceb9fc67cc457de3",
    "width": 570,
    "height": 794
  },
  "ab2c259c-353a-4317-b075-83f28a24fab2": {
    "alias": "052",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-52",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-52/large",
    "variant_id": "c1935cc0-315e-472d-ac8d-65a2da94674c",
    "finish": "holo",
    "current_native_label": "ブリッシー",
    "original_sha256": "c94cfbe99ed1e5bac2c9464abd9e713b410fe99a00995cc1199419a355a2ff75",
    "metadata_sha256": "6ab686ea25a08de83c3c78f25d648d0cd8887b61b9c9b108e6b1399623d1a278",
    "body_sha256": "93bbd0e86aac580124ea320b7d3401c2686492af5f6256af5aa1b8f716602cd9",
    "discrepancies_sha256": "febfb07f6cb5f04faf129f9084cbb4dd15daaf1f3b3fade852d47c274fdb8cfc",
    "actual_signature_sha256": "d0e9d10dd83625f98bf4ff0a0405daacb3025922e563fdf273f17ade4aaf000b",
    "source_signature_sha256": "27f494627fb11d52d758165f4318dd8be2d2e05b0f368cfc77c647c50395f7ce",
    "width": 570,
    "height": 799
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-012"
  ],
  "saved_batch_tasks": 7,
  "eligible_fronts": 2,
  "by_batch": {
    "JP-CARDS-012": {
      "verified": 2,
      "held": 5
    }
  },
  "excluded_aliases": [
    "053",
    "054",
    "055",
    "056",
    "057"
  ],
  "excluded": [
    {
      "batchId": "JP-CARDS-012",
      "printingId": "ecd63564-d5d4-402d-b28d-95011e2a9107",
      "variantId": "40806ca5-1d4c-4bf6-b499-cee8ff167f94",
      "canonicalCollectorAlias": "053",
      "selectedSourceCardId": null,
      "holds": [
        {
          "code": "trainer_native_body_and_art_not_independently_bound",
          "reason": "The exact current TCGdex target contains category/name/set/rarity only; it omits effects, artist and native rules. Scrydex provides a literal source lead and one native body, but name/set matching alone is not an exact artwork/version/printing bridge.",
          "action": "Any later capture must be quarantine comparison-only. Read full Japanese title, set symbol, artist, frame/header/subtype/rule boxes and complete rule effect before exact canonical artwork binding. Do not prepare or infer printing from alias/order."
        },
        {
          "code": "actual_source_front_verified_but_canonical_trainer_body_art_bridge_missing",
          "action": "Retain this unchanged source original as comparison only. selectedSourceCardId remains null; current canonical artist is null and printing discriminator empty. Independent canonical native body/art/version evidence is still required."
        }
      ]
    },
    {
      "batchId": "JP-CARDS-012",
      "printingId": "f03f92e7-086a-4ec9-8281-e3c88906d13d",
      "variantId": "eaa7573e-3860-440e-be69-cb414e6bbda5",
      "canonicalCollectorAlias": "054",
      "selectedSourceCardId": null,
      "holds": [
        {
          "code": "trainer_native_body_and_art_not_independently_bound",
          "reason": "The exact current TCGdex target contains category/name/set/rarity only; it omits effects, artist and native rules. Scrydex provides a literal source lead and one native body, but name/set matching alone is not an exact artwork/version/printing bridge.",
          "action": "Any later capture must be quarantine comparison-only. Read full Japanese title, set symbol, artist, frame/header/subtype/rule boxes and complete rule effect before exact canonical artwork binding. Do not prepare or infer printing from alias/order."
        },
        {
          "code": "actual_source_front_verified_but_canonical_trainer_body_art_bridge_missing",
          "action": "Retain this unchanged source original as comparison only. selectedSourceCardId remains null; current canonical artist is null and printing discriminator empty. Independent canonical native body/art/version evidence is still required."
        }
      ]
    },
    {
      "batchId": "JP-CARDS-012",
      "printingId": "05ec5ae6-bfb8-41b1-a65b-acb7ce4c3585",
      "variantId": "fc02d833-0de4-4a4d-be84-fe71a9bd0582",
      "canonicalCollectorAlias": "055",
      "selectedSourceCardId": null,
      "holds": [
        {
          "code": "trainer_native_body_and_art_not_independently_bound",
          "reason": "The exact current TCGdex target contains category/name/set/rarity only; it omits effects, artist and native rules. Scrydex provides a literal source lead and one native body, but name/set matching alone is not an exact artwork/version/printing bridge.",
          "action": "Any later capture must be quarantine comparison-only. Read full Japanese title, set symbol, artist, frame/header/subtype/rule boxes and complete rule effect before exact canonical artwork binding. Do not prepare or infer printing from alias/order."
        },
        {
          "code": "actual_source_front_verified_but_canonical_trainer_body_art_bridge_missing",
          "action": "Retain this unchanged source original as comparison only. selectedSourceCardId remains null; current canonical artist is null and printing discriminator empty. Independent canonical native body/art/version evidence is still required."
        }
      ]
    },
    {
      "batchId": "JP-CARDS-012",
      "printingId": "6196aadb-f7bc-4449-8fd3-254987e292f8",
      "variantId": "7d0611e3-9b65-4539-8803-c7a9876f6e68",
      "canonicalCollectorAlias": "056",
      "selectedSourceCardId": null,
      "holds": [
        {
          "code": "trainer_native_body_and_art_not_independently_bound",
          "reason": "The exact current TCGdex target contains category/name/set/rarity only; it omits effects, artist and native rules. Scrydex provides a literal source lead and one native body, but name/set matching alone is not an exact artwork/version/printing bridge.",
          "action": "Any later capture must be quarantine comparison-only. Read full Japanese title, set symbol, artist, frame/header/subtype/rule boxes and complete rule effect before exact canonical artwork binding. Do not prepare or infer printing from alias/order."
        },
        {
          "code": "actual_source_front_verified_but_canonical_trainer_body_art_bridge_missing",
          "action": "Retain this unchanged source original as comparison only. selectedSourceCardId remains null; current canonical artist is null and printing discriminator empty. Independent canonical native body/art/version evidence is still required."
        }
      ]
    },
    {
      "batchId": "JP-CARDS-012",
      "printingId": "56fc9f48-441c-40da-b1a7-29fdbd5300c4",
      "variantId": "767914af-5fcc-4e7c-9304-de89589eb56f",
      "canonicalCollectorAlias": "057",
      "selectedSourceCardId": null,
      "holds": [
        {
          "code": "trainer_native_body_and_art_not_independently_bound",
          "reason": "The exact current TCGdex target contains category/name/set/rarity only; it omits effects, artist and native rules. Scrydex provides a literal source lead and one native body, but name/set matching alone is not an exact artwork/version/printing bridge.",
          "action": "Any later capture must be quarantine comparison-only. Read full Japanese title, set symbol, artist, frame/header/subtype/rule boxes and complete rule effect before exact canonical artwork binding. Do not prepare or infer printing from alias/order."
        },
        {
          "code": "actual_source_front_verified_but_canonical_trainer_body_art_bridge_missing",
          "action": "Retain this unchanged source original as comparison only. selectedSourceCardId remains null; current canonical artist is null and printing discriminator empty. Independent canonical native body/art/version evidence is still required."
        }
      ]
    }
  ],
  "outside_fixed_cohort": [
    {
      "aliases": [
        "022",
        "023"
      ],
      "reason": "Separate unresolved source/current finish conflicts; outside this exact-two scope."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Awakening final two printing');
  check(row.card_native_name === known.current_native_label, 'Current native label must be preserved');
  return known;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved subset size');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong identity table scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    const known = knownFor(row);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)) && row.original_sha256 === known.original_sha256 && row.body_sha256 === known.body_sha256, 'Identity outside accepted fixed subset');
  }
  return table;
}

function validateBody(row, known) {
  const evidence = row.evidence;
  const body = evidence.source_body;
  const actual = body.actual_pixel_signature;
  const pixels = body.actual_pixel_observations;
  const source = body.source_signature;
  check(evidence.source_metadata_sha256 === known.metadata_sha256 && row.objects[0].sha256 === known.original_sha256 && digest(Buffer.from(JSON.stringify(body))) === known.body_sha256, 'Pinned exact-two original/source/public-body changed');
  check(body.generic_other_rows_may_relax === false && body.raw_provider_translations_preserved === true && body.source_signature_sha256 === known.source_signature_sha256 && body.actual_pixel_signature_sha256 === known.actual_signature_sha256 && digest(Buffer.from(JSON.stringify(body.provider_metadata_discrepancies))) === known.discrepancies_sha256, 'Exact raw signatures/provider discrepancies changed');
  check(actual.actualLanguageCode === 'ja' && actual.canonicalCollectorAliasNotPrintedNumber === true && actual.nativeName === pixels.nativeNameObserved && actual.artist === pixels.artistObserved && actual.artistReadCertain === true && actual.nationalDex === pixels.printedNationalDexObserved && actual.hp === pixels.hpObserved && actual.stage === pixels.stageObserved && actual.evolvesFrom === pixels.evolvesFromObserved && actual.retreatSymbols === pixels.retreatSymbolsObserved && actual.nativeAbilityText === pixels.nativeAbilityTextObserved && isDeepStrictEqual(actual.nativeAttackText, pixels.nativeAttackTextObserved), 'Exact native actual-body witness changed');
  check(source.sourceCardId === row.provider_id && body.provider_metadata.id === row.provider_id && source.nativeName === actual.nativeName && Number(source.hp) === actual.hp && isDeepStrictEqual(source.nationalDex, [actual.nationalDex]) && source.artist === actual.artist && isDeepStrictEqual(actual.orderedAttackNames, source.orderedAttacks.map(attack => attack.name)) && isDeepStrictEqual(actual.orderedAttackCosts, source.orderedAttacks.map(attack => attack.cost.map(symbol => symbol === '無' ? 'Colorless' : symbol))) && isDeepStrictEqual(actual.orderedAttackDamage, source.orderedAttacks.map(attack => attack.damage ?? null)), 'Exact source HP/Dex/artist/ordered attack bridge changed');
  if (known.alias === '051') check(pixels.nonColorlessRestrictionActuallyVisible === true && actual.nativeAbilityText.includes('（「無色」以外）') && source.abilities[0].text === actual.nativeAbilityText && actual.retreatSymbols === 1, 'Porygon2 actual Colorless exclusion must survive');
  else check(known.alias === '052' && actual.retreatSymbols === 2 && source.convertedRetreatCost === 1 && body.tcgdex_metadata.retreat === 2 && body.provider_metadata_discrepancies[0].sourceRetreat === 1 && body.provider_metadata_discrepancies[0].actualRetreat === 2, 'Blissey exact source/printed retreat exception changed');
  const controls = body.queue_controls;
  check(controls.identity_controls.canonical_alias === known.alias && controls.identity_controls.current_native_label === row.card_native_name && controls.identity_controls.verified_printed_native_name === actual.nativeName && controls.identity_controls.printed_national_dex === actual.nationalDex && controls.source_qa.original_sha256 === known.original_sha256 && controls.source_qa.source_metadata_sha256 === known.metadata_sha256 && controls.source_qa.actual_pixel_signature_sha256 === known.actual_signature_sha256, 'Actual Japanese queue projection changed');
  check(body.source_variant_support.currentFinishCode === 'holo' && body.source_variant_support.physicalFinishVerified === false && body.physical_edition_verified === false && body.physical_finish_verified === false && actual.editionOrMaterialCertified === false && pixels.editionStampVisible === false, 'Unsupported physical edition/finish claim');
  check(evidence.artwork_scope === 'printing_front' && evidence.source_kind === 'third_party_original' && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false && evidence.owner_business_decision.kind === DECISION && evidence.owner_business_decision.source_wide_approval === false && evidence.owner_business_decision.human_review_required === false, 'Finite exact-two source decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === 'neo3' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.source_code === 'scrydex' && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === 'image/webp' && object.file === `objects/${object.sha256}/${object.role}.webp`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 8, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 2, variants: 2, names: 4, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 0 && cards.filter(card => card.finish_code === 'holo').length === 2, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Awakening final two plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 12 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'ja' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && isDeepStrictEqual(approval.source_evidence, SOURCE_EVIDENCE), 'Exact eligible-subset approval changed');
  return approval;
}

export function requireFinalFreeze() {
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 2, 'Exact accepted Awakening final two archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 6, object_references: 8, unique_image_members: 8, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
