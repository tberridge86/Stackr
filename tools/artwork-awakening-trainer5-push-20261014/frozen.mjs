import { readFile } from 'node:fs/promises';
import { canonicalHash, projectQueueControls, publicationBody } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '1adf9a3944f5b759f0d890307698f360608146a02f91a983dd8543814a6eba4e';
export const APPROVAL_SHA = '35d222f6c256fc8907e0cf2badaeafefb7a29056ea60e4d3d8db443791e37d8d';
export const IDENTITY_TABLE_SHA = '95b7016423012664c70a231a663bc596a89730055ff5721cd1abd9bb487ee0f7';
export const SAVED_TARGETS_SHA = '4ea6decdd4a8ac4039d08ee01d025f712c1197e8b2e6fc05780a93420e035f8b';
export const SOURCE_MANIFEST_SHA = '123b451711828a642beb2c606f0510cc6689314e6f8dca9298a46c7c4b535882';
export const ARCHIVE_SHA = '8bf11edd817e085632c008dce15ed0ef68e7ad3e582966f7f10613b3978572f2';
export const ARCHIVE_ID = 641944947;
export const ARCHIVE_BYTES = 2310785;
export const FRONTS = 5;
export const QUEUE_ID = 'STACKR-JA-AWAKENING-TRAINERS-20261014-005';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'a15481a7-410b-4a98-8695-3bba0db9d226';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "301f506f278d6558e8948e73b3922f7a9991d439cd8495fc31a3b3a4fce46bc9",
  "decision": "a8611b59bf68d9a3c76107e9b7dc2bcd56f8c42858eed643208673d5d363627a",
  "independentSelection": "468eee32291b9a36b950974671c0d8094d9d1be855fbab204a5463604d2d781d",
  "independentAcceptance": "d5694683f9ea22b1e441b4231fc969153e3079143d1117213f85f8e534b857a8",
  "referenceHandoff": "01da4d6d0e2ebe40d1b2225119e70b09bbb09a49516e607fa4327210fdabceaa",
  "metadata": "f55479b730d141ecaa1af14e8dd1e2ca7eabb00c3da06cb806039d3e9d879eea",
  "historicalHeld": "909aeadc4233f71fcd4f4c41a2fcaffbcb1aede6e5b9d0efcde960b5e0d11bad"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "ecd63564-d5d4-402d-b28d-95011e2a9107": {
    "alias": "053",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-53",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-53/large",
    "variant_id": "40806ca5-1d4c-4bf6-b499-cee8ff167f94",
    "finish": "normal",
    "current_native_label": "古い棒",
    "original_sha256": "8122a558912c72cef5c4b7b14591becae892a78f776ce530748b032909ce3f99",
    "metadata_sha256": "88d2dd93143a7ddc5217c772f4582789062a7214a9c7e6606020da272feefcc1",
    "body_sha256": "489a1a52e410f44171d7fd623bbbabb9ed51992c12d6e6198feb2faca78ef650",
    "actual_signature_sha256": "04214630bcf38e92c1c07d431bff69140799ff6481acabeb996d50010e54b998",
    "source_signature_sha256": "703c7346abca1b7f589313d32ddb05ace0045576094a9ef32f5f98cb39eebb79",
    "provider_identity_projection_sha256": "b64298e2a7b0a1fb7a912f7a9951f2920c193b2e36c32f1bac216e1db97d6ebd",
    "full_captured_json_sha256": "f562c98e933905c90aeded5e8b1184794fdf4fb74dfa0da757fef08d568c0170",
    "historical_source_row_sha256": "59a268cdaae93bf1cec0e0582ada81a7bc13330e09b62677f04db8a0e4b902ea",
    "raw_selection_sha256": "2cbd0e91c4914da758f4a4459de5273e8fe927ad9361717ccc336cf33da84567",
    "public_selection_sha256": "2e2e77c700329e370af0409dbd82d28cc34d0e7266235e69410c7bba46ab1b22",
    "reference_sha256": "24a17af7ec0ab980b787160da45313c03dc73f3a7ec05236610b2cc36fd134c2",
    "width": 570,
    "height": 797
  },
  "f03f92e7-086a-4ec9-8281-e3c88906d13d": {
    "alias": "054",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-54",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-54/large",
    "variant_id": "eaa7573e-3860-440e-be69-cb414e6bbda5",
    "finish": "normal",
    "current_native_label": "ヒーリングフィールド",
    "original_sha256": "3b1abb921c0e67ef8aa7de076859d1b920caa22ce4e9d962bc2639965e7af7ed",
    "metadata_sha256": "c285981dc65234cb03399e21de5df38224372d8f8fc29373b6bdfac29c228a89",
    "body_sha256": "f4d407fad5146b9f93ea2cc764e84050c72a108d826f14f552a1e3d533de2623",
    "actual_signature_sha256": "86b5fe99d1593b47a991f0bbd0957f61b8abe5556e0087e2cec6ac8d65f2863c",
    "source_signature_sha256": "1fcaa9c1f1020f608cbe13d65749d244747389d9181f2b7bede11adf2687d826",
    "provider_identity_projection_sha256": "e54ccea51f7c320e3584036db17552039a828a2886d5b4c41e32a930aa65430f",
    "full_captured_json_sha256": "31cf79c270f908acd04cc1db0f30f27bfe47b9936a757cb04bf5d4f9ac59168f",
    "historical_source_row_sha256": "d39f10628a75c62709ea70cbdde2ccb4ebdbc3c8b3c874cf55fd2cb5fdffa817",
    "raw_selection_sha256": "f99aedc217a4f4e2c2784636346d36c6c1e1d91c865deffaea386ad80f446331",
    "public_selection_sha256": "2b615c1b4e6872f6e5c58c2d01305ff5bdfddd6f5238cf4e5b111880a981f0f2",
    "reference_sha256": "e70bf0542992f42252fbd8e4a94c2c6918d1ece042f60069fe95afcae0ec841a",
    "width": 565,
    "height": 800
  },
  "05ec5ae6-bfb8-41b1-a65b-acb7ce4c3585": {
    "alias": "055",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-55",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-55/large",
    "variant_id": "fc02d833-0de4-4a4d-be84-fe71a9bd0582",
    "finish": "normal",
    "current_native_label": "バルーンベリー",
    "original_sha256": "f350108c698a80ae0fc2aaf67d694672a4de04bd016a3a098ab6ca65e6dbbfcf",
    "metadata_sha256": "74a00eca887b267057d3cca3e518298cdeac73709bec7631ef37084b68632a72",
    "body_sha256": "812834ca4fddabfd0ffd01a0c5cbc0aab362342051f05166aa0cc4ae8a7d79fc",
    "actual_signature_sha256": "707576c3c2659db791833a22436b92a615bfd029a6224565a5f202a27061012e",
    "source_signature_sha256": "e4165928daf60b0e5c040f1d7ae9aecbac213aecbaaf748f21d72ff78fc49f6e",
    "provider_identity_projection_sha256": "3155ba7db22d6f170ffa1fd38738ef4ebdefb76f5e98f7cb73c0ac285a0eb938",
    "full_captured_json_sha256": "551f2b0633772be91e72b1f3ed37fe54efc8a8a3f0bc6655d91773d59fdf10f8",
    "historical_source_row_sha256": "2e0278378736bb4bbe5f9453fada3cc8f635895588670291629a5d343075a319",
    "raw_selection_sha256": "e6573b88a031a40773f4151147468364054d459e0240551e289a7d2f84abf88b",
    "public_selection_sha256": "ca1a9bb02bc7c09f2cf24e8bf72eb69ebea65a1458b86ae8741490a33e04755e",
    "reference_sha256": "88defdcb353c49559b721119dff9976ad8efb6bc715182116d998537ba4aa74f",
    "width": 570,
    "height": 792
  },
  "6196aadb-f7bc-4449-8fd3-254987e292f8": {
    "alias": "056",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-56",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-56/large",
    "variant_id": "7d0611e3-9b65-4539-8803-c7a9876f6e68",
    "finish": "normal",
    "current_native_label": "ポケモンブリーダーフィールド",
    "original_sha256": "30f797b81043589bffd3e9c7af4ead32f97b6980d38868c90b4d0ef09207005c",
    "metadata_sha256": "1865115c60cd1b5c84a9cd61dcc014757bfff740544c5528113a9d3dc041ae72",
    "body_sha256": "cb0344fe577068e70c62dc0c0761e929f975ddf4389311ef8ac6870da1bf493f",
    "actual_signature_sha256": "dd257d0826649c07a899e9a0018c6b116b7856350b3417c07484e07ff8b5f074",
    "source_signature_sha256": "837e10f52eed4327fb9c849ccfd945dc21f1ff7d888c32d8ac7a8b6b76dc6ba0",
    "provider_identity_projection_sha256": "5cdd6c7da12ed2a3b0263c45338ae80e1836b6840b11783a236ba370d4c24c95",
    "full_captured_json_sha256": "c2086e43176665b65023938ae23e784696249492f76c6af5b6c586d03d703262",
    "historical_source_row_sha256": "2ee1190bca52acf357587706af2efd65e6308e390a0d3852ea6256ba2783326e",
    "raw_selection_sha256": "b1870716a1b20ea5a028f1b293367fbce11b15c10da2eb924b3677c50ee1bda1",
    "public_selection_sha256": "8b7a4638732baad3d6dd145750f29b95cbcdce5a571d0cc1a59a94751927fe7f",
    "reference_sha256": "30af8e4bdc0ec95fd79062ec3f7839b595da81cdabf9f9dc0c6d8e90e84867aa",
    "width": 569,
    "height": 800
  },
  "56fc9f48-441c-40da-b1a7-29fdbd5300c4": {
    "alias": "057",
    "batch_id": "JP-CARDS-012",
    "provider": "neo3_ja-57",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-57/large",
    "variant_id": "767914af-5fcc-4e7c-9304-de89589eb56f",
    "finish": "normal",
    "current_native_label": "ロケットの隠れ家",
    "original_sha256": "bcabdcf132f2d8fd1f855b4f4bb1c2e52be53f28225ae0e19f0f9310757143be",
    "metadata_sha256": "5382f243a43ef7619860e76a6f2eb4f94a98006997b256d0f819687306d06d5a",
    "body_sha256": "508a2a240195afc48da173a86e64da80d32ac27ccd7e64ef8da5267f115538c0",
    "actual_signature_sha256": "bad7816a659c707034e8104f37a42ca62373924d0971c5b45a89fd2a72c34fef",
    "source_signature_sha256": "8af2b6c1e8ddedc26062a0a991cb0df6064662af110dd4a3c74635c5a64dc75c",
    "provider_identity_projection_sha256": "71325c35bcd98cba4a1286dce586ce7b03fa7b4587af0c9ce3185ef9f5be9876",
    "full_captured_json_sha256": "827590fcd47be45d9807506c9cc1521a5af75b172a3b2a933e471877a6348cfb",
    "historical_source_row_sha256": "023b989fbe5c5a63a249745b6f2b263f83eff14355c3bfab476d7a4d4b5d3270",
    "raw_selection_sha256": "3ff6db6e9bf2c3e1b7b500d9aa6f14eb45ca20c6dbaf8f27cd742a3fc7e7ca34",
    "public_selection_sha256": "bfe5dba77927a7afaaa61ec3cb0c42045b5309e8122c97ee4060974c40620b03",
    "reference_sha256": "f9e142056d04489c4566ce10f555ed12c216dbddd6cfc4ee601f59e112558680",
    "width": 564,
    "height": 800
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-012"
  ],
  "saved_batch_tasks": 5,
  "eligible_fronts": 5,
  "by_batch": {
    "JP-CARDS-012": {
      "verified": 5,
      "held": 0
    }
  },
  "excluded_aliases": [],
  "excluded": [],
  "outside_fixed_cohort": [
    {
      "aliases": [
        "051",
        "052"
      ],
      "reason": "Previously published Pokemon pair; already complete outside this finite Trainer5 scope."
    },
    {
      "aliases": [
        "022",
        "023"
      ],
      "reason": "Separate unresolved source/current finish conflicts outside JP-CARDS-012 and this finite scope."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Awakening Trainer5 printing');
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
  const evidence = row.evidence, body = evidence.source_body;
  const actual = body.actual_pixel_signature, source = body.source_signature;
  const selection = body.independent_selection, direct = selection.independentDirectObservation;
  const provider = body.provider_metadata_identity_projection;
  check(evidence.source_metadata_sha256 === known.metadata_sha256 && row.objects[0].sha256 === known.original_sha256 && digest(Buffer.from(JSON.stringify(body))) === known.body_sha256, 'Pinned exact Trainer original/source/public body changed');
  check(body.provider_metadata_raw_html_sha256 === known.metadata_sha256 && body.provider_metadata_full_captured_json_sha256 === known.full_captured_json_sha256 && body.provider_metadata_identity_projection_sha256 === known.provider_identity_projection_sha256 && canonicalHash(provider) === known.provider_identity_projection_sha256 && provider.id === known.provider, 'Raw/full-provider hashes or derived identity projection changed');
  publicationBody(body);
  check(canonicalHash(source) === known.source_signature_sha256 && body.source_signature_sha256 === known.source_signature_sha256 && canonicalHash(actual) === known.actual_signature_sha256 && body.actual_pixel_signature_sha256 === known.actual_signature_sha256, 'Untouched Trainer source/actual signatures changed');
  check(body.historical_source_row_canonical_json_sha256 === known.historical_source_row_sha256 && body.historical_association.selected_source_card_id === null && body.historical_association.quarantine_comparison_only === true && body.historical_association.holds.length > 0 && body.historical_association.canonical_artist_and_body_missing_retained === true, 'Historical null source/holds and missing canonical body/artist changed');
  check(body.independent_selection_raw_canonical_json_sha256 === known.raw_selection_sha256 && body.independent_selection_public_canonical_json_sha256 === known.public_selection_sha256 && canonicalHash(selection) === known.public_selection_sha256 && body.current_acceptance.source_card_id === row.provider_id && body.current_acceptance.exact_unnumbered_japanese_trainer === true && body.current_acceptance.independently_accepted === true, 'Separate exact public reference acceptance changed');
  check(actual.actualLanguageCode === 'ja' && actual.header === 'TRAINER' && actual.hp === null && actual.stage === null && actual.evolvesFrom === null && actual.nationalDex === null && actual.retreatSymbols === null && actual.canonicalCollectorAliasNotPrintedNumber === true, 'Unnumbered Trainer cannot borrow Pokemon identity fields');
  check(actual.orderedAttackNames.length === 0 && actual.orderedAttackCosts.length === 0 && actual.orderedAttackDamage.length === 0 && actual.abilityNames.length === 0 && actual.nativeRulesText.length > 20 && actual.artistReadCertain === true && actual.setSymbolObserved === true, 'Complete Trainer rules/artist/subtype required');
  check(selection.referenceEvidence.original.sha256 === known.reference_sha256 && selection.referenceEvidence.role === 'Identity comparison evidence only; not a production image source' && direct.sourceSha256 === known.original_sha256 && direct.referenceSha256 === known.reference_sha256 && direct.sourceReferenceExactPrintedFrontMatch === true && direct.actualTitle === actual.nativeName && direct.artist === actual.artist && direct.subtype === actual.printedSubtype, 'Reference image/body substitution or source/reference confusion');
  const controls = projectQueueControls({ canonicalCollectorAlias: known.alias, currentNativeLabel: row.card_native_name, original: { sha256: known.original_sha256 }, sourceMetadataCapture: { sha256: known.metadata_sha256 }, actualPixelSignature: actual, actualPixelSignatureSha256: known.actual_signature_sha256, independentSelection: selection });
  check(isDeepStrictEqual(body.queue_controls, controls), 'Trainer-specific top-level Japanese controls changed');
  if (known.alias === '053') check(actual.nativeName === 'ボロのつりざお' && selection.referenceEvidence.pageJapaneseLabelConflict.pageJpnLabel === 'オールドロッド', 'Actual title and inaccurate page search label must remain separate');
  if (known.alias === '057') check(actual.nativeRulesText.includes('「わるい」') && actual.nativeRulesText.includes('「20」') && !actual.nativeRulesText.includes('R団') && provider.rules.some(rule => rule.includes('R団のポケモン')), 'Printed Dark-only HP+20 versus source extra Team Rocket category required');
  check(body.generic_other_rows_may_relax === false && actual.editionOrMaterialCertified === false && body.physical_edition_verified === false && body.physical_finish_verified === false && body.source_variant_support.currentFinishCode === 'normal' && body.source_variant_support.physicalFinishVerified === false, 'Unsupported physical or generic exception claim');
  check(evidence.artwork_scope === 'printing_front' && evidence.source_kind === 'third_party_original' && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false && evidence.owner_business_decision.kind === DECISION && evidence.owner_business_decision.source_wide_approval === false && evidence.owner_business_decision.human_review_required === false, 'Finite exact Trainer approval changed');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 20, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 5, variants: 5, names: 10, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 5 && cards.filter(card => card.finish_code === 'holo').length === 0, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Awakening Trainer5 plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 24 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 5, 'Exact accepted Awakening Trainer5 archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 15, object_references: 20, unique_image_members: 20, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
