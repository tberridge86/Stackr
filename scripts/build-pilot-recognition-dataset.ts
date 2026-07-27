import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DATASET_VERSION = 'stackr-pilot-recognition-dataset-v1.0.0';
const GENERATED_AT = '2026-07-26T00:00:00.000Z';
const SCANNER_PACK_MANIFEST = 'backend/data/scanner-packs/en-clip-base-v1/manifest.json';
const PROVIDER_PROBES = 'tmp/foreign-card-audit/provider-image-probes.json';
const SCAN_LAB_REVIEWED_MANIFEST = process.env.STACKR_PILOT_SCAN_LAB_MANIFEST
  ?? 'ml/data_manifests/scan-lab-reviewed-training-manifest.json';
const OUT_MANIFEST = process.env.STACKR_PILOT_OUT_MANIFEST
  ?? 'ml/data_manifests/pilot-dataset.parquet';
const OUT_HARD_NEGATIVES = process.env.STACKR_PILOT_OUT_HARD_NEGATIVES
  ?? 'ml/data_manifests/hard-negative-groups.json';
const OUT_REPORT = process.env.STACKR_PILOT_OUT_REPORT
  ?? 'ml/reports/pilot-dataset-report.html';

type DatasetSplit = 'train' | 'validation' | 'test';

type ScannerPackCard = {
  id: string;
  name: string;
  language?: string | null;
  setId?: string | null;
  setName?: string | null;
  number?: string | null;
  printedTotal?: number | null;
  rarity?: string | null;
  imageSmall?: string | null;
};

type SourceImage = {
  sourceImageId: string;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  language: string;
  collectorNumber: string;
  printedTotal: string;
  variant: string;
  era: string;
  difficulty: 'easy' | 'normal' | 'hard' | 'near_identical';
  sourceType: 'scanner_pack_reference' | 'provider_probe_reference' | 'scan_lab_reviewed_capture';
  sourceUri: string;
  sourceUriKind: 'remote_url' | 'supabase_storage_path';
  rightsStatus: 'existing_stackr_reference_not_redistributed' | 'needs_license_confirmation' | 'user_consent';
  provenanceStatus: 'included_metadata_only' | 'reviewed_real_capture' | 'excluded';
  labelVerificationStatus: 'metadata_verified' | 'probe_verified' | 'reviewed' | 'verified';
  realPhoneCapture: boolean;
  approvedForTrainingPixels: boolean;
  physicalCardSessionId: string;
  splitHint: DatasetSplit | '';
  notes: string;
};

type AugmentationRecipe = {
  key: string;
  family: string;
  label: string;
  synthetic: boolean;
  params: Record<string, unknown>;
  humanRecognisable: boolean;
};

type DatasetRow = SourceImage & {
  rowId: string;
  datasetVersion: string;
  split: DatasetSplit;
  viewId: string;
  viewKind: 'source_reference' | 'synthetic_controlled_view';
  augmentationKey: string;
  augmentationFamily: string;
  augmentationParamsJson: string;
  syntheticView: boolean;
  hardNegativeGroupIds: string;
};

type HardNegativeGroup = {
  groupId: string;
  type: string;
  status: 'represented' | 'blocked_no_approved_source';
  difficulty: 'hard' | 'near_identical';
  members: Array<Pick<SourceImage, 'sourceImageId' | 'cardId' | 'cardName' | 'setId' | 'language' | 'collectorNumber' | 'variant'>>;
  reason: string;
  notes: string;
};

type ScanLabReviewedExample = {
  id?: string | null;
  physicalCardSessionId?: string | null;
  split?: DatasetSplit | null;
  reviewStatus?: string | null;
  labelVerificationStatus?: 'reviewed' | 'verified' | string | null;
  originalPhotoStoragePath?: string | null;
  rectifiedCardStoragePath?: string | null;
  originalPhotoChecksumSha256?: string | null;
  rectifiedCardChecksumSha256?: string | null;
  expectedIdentity?: Record<string, unknown> | null;
  userConfirmedIdentity?: Record<string, unknown> | null;
  deviceInfo?: Record<string, unknown> | null;
  lightingCategory?: string | null;
  sleeveState?: string | null;
  holderState?: string | null;
  cardSide?: string | null;
};

type ScanLabReviewedManifest = {
  examples?: ScanLabReviewedExample[];
  leakageChecks?: {
    physicalCardSessionLeakage?: boolean;
    leakedPhysicalCardSessionIds?: string[];
  };
  limitations?: string[];
};

type ParquetField =
  | { id: number; type: 'i32'; value: number }
  | { id: number; type: 'i64'; value: number }
  | { id: number; type: 'string'; value: string }
  | { id: number; type: 'struct'; value: Buffer }
  | { id: number; type: 'i32list'; value: number[] }
  | { id: number; type: 'stringlist'; value: string[] }
  | { id: number; type: 'structlist'; value: Buffer[] };

const AUGMENTATIONS: readonly AugmentationRecipe[] = Object.freeze([
  {
    key: 'source_reference',
    family: 'clean_reference',
    label: 'Clean reference view',
    synthetic: false,
    params: { transform: 'none' },
    humanRecognisable: true,
  },
  {
    key: 'perspective_rotation',
    family: 'perspective_rotation',
    label: 'Perspective rotation',
    synthetic: true,
    params: { yawDegrees: 9, pitchDegrees: -6, rollDegrees: 3 },
    humanRecognisable: true,
  },
  {
    key: 'partial_crop',
    family: 'partial_crop',
    label: 'Partial crop',
    synthetic: true,
    params: { cropTopPct: 0.02, cropLeftPct: 0.015, preservesCollectorNumber: true },
    humanRecognisable: true,
  },
  {
    key: 'motion_blur',
    family: 'motion_blur',
    label: 'Motion blur',
    synthetic: true,
    params: { radiusPx: 2.2, angleDegrees: 11 },
    humanRecognisable: true,
  },
  {
    key: 'focus_blur',
    family: 'focus_blur',
    label: 'Focus blur',
    synthetic: true,
    params: { gaussianRadiusPx: 1.5 },
    humanRecognisable: true,
  },
  {
    key: 'jpeg_compression',
    family: 'jpeg_compression',
    label: 'JPEG compression',
    synthetic: true,
    params: { quality: 58, chromaSubsampling: '420' },
    humanRecognisable: true,
  },
  {
    key: 'exposure_changes',
    family: 'exposure_changes',
    label: 'Exposure changes',
    synthetic: true,
    params: { exposureEv: -0.45, contrast: 1.08 },
    humanRecognisable: true,
  },
  {
    key: 'warm_white_balance',
    family: 'white_balance',
    label: 'Warm white balance',
    synthetic: true,
    params: { temperatureShiftKelvin: 900, tint: 0.04 },
    humanRecognisable: true,
  },
  {
    key: 'cool_white_balance',
    family: 'white_balance',
    label: 'Cool white balance',
    synthetic: true,
    params: { temperatureShiftKelvin: -800, tint: -0.03 },
    humanRecognisable: true,
  },
  {
    key: 'uneven_lighting',
    family: 'uneven_lighting',
    label: 'Uneven lighting',
    synthetic: true,
    params: { leftFalloff: 0.22, rightBoost: 0.14 },
    humanRecognisable: true,
  },
  {
    key: 'soft_shadows',
    family: 'soft_shadows',
    label: 'Soft shadows',
    synthetic: true,
    params: { shadowOpacity: 0.18, blurPx: 22, offsetPct: 0.08 },
    humanRecognisable: true,
  },
  {
    key: 'moderate_glare',
    family: 'moderate_glare',
    label: 'Moderate glare',
    synthetic: true,
    params: { highlightOpacity: 0.26, widthPct: 0.18, angleDegrees: -18 },
    humanRecognisable: true,
  },
  {
    key: 'sleeve_reflection',
    family: 'sleeve_reflection',
    label: 'Sleeve reflection',
    synthetic: true,
    params: { reflectionBands: 2, opacity: 0.2 },
    humanRecognisable: true,
  },
  {
    key: 'binder_pocket_reflection',
    family: 'binder_pocket_reflection',
    label: 'Binder-pocket reflection',
    synthetic: true,
    params: { gridEdgeOpacity: 0.2, diagonalHighlightOpacity: 0.16 },
    humanRecognisable: true,
  },
  {
    key: 'toploader_borders',
    family: 'toploader_borders',
    label: 'Top-loader borders',
    synthetic: true,
    params: { borderThicknessPct: 0.055, plasticTintOpacity: 0.1 },
    humanRecognisable: true,
  },
  {
    key: 'minor_background_intrusion',
    family: 'background_intrusion',
    label: 'Minor background intrusion',
    synthetic: true,
    params: { intrusionSide: 'bottomRight', intrusionPct: 0.045 },
    humanRecognisable: true,
  },
  {
    key: 'phone_camera_sharpening',
    family: 'phone_camera_sharpening',
    label: 'Phone-camera sharpening',
    synthetic: true,
    params: { unsharpAmount: 0.42, haloControl: 'mild' },
    humanRecognisable: true,
  },
  {
    key: 'image_noise',
    family: 'image_noise',
    label: 'Image noise',
    synthetic: true,
    params: { isoNoiseSigma: 0.025, chromaNoiseSigma: 0.01 },
    humanRecognisable: true,
  },
  {
    key: 'small_corner_occlusion',
    family: 'corner_occlusion',
    label: 'Small corner occlusion',
    synthetic: true,
    params: { corner: 'topLeft', occlusionPct: 0.055 },
    humanRecognisable: true,
  },
  {
    key: 'portrait_sensor_rotation',
    family: 'sensor_rotation',
    label: 'Portrait sensor rotation',
    synthetic: true,
    params: { sensorRotationDegrees: 0, exifOrientation: 'portrait' },
    humanRecognisable: true,
  },
  {
    key: 'landscape_sensor_rotation',
    family: 'sensor_rotation',
    label: 'Landscape sensor rotation',
    synthetic: true,
    params: { sensorRotationDegrees: 90, exifOrientation: 'landscape-left' },
    humanRecognisable: true,
  },
]);

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${sha256(value).slice(0, 16)}`;
}

function normalizeName(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trimOrEmpty(value: unknown) {
  return String(value ?? '').trim();
}

function identityValue(identity: Record<string, unknown> | null | undefined, key: string) {
  return trimOrEmpty(identity?.[key]);
}

function collectorNumberFromIdentity(identity: Record<string, unknown> | null | undefined, stackrCardId: string) {
  const direct = identityValue(identity, 'collectorNumber');
  if (direct) return direct;
  const match = /-([A-Za-z0-9]+)$/.exec(stackrCardId);
  return match?.[1] ?? '';
}

function validSplit(value: unknown): DatasetSplit | '' {
  return value === 'train' || value === 'validation' || value === 'test' ? value : '';
}

function classifyEra(setId?: string | null) {
  const id = String(setId ?? '').toLowerCase();
  if (/^(base|gym|neo|ecard|ex|np|si)/.test(id)) return 'vintage_wotc_ex';
  if (/^(dp|pl|hgss|col|bw)/.test(id)) return 'mid_era_dp_bw';
  if (/^(xy|sm)/.test(id)) return 'xy_sun_moon';
  if (/^(swsh|cel|pgo|svp|sv)/.test(id)) return 'sword_shield_scarlet_violet';
  if (/^(s|sm|xy|bw|d|m|sv|pokedata)/.test(id)) return 'japanese_or_asian_modern';
  return 'unknown';
}

function classifyVariant(card: Pick<ScannerPackCard, 'rarity' | 'setId' | 'name'>) {
  const text = `${card.rarity ?? ''} ${card.setId ?? ''} ${card.name ?? ''}`.toLowerCase();
  if (/master.?ball/.test(text)) return 'masterball_holo';
  if (/poke.?ball/.test(text)) return 'pokeball_holo';
  if (/promo|^svp|swshp|smp|xyp|basep/.test(text)) return 'promo';
  if (/reverse/.test(text)) return 'reverse_holo';
  if (/first.?edition|1st/.test(text)) return 'first_edition';
  if (/holo/.test(text)) return 'holo';
  if (/illustration|full art|secret|ultra|hyper|rainbow|rare holo v|rare holo gx|rare holo ex/.test(text)) return 'high_rarity_art';
  return 'standard';
}

function classifyDifficulty(source: Pick<SourceImage, 'variant' | 'era' | 'notes'>): SourceImage['difficulty'] {
  if (/near-identical|same artwork|language pair/i.test(source.notes)) return 'near_identical';
  if (source.variant !== 'standard' || /vintage|binder|toploader/i.test(source.notes)) return 'hard';
  if (source.era === 'unknown') return 'normal';
  return 'normal';
}

function cardToSource(card: ScannerPackCard, notes = ''): SourceImage {
  const variant = classifyVariant(card);
  const provisional: SourceImage = {
    sourceImageId: stableId('src', `${card.id}:${card.imageSmall ?? ''}`),
    cardId: card.id,
    cardName: card.name,
    setId: card.setId ?? '',
    setName: card.setName ?? card.setId ?? '',
    language: card.language ?? 'en',
    collectorNumber: card.number ?? '',
    printedTotal: card.printedTotal == null ? '' : String(card.printedTotal),
    variant,
    era: classifyEra(card.setId),
    difficulty: 'normal',
    sourceType: 'scanner_pack_reference',
    sourceUri: card.imageSmall ?? '',
    sourceUriKind: 'remote_url',
    rightsStatus: 'existing_stackr_reference_not_redistributed',
    provenanceStatus: 'included_metadata_only',
    labelVerificationStatus: 'metadata_verified',
    realPhoneCapture: false,
    approvedForTrainingPixels: false,
    physicalCardSessionId: '',
    splitHint: '',
    notes,
  };
  return { ...provisional, difficulty: classifyDifficulty(provisional) };
}

function probeToSource(input: {
  provider: string;
  language: string;
  cardId: string;
  name: string;
  setId: string;
  setName?: string | null;
  collectorNumber: string;
  sourceUri: string;
  notes: string;
}): SourceImage {
  const normalizedLanguage = input.language === 'zh-tw' ? 'zh-Hant' : input.language;
  const provisional: SourceImage = {
    sourceImageId: stableId('src', `${input.provider}:${input.language}:${input.cardId}:${input.sourceUri}`),
    cardId: `${input.provider}:${input.language}:${input.cardId}`,
    cardName: input.name,
    setId: input.setId,
    setName: input.setName ?? input.setId,
    language: normalizedLanguage,
    collectorNumber: input.collectorNumber,
    printedTotal: '',
    variant: classifyVariant({ rarity: '', setId: input.setId, name: input.name }),
    era: classifyEra(input.setId),
    difficulty: 'near_identical',
    sourceType: 'provider_probe_reference',
    sourceUri: input.sourceUri,
    sourceUriKind: 'remote_url',
    rightsStatus: 'needs_license_confirmation',
    provenanceStatus: 'included_metadata_only',
    labelVerificationStatus: 'probe_verified',
    realPhoneCapture: false,
    approvedForTrainingPixels: false,
    physicalCardSessionId: '',
    splitHint: '',
    notes: input.notes,
  };
  return { ...provisional, difficulty: classifyDifficulty(provisional) };
}

function readScannerPackCards(): ScannerPackCard[] {
  const manifest = JSON.parse(readFileSync(SCANNER_PACK_MANIFEST, 'utf8')) as { cards?: ScannerPackCard[] };
  return (manifest.cards ?? []).filter((card) => card.id && card.name && card.imageSmall);
}

function addUniqueSource(sources: SourceImage[], source: SourceImage | null | undefined) {
  if (!source?.sourceUri) return null;
  if (sources.some((existing) => existing.sourceImageId === source.sourceImageId || existing.sourceUri === source.sourceUri)) {
    return null;
  }
  const duplicateReferenceClass = sources.some((existing) => existing.cardId === source.cardId) && !source.realPhoneCapture;
  if (duplicateReferenceClass) {
    return null;
  }
  sources.push(source);
  return source;
}

function firstCard(cards: ScannerPackCard[], predicate: (card: ScannerPackCard) => boolean) {
  return cards.find((card) => predicate(card) && Boolean(card.imageSmall)) ?? null;
}

function cardsByName(cards: ScannerPackCard[], name: string) {
  const normalized = normalizeName(name);
  return cards
    .filter((card) => normalizeName(card.name) === normalized && Boolean(card.imageSmall))
    .sort((a, b) => String(a.setId).localeCompare(String(b.setId)) || String(a.number).localeCompare(String(b.number)));
}

function selectDiverseByName(cards: ScannerPackCard[], name: string, limit: number) {
  const selected: ScannerPackCard[] = [];
  const seenSets = new Set<string>();
  for (const card of cardsByName(cards, name)) {
    const setId = card.setId ?? '';
    if (seenSets.has(setId)) continue;
    selected.push(card);
    seenSets.add(setId);
    if (selected.length >= limit) break;
  }
  return selected;
}

function selectByBucket(cards: ScannerPackCard[], predicate: (card: ScannerPackCard) => boolean, limit: number) {
  const selected: ScannerPackCard[] = [];
  const seenNames = new Set<string>();
  for (const card of cards) {
    if (!predicate(card)) continue;
    const key = normalizeName(card.name);
    if (seenNames.has(key)) continue;
    selected.push(card);
    seenNames.add(key);
    if (selected.length >= limit) break;
  }
  return selected;
}

function loadProviderProbeSources() {
  const probes = JSON.parse(readFileSync(PROVIDER_PROBES, 'utf8')) as {
    tcgdex_samples?: any[];
    pokedata_samples?: any[];
  };
  const tcgdex = (probes.tcgdex_samples ?? [])
    .filter((sample) => sample.card_image_base)
    .map((sample) => probeToSource({
      provider: 'tcgdex',
      language: sample.language,
      cardId: sample.card_id,
      name: sample.card_name,
      setId: sample.set_id,
      collectorNumber: sample.collector_number,
      sourceUri: `${sample.card_image_base}/high.webp`,
      notes: 'provider probe metadata; language pair candidate; no pixels redistributed',
    }));
  const pokedata = (probes.pokedata_samples ?? [])
    .filter((sample) => sample.entity_type === 'card_image' && sample.requested_url)
    .map((sample) => probeToSource({
      provider: 'pokedata',
      language: sample.language,
      cardId: sample.card_internal_id,
      name: sample.card_internal_id,
      setId: sample.set_id,
      setName: sample.set_name,
      collectorNumber: sample.collector_number,
      sourceUri: sample.requested_url,
      notes: 'provider probe metadata; Asian-language coverage candidate; no pixels redistributed',
    }));
  return [...tcgdex, ...pokedata];
}

function scanLabExampleToSource(example: ScanLabReviewedExample): SourceImage | null {
  const identity = example.userConfirmedIdentity ?? example.expectedIdentity ?? null;
  const physicalCardSessionId = trimOrEmpty(example.physicalCardSessionId);
  const rectifiedCardStoragePath = trimOrEmpty(example.rectifiedCardStoragePath);
  const rectifiedChecksum = trimOrEmpty(example.rectifiedCardChecksumSha256);
  const originalChecksum = trimOrEmpty(example.originalPhotoChecksumSha256);
  const labelVerificationStatus = example.labelVerificationStatus === 'verified' ? 'verified' : 'reviewed';

  if (!trimOrEmpty(example.id) || !physicalCardSessionId || !rectifiedCardStoragePath) return null;
  if (!rectifiedChecksum || !originalChecksum) return null;
  if (example.labelVerificationStatus !== 'reviewed' && example.labelVerificationStatus !== 'verified') return null;

  const cardName = identityValue(identity, 'cardName');
  const setId = identityValue(identity, 'setId');
  const stackrCardId = identityValue(identity, 'stackrCardId');
  if (!cardName && !stackrCardId) return null;

  const language = identityValue(identity, 'language').toLowerCase() || 'unknown';
  const variant = identityValue(identity, 'variant') || 'unknown_variant';
  const cardId = stackrCardId || stableId('scanlab_card', `${cardName}:${setId}:${language}:${variant}`);
  const collectorNumber = collectorNumberFromIdentity(identity, stackrCardId);
  const notes = [
    'reviewed Scan Lab real phone capture',
    `physicalCardSessionId=${physicalCardSessionId}`,
    `reviewStatus=${trimOrEmpty(example.reviewStatus) || 'unknown'}`,
    `lighting=${trimOrEmpty(example.lightingCategory) || 'unknown'}`,
    `sleeve=${trimOrEmpty(example.sleeveState) || 'unknown'}`,
    `holder=${trimOrEmpty(example.holderState) || 'unknown'}`,
    `side=${trimOrEmpty(example.cardSide) || 'front'}`,
  ].join('; ');

  const provisional: SourceImage = {
    sourceImageId: stableId('scanlab_src', `${example.id}:${rectifiedCardStoragePath}:${rectifiedChecksum}`),
    cardId,
    cardName: cardName || cardId,
    setId,
    setName: setId || 'Scan Lab reviewed capture',
    language,
    collectorNumber,
    printedTotal: '',
    variant,
    era: classifyEra(setId),
    difficulty: 'hard',
    sourceType: 'scan_lab_reviewed_capture',
    sourceUri: `scan-lab-training/${rectifiedCardStoragePath}`,
    sourceUriKind: 'supabase_storage_path',
    rightsStatus: 'user_consent',
    provenanceStatus: 'reviewed_real_capture',
    labelVerificationStatus,
    realPhoneCapture: true,
    approvedForTrainingPixels: true,
    physicalCardSessionId,
    splitHint: validSplit(example.split),
    notes,
  };
  return { ...provisional, difficulty: classifyDifficulty(provisional) };
}

function loadScanLabReviewedCaptureSources() {
  if (!existsSync(SCAN_LAB_REVIEWED_MANIFEST)) return [];
  const manifest = JSON.parse(readFileSync(SCAN_LAB_REVIEWED_MANIFEST, 'utf8')) as ScanLabReviewedManifest;
  if (manifest.leakageChecks?.physicalCardSessionLeakage) return [];
  return (manifest.examples ?? [])
    .map(scanLabExampleToSource)
    .filter((source): source is SourceImage => Boolean(source));
}

function buildSources(cards: ScannerPackCard[]) {
  const sources: SourceImage[] = [];

  const knownIds = [
    'base1-4',
    'base4-4',
    'base1-58',
    'base1-2',
    'base1-10',
    'basep-3',
    'swshp-SWSH020',
    'smp-SM04',
    'xy12-11',
    'xy12-35',
    'sv3pt5-1',
  ];
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const id of knownIds) {
    const card = byId.get(id);
    if (card) addUniqueSource(sources, cardToSource(card, 'seeded hard-negative or era-balance reference'));
  }

  for (const name of ['Charizard', 'Pikachu', 'Mew', 'Mewtwo', 'Eevee', 'Vaporeon', 'Blastoise', 'Gengar']) {
    for (const card of selectDiverseByName(cards, name, 3)) {
      addUniqueSource(sources, cardToSource(card, 'same Pokemon cross-set candidate'));
    }
  }

  for (const card of selectByBucket(cards, (candidate) => /illustration|full art|secret|ultra|hyper/i.test(candidate.rarity ?? ''), 8)) {
    addUniqueSource(sources, cardToSource(card, 'similar full-art or high-rarity layout candidate'));
  }

  for (const card of selectByBucket(cards, (candidate) => classifyEra(candidate.setId) === 'mid_era_dp_bw', 4)) {
    addUniqueSource(sources, cardToSource(card, 'mid-era balance reference'));
  }

  for (const card of selectByBucket(cards, (candidate) => classifyEra(candidate.setId) === 'sword_shield_scarlet_violet', 5)) {
    addUniqueSource(sources, cardToSource(card, 'modern-era balance reference'));
  }

  for (const source of loadProviderProbeSources()) {
    addUniqueSource(sources, source);
  }

  for (const source of loadScanLabReviewedCaptureSources()) {
    addUniqueSource(sources, source);
  }

  return sources;
}

function sourceMatches(source: SourceImage, predicate: (source: SourceImage) => boolean) {
  return predicate(source);
}

function buildHardNegativeGroups(sources: SourceImage[]): HardNegativeGroup[] {
  const byCardId = new Map(sources.map((source) => [source.cardId, source]));
  const find = (id: string) => byCardId.get(id) ?? null;
  const groupSources = (ids: string[]) => ids.map(find).filter((source): source is SourceImage => Boolean(source));

  const charizardSources = sources.filter((source) => normalizeName(source.cardName) === 'charizard').slice(0, 3);
  const baseSetCharizardReprints = groupSources(['base1-4', 'base4-4'])
    .filter((source) => normalizeName(source.cardName) === 'charizard');
  const bulbasaurLanguage = sources
    .filter((source) => /bulbasaur|tcgdex:ja:SV2a-001|tcgdex:zh-tw:SV2a-001/i.test(`${source.cardName} ${source.cardId}`))
    .slice(0, 3);
  const promoPair = sources.filter((source) => source.variant === 'promo' || normalizeName(source.cardName) === 'mewtwo').slice(0, 3);
  const sameNumber = sources.filter((source) => source.collectorNumber.replace(/^0+/, '') === '1').slice(0, 4);
  const fullArts = sources.filter((source) => source.notes.includes('full-art') || source.variant === 'high_rarity_art').slice(0, 4);

  const groups: HardNegativeGroup[] = [
    {
      groupId: 'hardneg_same_pokemon_different_artwork_charizard',
      type: 'same_pokemon_different_artwork',
      status: charizardSources.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'hard',
      members: charizardSources,
      reason: 'Same card name across different sets can make OCR-only or name-first matching overconfident.',
      notes: 'Artwork difference is metadata-inferred and must be visually reviewed before training use.',
    },
    {
      groupId: 'hardneg_identical_artwork_different_set_base_charizard',
      type: 'identical_artwork_different_set',
      status: baseSetCharizardReprints.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: baseSetCharizardReprints,
      reason: 'Known Base Set and Base Set 2 style reprint risk: artwork can be near-identical while set identity differs.',
      notes: 'Needs visual verification from licensed pixels before model training.',
    },
    {
      groupId: 'hardneg_identical_artwork_different_language_bulbasaur_151',
      type: 'identical_artwork_different_language',
      status: bulbasaurLanguage.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: bulbasaurLanguage,
      reason: 'Same printed card family across English/Japanese/Traditional Chinese can confuse artwork-only matching.',
      notes: 'Uses provider probe metadata for JA/ZH references; no pixels redistributed.',
    },
    {
      groupId: 'hardneg_standard_vs_reverse_holo',
      type: 'standard_versus_reverse_holo',
      status: 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: [],
      reason: 'Current approved local metadata does not expose separate reverse-holo image classes.',
      notes: 'Must be filled from licensed/reference variant sources or reviewed real captures.',
    },
    {
      groupId: 'hardneg_stamped_vs_unstamped',
      type: 'stamped_versus_unstamped',
      status: 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: [],
      reason: 'No approved stamped and unstamped source-image pair was found locally.',
      notes: 'Do not synthesize a stamp and treat it as a true class variant.',
    },
    {
      groupId: 'hardneg_first_edition_vs_unlimited',
      type: 'first_edition_versus_unlimited',
      status: 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: [],
      reason: 'The current scanner pack does not model first-edition versus unlimited as separate verified source classes.',
      notes: 'Requires licensed vintage variant references or reviewed real captures.',
    },
    {
      groupId: 'hardneg_promo_vs_set_release',
      type: 'promo_versus_set_release',
      status: promoPair.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'hard',
      members: promoPair,
      reason: 'Promo releases can share Pokemon/name cues with set releases while differing in identifiers and layout.',
      notes: 'Selected from existing scanner-pack metadata when promo set IDs are present.',
    },
    {
      groupId: 'hardneg_same_collector_number_different_set',
      type: 'same_collector_number_different_set',
      status: sameNumber.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'hard',
      members: sameNumber,
      reason: 'A collector number alone is not an identity; set and visual evidence must separate these.',
      notes: 'Directly targets the isolated-number false-positive risk.',
    },
    {
      groupId: 'hardneg_similar_full_art_layouts',
      type: 'similar_full_art_layouts',
      status: fullArts.length >= 2 ? 'represented' : 'blocked_no_approved_source',
      difficulty: 'hard',
      members: fullArts,
      reason: 'Full-art compositions can produce high visual similarity despite different card identities.',
      notes: 'Rarity/layout category is metadata-inferred and requires visual review before training use.',
    },
    {
      groupId: 'hardneg_pokeball_vs_masterball_patterns',
      type: 'poke_ball_versus_master_ball_patterns',
      status: 'blocked_no_approved_source',
      difficulty: 'near_identical',
      members: [],
      reason: 'No approved local Poke Ball versus Master Ball pattern pair is available.',
      notes: 'Keep this explicit because Japanese 151 variants are high-risk when the data becomes available.',
    },
  ];

  return groups.map((group) => ({
    ...group,
    members: group.members.map((member) => ({
      sourceImageId: member.sourceImageId,
      cardId: member.cardId,
      cardName: member.cardName,
      setId: member.setId,
      language: member.language,
      collectorNumber: member.collectorNumber,
      variant: member.variant,
    })),
  }));
}

function groupIdsForSource(source: SourceImage, groups: HardNegativeGroup[]) {
  return groups
    .filter((group) => group.members.some((member) => member.sourceImageId === source.sourceImageId))
    .map((group) => group.groupId)
    .join('|');
}

function assignSplits(sources: SourceImage[]) {
  const splitBySource = new Map<string, DatasetSplit>();
  const buckets = new Map<string, SourceImage[]>();
  for (const source of sources) {
    if (source.physicalCardSessionId) continue;
    const key = `${source.language}:${source.difficulty}`;
    buckets.set(key, [...(buckets.get(key) ?? []), source]);
  }

  for (const bucketSources of buckets.values()) {
    bucketSources.forEach((source, index) => {
      const split: DatasetSplit = index % 5 === 0
        ? 'test'
        : index % 5 === 1
          ? 'validation'
          : 'train';
      splitBySource.set(source.sourceImageId, split);
    });
  }

  const physicalGroups = new Map<string, SourceImage[]>();
  for (const source of sources.filter((source) => source.physicalCardSessionId)) {
    physicalGroups.set(source.physicalCardSessionId, [
      ...(physicalGroups.get(source.physicalCardSessionId) ?? []),
      source,
    ]);
  }

  for (const [physicalCardSessionId, sessionSources] of physicalGroups.entries()) {
    const hintedSplit = sessionSources.find((source) => source.splitHint)?.splitHint;
    const fallbackSplit: DatasetSplit = Number.parseInt(sha256(physicalCardSessionId).slice(0, 2), 16) % 5 === 0
      ? 'test'
      : Number.parseInt(sha256(physicalCardSessionId).slice(2, 4), 16) % 4 === 0
        ? 'validation'
        : 'train';
    const split = hintedSplit || fallbackSplit;
    for (const source of sessionSources) {
      splitBySource.set(source.sourceImageId, split);
    }
  }

  const realPhoneSources = sources.filter((source) => source.realPhoneCapture);
  const hasRealPhoneTestSource = realPhoneSources.some((source) => splitBySource.get(source.sourceImageId) === 'test');
  if (realPhoneSources.length > 0 && !hasRealPhoneTestSource) {
    const testSessionId = realPhoneSources
      .map((source) => source.physicalCardSessionId)
      .filter(Boolean)
      .sort()[0];
    if (testSessionId) {
      for (const source of realPhoneSources.filter((item) => item.physicalCardSessionId === testSessionId)) {
        splitBySource.set(source.sourceImageId, 'test');
      }
    } else {
      splitBySource.set(realPhoneSources[0].sourceImageId, 'test');
    }
  }

  return splitBySource;
}

function buildRows(sources: SourceImage[], groups: HardNegativeGroup[]) {
  const splitBySource = assignSplits(sources);
  const rows: DatasetRow[] = [];

  for (const source of sources) {
    const split = splitBySource.get(source.sourceImageId) ?? 'train';
    const hardNegativeGroupIds = groupIdsForSource(source, groups);
    for (const recipe of AUGMENTATIONS) {
      const viewId = stableId('view', `${source.sourceImageId}:${recipe.key}`);
      rows.push({
        ...source,
        rowId: stableId('row', `${source.sourceImageId}:${recipe.key}:${split}`),
        datasetVersion: DATASET_VERSION,
        split,
        viewId,
        viewKind: recipe.synthetic ? 'synthetic_controlled_view' : 'source_reference',
        augmentationKey: recipe.key,
        augmentationFamily: recipe.family,
        augmentationParamsJson: JSON.stringify(recipe.params),
        syntheticView: recipe.synthetic,
        hardNegativeGroupIds,
      });
    }
  }

  return rows;
}

function countBy<T extends string>(rows: readonly DatasetRow[] | readonly SourceImage[], getter: (row: any) => T) {
  return [...rows.reduce((acc, row) => {
    const key = getter(row) || 'unknown' as T;
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<T, number>()).entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([key, count]) => ({ key, count }));
}

function findDuplicateValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function buildSummary(sources: SourceImage[], rows: DatasetRow[], groups: HardNegativeGroup[]) {
  const sourceSplits = new Map<string, Set<string>>();
  for (const row of rows) {
    const splits = sourceSplits.get(row.sourceImageId) ?? new Set<string>();
    splits.add(row.split);
    sourceSplits.set(row.sourceImageId, splits);
  }
  const sourceLeakage = [...sourceSplits.entries()]
    .filter(([, splits]) => splits.size > 1)
    .map(([sourceImageId, splits]) => ({ sourceImageId, splits: [...splits] }));
  const physicalSessionSplits = new Map<string, Set<string>>();
  for (const row of rows.filter((row) => row.physicalCardSessionId)) {
    const splits = physicalSessionSplits.get(row.physicalCardSessionId) ?? new Set<string>();
    splits.add(row.split);
    physicalSessionSplits.set(row.physicalCardSessionId, splits);
  }
  const physicalCardSessionLeakage = [...physicalSessionSplits.entries()]
    .filter(([, splits]) => splits.size > 1)
    .map(([physicalCardSessionId, splits]) => ({ physicalCardSessionId, splits: [...splits] }));
  const splitCounts = countBy(rows, (row) => row.split);
  const realPhoneCaptureSources = sources.filter((source) => source.realPhoneCapture);
  const sourceReferenceRowCount = rows.filter((row) => !row.syntheticView).length;
  const syntheticViewRowCount = rows.filter((row) => row.syntheticView).length;
  const approvedTrainingPixelSourceCount = sources.filter((source) => source.approvedForTrainingPixels).length;
  const realPhoneTestSourceCount = new Set(
    rows
      .filter((row) => row.realPhoneCapture && row.split === 'test')
      .map((row) => row.sourceImageId)
  ).size;
  const observedLanguages = new Set(sources.map((source) => source.language));
  const missingRequestedLanguageNotes = [
    !observedLanguages.has('ko')
      ? 'No approved Korean reference or real-phone capture source was found locally.'
      : null,
    !observedLanguages.has('zh-Hans')
      ? 'No approved Simplified Chinese reference or real-phone capture source was found locally.'
      : null,
  ].filter((note): note is string => Boolean(note));

  return {
    datasetVersion: DATASET_VERSION,
    generatedAt: GENERATED_AT,
    rowCount: rows.length,
    classCount: new Set(sources.map((source) => source.cardId)).size,
    sourceImageCount: sources.length,
    sourceReferenceRowCount,
    syntheticViewRowCount,
    realPhoneCaptureSourceCount: realPhoneCaptureSources.length,
    realPhoneTestSourceCount,
    approvedTrainingPixelSourceCount,
    realVersusSyntheticDistribution: [
      { key: 'source_reference_rows', count: sourceReferenceRowCount },
      { key: 'synthetic_controlled_rows', count: syntheticViewRowCount },
      { key: 'real_phone_source_images', count: realPhoneCaptureSources.length },
      { key: 'approved_training_pixel_sources', count: approvedTrainingPixelSourceCount },
    ],
    languageDistribution: countBy(sources, (source) => source.language),
    setEraDistribution: countBy(sources, (source) => source.era),
    variantDistribution: countBy(sources, (source) => source.variant),
    difficultyDistribution: countBy(sources, (source) => source.difficulty),
    sourceRightsDistribution: countBy(sources, (source) => source.rightsStatus),
    provenanceStatusDistribution: countBy(sources, (source) => source.provenanceStatus),
    splitDistribution: splitCounts,
    duplicateAnalysis: {
      duplicateSourceUris: findDuplicateValues(sources.map((source) => source.sourceUri)),
      duplicateCardClasses: findDuplicateValues(sources.map((source) => source.cardId)),
      sourceLeakage,
      sourceLeakageExists: sourceLeakage.length > 0,
      physicalCardSessionLeakage,
      physicalCardSessionLeakageExists: physicalCardSessionLeakage.length > 0,
    },
    hardNegativeCoverage: {
      represented: groups.filter((group) => group.status === 'represented').length,
      blocked: groups.filter((group) => group.status !== 'represented').length,
      total: groups.length,
    },
    limitations: [
      ...(
        realPhoneCaptureSources.length === 0
          ? ['No approved real Stackr phone-capture export was found locally; .tmp_video_frames was excluded for missing consent/provenance metadata.']
          : []
      ),
      'Source image pixels are not redistributed; generated rows describe controlled augmentation views that must be materialized only after rights are confirmed.',
      'The pilot remains synthetic-heavy and cannot support a production-readiness claim.',
      'Some requested hard-negative families are blocked until licensed/reference variant pairs are available.',
      ...(
        realPhoneCaptureSources.length > 0 && realPhoneTestSourceCount === 0
          ? ['Approved real phone captures were available, but none landed in the test split.']
          : []
      ),
      ...missingRequestedLanguageNotes,
    ],
    provenanceExclusions: [
      ...(
        existsSync(SCAN_LAB_REVIEWED_MANIFEST)
          ? []
          : [{
              path: SCAN_LAB_REVIEWED_MANIFEST,
              reason: 'No reviewed Scan Lab export manifest was found locally.',
            }]
      ),
      {
        path: '.tmp_video_frames/',
        reason: 'No consent, card identity, or label-verification manifest found.',
      },
      {
        path: 'tmp/gem-pack-vol5-variants/',
        reason: 'Local images have no durable provenance manifest tying them to permitted recognition training use.',
      },
      {
        path: 'assets/rev2/**',
        reason: 'App artwork is not card reference imagery for recognition training.',
      },
    ],
  };
}

function writeVarInt(value: number | bigint) {
  let current = BigInt(value);
  const bytes: number[] = [];
  while ((current & ~0x7fn) !== 0n) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Buffer.from(bytes);
}

function zigZag(value: number | bigint) {
  const current = BigInt(value);
  return (current << 1n) ^ (current >> 63n);
}

function writeI32(value: number) {
  return writeVarInt(zigZag(value));
}

function writeI64(value: number) {
  return writeVarInt(zigZag(BigInt(value)));
}

function writeBinary(value: string) {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([writeVarInt(bytes.length), bytes]);
}

function fieldHeader(fieldId: number, compactType: number, lastFieldId: number) {
  const delta = fieldId - lastFieldId;
  if (delta > 0 && delta <= 15) return Buffer.from([(delta << 4) | compactType]);
  return Buffer.concat([Buffer.from([compactType]), writeI32(fieldId)]);
}

function writeListHeader(length: number, elementType: number) {
  if (length <= 14) return Buffer.from([(length << 4) | elementType]);
  return Buffer.concat([Buffer.from([0xf0 | elementType]), writeVarInt(length)]);
}

function thriftStruct(fields: ParquetField[]) {
  const parts: Buffer[] = [];
  let lastFieldId = 0;
  for (const field of fields.sort((a, b) => a.id - b.id)) {
    if (field.type === 'i32') {
      parts.push(fieldHeader(field.id, 0x05, lastFieldId), writeI32(field.value));
    } else if (field.type === 'i64') {
      parts.push(fieldHeader(field.id, 0x06, lastFieldId), writeI64(field.value));
    } else if (field.type === 'string') {
      parts.push(fieldHeader(field.id, 0x08, lastFieldId), writeBinary(field.value));
    } else if (field.type === 'struct') {
      parts.push(fieldHeader(field.id, 0x0c, lastFieldId), field.value);
    } else if (field.type === 'i32list') {
      parts.push(fieldHeader(field.id, 0x09, lastFieldId), writeListHeader(field.value.length, 0x05));
      for (const item of field.value) parts.push(writeI32(item));
    } else if (field.type === 'stringlist') {
      parts.push(fieldHeader(field.id, 0x09, lastFieldId), writeListHeader(field.value.length, 0x08));
      for (const item of field.value) parts.push(writeBinary(item));
    } else if (field.type === 'structlist') {
      parts.push(fieldHeader(field.id, 0x09, lastFieldId), writeListHeader(field.value.length, 0x0c));
      for (const item of field.value) parts.push(item);
    }
    lastFieldId = field.id;
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function schemaElementRoot(columnCount: number) {
  return thriftStruct([
    { id: 4, type: 'string', value: 'schema' },
    { id: 5, type: 'i32', value: columnCount },
  ]);
}

function schemaElementString(name: string) {
  return thriftStruct([
    { id: 1, type: 'i32', value: 6 },
    { id: 3, type: 'i32', value: 0 },
    { id: 4, type: 'string', value: name },
    { id: 6, type: 'i32', value: 0 },
  ]);
}

function pageHeader(numValues: number, pageSize: number) {
  const dataPageHeader = thriftStruct([
    { id: 1, type: 'i32', value: numValues },
    { id: 2, type: 'i32', value: 0 },
    { id: 3, type: 'i32', value: 3 },
    { id: 4, type: 'i32', value: 3 },
  ]);
  return thriftStruct([
    { id: 1, type: 'i32', value: 0 },
    { id: 2, type: 'i32', value: pageSize },
    { id: 3, type: 'i32', value: pageSize },
    { id: 5, type: 'struct', value: dataPageHeader },
  ]);
}

function plainByteArray(values: string[]) {
  const parts: Buffer[] = [];
  for (const value of values) {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeInt32LE(bytes.length, 0);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

function columnMetadata(columnName: string, numRows: number, pageOffset: number, totalSize: number) {
  return thriftStruct([
    { id: 1, type: 'i32', value: 6 },
    { id: 2, type: 'i32list', value: [0, 3] },
    { id: 3, type: 'stringlist', value: [columnName] },
    { id: 4, type: 'i32', value: 0 },
    { id: 5, type: 'i64', value: numRows },
    { id: 6, type: 'i64', value: totalSize },
    { id: 7, type: 'i64', value: totalSize },
    { id: 9, type: 'i64', value: pageOffset },
  ]);
}

function columnChunk(columnName: string, numRows: number, pageOffset: number, totalSize: number) {
  return thriftStruct([
    { id: 2, type: 'i64', value: pageOffset },
    { id: 3, type: 'struct', value: columnMetadata(columnName, numRows, pageOffset, totalSize) },
  ]);
}

function keyValue(key: string, value: string) {
  return thriftStruct([
    { id: 1, type: 'string', value: key },
    { id: 2, type: 'string', value },
  ]);
}

function writeParquetLikeManifest(rows: DatasetRow[], outputPath: string) {
  const columns = [
    'row_id',
    'dataset_version',
    'source_image_id',
    'card_id',
    'card_name',
    'set_id',
    'set_name',
    'language',
    'collector_number',
    'printed_total',
    'variant',
    'era',
    'difficulty',
    'source_type',
    'source_uri',
    'source_uri_kind',
    'rights_status',
    'provenance_status',
    'label_verification_status',
    'approved_for_training_pixels',
    'real_phone_capture',
    'physical_card_session_id',
    'split',
    'view_id',
    'view_kind',
    'augmentation_key',
    'augmentation_family',
    'augmentation_params_json',
    'synthetic_view',
    'hard_negative_group_ids',
    'notes',
  ] as const;

  const valueFor = (row: DatasetRow, column: (typeof columns)[number]) => {
    switch (column) {
      case 'row_id': return row.rowId;
      case 'dataset_version': return row.datasetVersion;
      case 'source_image_id': return row.sourceImageId;
      case 'card_id': return row.cardId;
      case 'card_name': return row.cardName;
      case 'set_id': return row.setId;
      case 'set_name': return row.setName;
      case 'language': return row.language;
      case 'collector_number': return row.collectorNumber;
      case 'printed_total': return row.printedTotal;
      case 'variant': return row.variant;
      case 'era': return row.era;
      case 'difficulty': return row.difficulty;
      case 'source_type': return row.sourceType;
      case 'source_uri': return row.sourceUri;
      case 'source_uri_kind': return row.sourceUriKind;
      case 'rights_status': return row.rightsStatus;
      case 'provenance_status': return row.provenanceStatus;
      case 'label_verification_status': return row.labelVerificationStatus;
      case 'approved_for_training_pixels': return String(row.approvedForTrainingPixels);
      case 'real_phone_capture': return String(row.realPhoneCapture);
      case 'physical_card_session_id': return row.physicalCardSessionId;
      case 'split': return row.split;
      case 'view_id': return row.viewId;
      case 'view_kind': return row.viewKind;
      case 'augmentation_key': return row.augmentationKey;
      case 'augmentation_family': return row.augmentationFamily;
      case 'augmentation_params_json': return row.augmentationParamsJson;
      case 'synthetic_view': return String(row.syntheticView);
      case 'hard_negative_group_ids': return row.hardNegativeGroupIds;
      case 'notes': return row.notes;
    }
  };

  const chunks: Buffer[] = [];
  const columnChunks: Buffer[] = [];
  chunks.push(Buffer.from('PAR1'));
  let offset = 4;

  for (const column of columns) {
    const pageData = plainByteArray(rows.map((row) => valueFor(row, column)));
    const header = pageHeader(rows.length, pageData.length);
    const columnBytes = Buffer.concat([header, pageData]);
    chunks.push(columnBytes);
    columnChunks.push(columnChunk(column, rows.length, offset, columnBytes.length));
    offset += columnBytes.length;
  }

  const rowGroup = thriftStruct([
    { id: 1, type: 'structlist', value: columnChunks },
    { id: 2, type: 'i64', value: columnChunks.reduce((sum, chunk) => sum + chunk.length, 0) },
    { id: 3, type: 'i64', value: rows.length },
  ]);
  const schema = [
    schemaElementRoot(columns.length),
    ...columns.map(schemaElementString),
  ];
  const metadata = thriftStruct([
    { id: 1, type: 'i32', value: 1 },
    { id: 2, type: 'structlist', value: schema },
    { id: 3, type: 'i64', value: rows.length },
    { id: 4, type: 'structlist', value: [rowGroup] },
    {
      id: 5,
      type: 'structlist',
      value: [
        keyValue('dataset_version', DATASET_VERSION),
        keyValue('generated_at', GENERATED_AT),
        keyValue('format_note', 'Plain UTF8 Parquet v1 manifest; image pixels are not embedded.'),
      ],
    },
    { id: 6, type: 'string', value: 'Stackr pilot dataset builder' },
  ]);
  const footerLength = Buffer.alloc(4);
  footerLength.writeInt32LE(metadata.length, 0);
  chunks.push(metadata, footerLength, Buffer.from('PAR1'));
  writeFileSync(outputPath, Buffer.concat(chunks));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function distributionTable(title: string, rows: Array<{ key: string; count: number }>) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr><th>Bucket</th><th>Count</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.key)}</td><td>${row.count}</td></tr>`).join('')}</tbody>
      </table>
    </section>
  `;
}

function augmentationCard(recipe: AugmentationRecipe, index: number) {
  const rotate = recipe.family === 'sensor_rotation' && recipe.key.includes('landscape') ? 90 : index % 3 === 0 ? -7 : index % 3 === 1 ? 3 : 8;
  const filter = recipe.family === 'white_balance'
    ? recipe.key.includes('warm') ? 'sepia(0.25) saturate(1.12)' : 'hue-rotate(190deg) saturate(0.92)'
    : recipe.family.includes('blur') ? 'blur(1px)'
      : recipe.family === 'exposure_changes' ? 'brightness(0.82) contrast(1.12)'
        : recipe.family === 'image_noise' ? 'contrast(1.25)'
          : 'none';
  return `
    <div class="aug-card">
      <div class="fixture ${escapeHtml(recipe.family)}" style="transform: rotate(${rotate}deg); filter: ${filter};">
        <div class="name-line"></div>
        <div class="art-box"></div>
        <div class="text-line short"></div>
        <div class="text-line"></div>
        <div class="number-line"></div>
      </div>
      <strong>${escapeHtml(recipe.label)}</strong>
      <span>${escapeHtml(JSON.stringify(recipe.params))}</span>
    </div>
  `;
}

function writeReport(summary: ReturnType<typeof buildSummary>, groups: HardNegativeGroup[], sources: SourceImage[], outputPath: string) {
  const representedGroups = groups.filter((group) => group.status === 'represented');
  const blockedGroups = groups.filter((group) => group.status !== 'represented');
  const sampleSources = sources.slice(0, 12);
  const realCaptureReadiness = summary.realPhoneCaptureSourceCount > 0
    ? `This pilot includes ${summary.realPhoneCaptureSourceCount} approved real Stackr phone-capture source(s), including ${summary.realPhoneTestSourceCount} source(s) in the test split.`
    : 'No approved real Stackr phone-capture export was found locally.';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stackr Pilot Recognition Dataset Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7fb; color: #111229; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: 32px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 0 0 12px; }
    p { line-height: 1.55; }
    section { background: #fff; border: 1px solid #dde1ee; border-radius: 8px; padding: 18px; margin-top: 18px; box-shadow: 0 10px 30px rgba(20, 24, 50, 0.06); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: #f8f5ff; border: 1px solid #ded3ff; border-radius: 8px; padding: 14px; }
    .metric span { display: block; color: #5b5871; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .metric strong { display: block; font-size: 26px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #e8e9f2; text-align: left; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: #5b5871; letter-spacing: 0.04em; }
    code { background: #f1effa; border-radius: 4px; padding: 2px 5px; }
    .warning { background: #fff7ed; border-color: #fed7aa; }
    .ok { background: #eefbf4; border-color: #bbf7d0; }
    .aug-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 14px; }
    .aug-card { display: grid; gap: 8px; min-width: 0; }
    .aug-card strong { font-size: 13px; }
    .aug-card span { color: #66627c; font-size: 11px; overflow-wrap: anywhere; }
    .fixture { position: relative; aspect-ratio: 0.7; border-radius: 7px; border: 6px solid #251d38; background: linear-gradient(155deg, #fcfcff, #ded9ff 45%, #f9f6fd); box-shadow: 0 16px 28px rgba(25, 22, 45, 0.18); padding: 8%; overflow: hidden; }
    .fixture::before { content: ""; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,.48) 48%, transparent 62%); opacity: .24; }
    .fixture.moderate_glare::before, .fixture.sleeve_reflection::before, .fixture.binder_pocket_reflection::before { opacity: .66; }
    .fixture.toploader_borders { outline: 8px solid rgba(119, 164, 210, 0.22); }
    .fixture.corner_occlusion::after { content: ""; position: absolute; left: 0; top: 0; width: 20%; height: 16%; background: rgba(32, 24, 18, .45); border-bottom-right-radius: 18px; }
    .fixture.background_intrusion::after { content: ""; position: absolute; right: -4%; bottom: -2%; width: 28%; height: 18%; background: #3b4254; transform: rotate(-14deg); }
    .name-line, .text-line, .number-line { border-radius: 3px; background: #1d1731; height: 5%; opacity: .76; }
    .art-box { height: 42%; margin: 9% 0 8%; border-radius: 6px; background: radial-gradient(circle at 60% 35%, #fff3a6, transparent 19%), linear-gradient(135deg, #6656f3, #2bc2a2); }
    .text-line { height: 4%; margin-bottom: 5%; background: #716b85; }
    .text-line.short { width: 74%; }
    .number-line { width: 38%; margin-top: 10%; }
    .small { color: #5d5a70; font-size: 13px; }
  </style>
</head>
<body>
<main>
  <h1>Stackr Pilot Recognition Dataset Report</h1>
  <p class="small">Generated ${escapeHtml(summary.generatedAt)}. Dataset version <code>${escapeHtml(summary.datasetVersion)}</code>.</p>

  <section class="warning">
    <h2>Readiness Limitation</h2>
    <p>This pilot is a governed manifest and augmentation plan. It does not redistribute card-image pixels, and it must not be used to claim production readiness from clean reference images alone. ${escapeHtml(realCaptureReadiness)}</p>
  </section>

  <section>
    <h2>Summary</h2>
    <div class="grid">
      <div class="metric"><span>Classes</span><strong>${summary.classCount}</strong></div>
      <div class="metric"><span>Source Images</span><strong>${summary.sourceImageCount}</strong></div>
      <div class="metric"><span>Reference Rows</span><strong>${summary.sourceReferenceRowCount}</strong></div>
      <div class="metric"><span>Synthetic Rows</span><strong>${summary.syntheticViewRowCount}</strong></div>
      <div class="metric"><span>Real Phone Sources</span><strong>${summary.realPhoneCaptureSourceCount}</strong></div>
      <div class="metric"><span>Real Phone Test</span><strong>${summary.realPhoneTestSourceCount}</strong></div>
      <div class="metric"><span>Hard Negatives</span><strong>${summary.hardNegativeCoverage.represented}/${summary.hardNegativeCoverage.total}</strong></div>
    </div>
  </section>

  ${distributionTable('Language Distribution', summary.languageDistribution)}
  ${distributionTable('Real Versus Synthetic', summary.realVersusSyntheticDistribution)}
  ${distributionTable('Set-Era Distribution', summary.setEraDistribution)}
  ${distributionTable('Variant Distribution', summary.variantDistribution)}
  ${distributionTable('Source Rights Distribution', summary.sourceRightsDistribution)}
  ${distributionTable('Provenance Status Distribution', summary.provenanceStatusDistribution)}
  ${distributionTable('Split Distribution', summary.splitDistribution)}

  <section class="${summary.duplicateAnalysis.sourceLeakageExists ? 'warning' : 'ok'}">
    <h2>Split Integrity</h2>
    <p>Source-image leakage between train, validation and test: <strong>${summary.duplicateAnalysis.sourceLeakageExists ? 'found' : 'none found'}</strong>.</p>
    <p>Physical-card session leakage between train, validation and test: <strong>${summary.duplicateAnalysis.physicalCardSessionLeakageExists ? 'found' : 'none found'}</strong>.</p>
    <p>Duplicate source URIs: ${summary.duplicateAnalysis.duplicateSourceUris.length}. Duplicate class IDs: ${summary.duplicateAnalysis.duplicateCardClasses.length}.</p>
  </section>

  <section>
    <h2>Hard-Negative Groups</h2>
    <table>
      <thead><tr><th>Group</th><th>Status</th><th>Members</th><th>Reason</th></tr></thead>
      <tbody>
        ${groups.map((group) => `<tr><td>${escapeHtml(group.type)}</td><td>${escapeHtml(group.status)}</td><td>${group.members.length}</td><td>${escapeHtml(group.reason)}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="small">Represented groups: ${representedGroups.length}. Blocked groups: ${blockedGroups.length}.</p>
  </section>

  <section>
    <h2>Example Augmentation Grids</h2>
    <div class="aug-grid">${AUGMENTATIONS.slice(1).map(augmentationCard).join('')}</div>
  </section>

  <section>
    <h2>Sample Source References</h2>
    <table>
      <thead><tr><th>Card</th><th>Set</th><th>Language</th><th>Variant</th><th>Split</th></tr></thead>
      <tbody>
        ${sampleSources.map((source) => {
          const split = assignSplits(sources).get(source.sourceImageId) ?? 'train';
          return `<tr><td>${escapeHtml(source.cardName)}</td><td>${escapeHtml(source.setId)}</td><td>${escapeHtml(source.language)}</td><td>${escapeHtml(source.variant)}</td><td>${split}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Provenance Exclusions</h2>
    <table>
      <thead><tr><th>Path</th><th>Reason</th></tr></thead>
      <tbody>${summary.provenanceExclusions.map((item) => `<tr><td><code>${escapeHtml(item.path)}</code></td><td>${escapeHtml(item.reason)}</td></tr>`).join('')}</tbody>
    </table>
  </section>

  <section>
    <h2>Limitations</h2>
    <ul>${summary.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>

  <script id="pilot-dataset-summary" type="application/json">${escapeHtml(JSON.stringify(summary, null, 2))}</script>
</main>
</body>
</html>`;
  writeFileSync(outputPath, html);
}

function buildOutput() {
  const cards = readScannerPackCards();
  const sources = buildSources(cards);
  const groups = buildHardNegativeGroups(sources);
  const rows = buildRows(sources, groups);
  const summary = buildSummary(sources, rows, groups);

  mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });
  mkdirSync(path.dirname(OUT_REPORT), { recursive: true });

  writeParquetLikeManifest(rows, OUT_MANIFEST);
  writeFileSync(OUT_HARD_NEGATIVES, JSON.stringify({ summary, groups }, null, 2));
  writeReport(summary, groups, sources, OUT_REPORT);

  return {
    summary,
    outputs: {
      manifest: OUT_MANIFEST,
      hardNegatives: OUT_HARD_NEGATIVES,
      report: OUT_REPORT,
    },
  };
}

const result = buildOutput();
console.log(JSON.stringify(result, null, 2));
