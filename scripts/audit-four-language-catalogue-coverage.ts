/**
 * Read-only four-language catalogue coverage reconciler.
 *
 * It deliberately keeps provider inventory expectations separate from observed
 * catalogue rows. A URL is a pointer, never evidence that an image loaded.
 *
 * Usage:
 *   npx tsx scripts/audit-four-language-catalogue-coverage.ts \
 *     --catalogue=path/to/current-catalogue.json \
 *     --provider=path/to/provider-inventory.json \
 *     --output=.tmp/four-language-coverage/report.json
 *
 * Both JSON inputs use `{ "sets": [...], "cards": [...] }` (arrays may also
 * be used when only cards are available). Required identity fields are `id`,
 * `language`, and `setId` on cards. Set rows use `id` and `language`.
 * Useful optional fields: `localName`, `name`, `englishDisplayName`,
 * `releaseDate`, `number`, `rarity`, `imageUrl`/`image`, `images.logo`,
 * `images.symbol`, and `nativeImageAvailability`/`logoAvailability`/
 * `symbolAvailability` set to `verified_available` only after a real probe.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Row = Record<string, unknown>;
type Language = 'en' | 'ja' | 'zh-cn' | 'zh-tw';
type Input = { sets: Row[]; cards: Row[] };

export const FOUR_CATALOGUE_LANGUAGES: readonly Language[] = ['en', 'ja', 'zh-cn', 'zh-tw'];
const languages = new Set<string>(FOUR_CATALOGUE_LANGUAGES);

function isRow(value: unknown): value is Row { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function hash(body: Buffer | string) { return createHash('sha256').update(body).digest('hex'); }
function normal(value: unknown) { return String(value ?? '').trim().toLocaleLowerCase(); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isRow(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableJson(value: unknown) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function regularFile(path: string, label: string) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  return readFileSync(path);
}
function parseInput(path: string, label: string): { input: Input; sha256: string } {
  const body = regularFile(path, label);
  let raw: unknown;
  try { raw = JSON.parse(body.toString('utf8')); } catch { throw new Error(`${label} is not valid JSON.`); }
  const object = isRow(raw) ? raw : null;
  const cards = Array.isArray(raw) ? raw : object?.cards;
  const sets = object?.sets ?? [];
  if (!Array.isArray(cards) || !Array.isArray(sets) || !cards.every(isRow) || !sets.every(isRow)) throw new Error(`${label} requires object arrays named sets and cards (or a card array).`);
  return { input: { sets, cards }, sha256: hash(body) };
}
function language(value: unknown): Language | null {
  const result = normal(value).replace(/_/g, '-');
  return languages.has(result) ? result as Language : null;
}
function id(row: Row) { return text(row.id) ?? text(row.setId) ?? text(row.set_id); }
function cardSetId(row: Row) { return text(row.setId) ?? text(row.set_id) ?? text(isRow(row.set) ? row.set.id : null); }
function localName(row: Row) { return text(row.localName) ?? text(row.local_name) ?? text(row.name); }
function englishName(row: Row) { return text(row.englishDisplayName) ?? text(row.english_display_name) ?? text(row.englishName) ?? text(row.english_name); }
function releaseDate(row: Row) { return text(row.releaseDate) ?? text(row.release_date); }
function imagePointer(row: Row) { return text(row.imageUrl) ?? text(row.image_url) ?? text(row.image) ?? text(isRow(row.images) ? row.images.small : null) ?? text(isRow(row.images) ? row.images.large : null); }
function markPointer(row: Row, mark: 'logo' | 'symbol') { return text(row[`${mark}Url`]) ?? text(row[`${mark}_url`]) ?? text(isRow(row.images) ? row.images[mark] : null); }
function declaredExpectedCards(row: Row) {
  const cardCount = isRow(row.cardCount) ? row.cardCount : null;
  // Provider `total` is the full set universe. `official` is narrower and is
  // only comparable when the caller explicitly declares that scope.
  const direct = row.expectedCards ?? row.expected_cards
    ?? (cardCount ? (row.expectedScope === 'official_cards' ? cardCount.official : cardCount.total ?? cardCount.official) : null);
  const value = Number(direct);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function verified(row: Row, field: 'nativeImageAvailability' | 'logoAvailability' | 'symbolAvailability') {
  return row[field] === 'verified_available' || row[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] === 'verified_available';
}
function key(languageCode: Language, value: string) { return `${languageCode}:${normal(value)}`; }
function countBy<T>(rows: T[], predicate: (row: T) => boolean) { return rows.filter(predicate).length; }

export function buildFourLanguageCatalogueCoverage(input: {
  catalogue: Input;
  provider?: Input | null;
  inputSha256?: Record<string, string>;
  generatedAt?: string;
}) {
  const observedSets = input.catalogue.sets.filter((row) => language(row.language) && id(row));
  const observedCards = input.catalogue.cards.filter((row) => language(row.language) && id(row));
  const providerSets = input.provider?.sets.filter((row) => language(row.language) && id(row)) ?? [];
  const providerCards = input.provider?.cards.filter((row) => language(row.language) && id(row)) ?? [];
  const conflicts: Row[] = [];
  const duplicateIds = (rows: Row[], label: string, getKey: (row: Row) => string | null) => {
    const seen = new Map<string, Row>();
    for (const row of rows) {
      const identity = getKey(row); if (!identity) continue;
      const previous = seen.get(identity);
      if (previous && stableJson(previous) !== stableJson(row)) conflicts.push({ type: `duplicate_${label}_identity`, identity, message: 'Rows share an identity but differ; neither was selected as authoritative.' });
      else if (!previous) seen.set(identity, row);
    }
  };
  duplicateIds(observedSets, 'observed_set', (row) => { const code = language(row.language); const value = id(row); return code && value ? key(code, value) : null; });
  duplicateIds(observedCards, 'observed_card', (row) => { const code = language(row.language); const value = id(row); return code && value ? key(code, value) : null; });
  duplicateIds(providerSets, 'provider_set', (row) => { const code = language(row.language); const value = id(row); return code && value ? key(code, value) : null; });
  duplicateIds(providerCards, 'provider_card', (row) => { const code = language(row.language); const value = id(row); return code && value ? key(code, value) : null; });

  const setLanguages = new Map<string, Set<Language>>();
  for (const row of observedSets) { const value = id(row)!; const code = language(row.language)!; const group = setLanguages.get(normal(value)) ?? new Set<Language>(); group.add(code); setLanguages.set(normal(value), group); }
  const crossLanguageSetIds = [...setLanguages.entries()].filter(([, codes]) => codes.size > 1).map(([setId, codes]) => ({ setId, languages: [...codes].sort() }));

  const providerSetKeys = new Set(providerSets.map((row) => key(language(row.language)!, id(row)!)));
  const providerCardsBySet = new Map<string, Row[]>();
  for (const card of providerCards) {
    const code = language(card.language)!; const setId = cardSetId(card); if (!setId) continue;
    const group = providerCardsBySet.get(key(code, setId)) ?? []; group.push(card); providerCardsBySet.set(key(code, setId), group);
  }
  const observedCardsBySet = new Map<string, Row[]>();
  for (const card of observedCards) {
    const code = language(card.language)!; const setId = cardSetId(card); if (!setId) { conflicts.push({ type: 'observed_card_missing_set_identity', cardId: id(card), language: code }); continue; }
    const group = observedCardsBySet.get(key(code, setId)) ?? []; group.push(card); observedCardsBySet.set(key(code, setId), group);
  }
  const allSetKeys = new Set<string>([...providerSetKeys, ...observedSets.map((row) => key(language(row.language)!, id(row)!)), ...providerCardsBySet.keys(), ...observedCardsBySet.keys()]);
  const sets = [...allSetKeys].sort().map((setKey) => {
    const [languageCode, ...idParts] = setKey.split(':'); const setId = idParts.join(':'); const code = languageCode as Language;
    const observed = observedSets.find((row) => key(language(row.language)!, id(row)!) === setKey) ?? null;
    const provider = providerSets.find((row) => key(language(row.language)!, id(row)!) === setKey) ?? null;
    const observedSetCards = observedCardsBySet.get(setKey) ?? [];
    const providerSetCards = providerCardsBySet.get(setKey);
    const nativeName = observed ? localName(observed) : null;
    const expectedCards = providerSetCards ? providerSetCards.length : provider ? declaredExpectedCards(provider) : null;
    const declaredObservedCardCount = observed?.observedCardCount;
    const observedCardCount = typeof declaredObservedCardCount === 'number' && Number.isSafeInteger(declaredObservedCardCount) && declaredObservedCardCount >= 0
      ? declaredObservedCardCount
      : observed ? (Object.prototype.hasOwnProperty.call(observed, 'observedCardCount') ? null : observedSetCards.length) : observedSetCards.length;
    const observedVariantCount = typeof observed?.observedVariantCount === 'number' && Number.isSafeInteger(observed.observedVariantCount) && observed.observedVariantCount >= 0
      ? observed.observedVariantCount
      : null;
    const aggregateObservedCards = Boolean(observed && Object.prototype.hasOwnProperty.call(observed, 'observedCardCount'));
    return {
      language: code, setId,
      expectedSource: providerSetCards ? 'provider_card_inventory' : expectedCards !== null ? 'provider_set_declared_card_count' : provider ? 'provider_set_inventory_without_card_denominator' : 'unknown',
      expectedCards,
      observedCards: observedCardCount,
      observedVariants: observedVariantCount,
      missingObservedCards: expectedCards === null || observedCardCount === null ? null : Math.max(expectedCards - observedCardCount, 0),
      observedSet: Boolean(observed), providerSet: Boolean(provider),
      metadata: {
        missingNativeName: Boolean(observed) && !nativeName,
        missingEnglishSupplement: Boolean(observed && code !== 'en' && !englishName(observed)),
        missingReleaseDate: Boolean(observed && !releaseDate(observed)),
      },
      cards: {
        metadataCoverage: aggregateObservedCards ? 'aggregate_only_unknown_fields' : 'row_level',
        missingNativeName: aggregateObservedCards ? null : countBy(observedSetCards, (row) => !localName(row)),
        missingEnglishSupplement: aggregateObservedCards ? null : countBy(observedSetCards, (row) => code !== 'en' && !englishName(row)),
        missingCollectorIdentity: aggregateObservedCards ? null : countBy(observedSetCards, (row) => !text(row.number) && !text(row.collectorNumber) && !text(row.collector_number)),
        missingRarity: aggregateObservedCards ? null : countBy(observedSetCards, (row) => !text(row.rarity)),
        missingReleaseDate: aggregateObservedCards ? null : countBy(observedSetCards, (row) => !releaseDate(row)),
        imagePointers: aggregateObservedCards ? null : countBy(observedSetCards, (row) => Boolean(imagePointer(row))),
        verifiedNativeImages: aggregateObservedCards ? null : countBy(observedSetCards, (row) => verified(row, 'nativeImageAvailability')),
        unverifiedImagePointers: aggregateObservedCards ? null : countBy(observedSetCards, (row) => Boolean(imagePointer(row)) && !verified(row, 'nativeImageAvailability')),
      },
      marks: {
        logoPointer: Boolean(observed && markPointer(observed, 'logo')), logoVerifiedAvailable: Boolean(observed && verified(observed, 'logoAvailability')),
        symbolPointer: Boolean(observed && markPointer(observed, 'symbol')), symbolVerifiedAvailable: Boolean(observed && verified(observed, 'symbolAvailability')),
      },
    };
  });
  const byLanguage = FOUR_CATALOGUE_LANGUAGES.map((code) => {
    const rows = sets.filter((set) => set.language === code);
    return {
      language: code, sets: rows.length,
      providerExpectedSets: rows.filter((set) => set.expectedSource !== 'unknown').length,
      unknownCardDenominatorSets: rows.filter((set) => set.expectedCards === null).length,
      expectedCards: rows.some((set) => set.expectedCards === null) ? null : rows.reduce((total, set) => total + (set.expectedCards ?? 0), 0),
      observedCards: rows.some((set) => set.observedCards === null) ? null : rows.reduce((total, set) => total + (set.observedCards ?? 0), 0),
      missingObservedCards: rows.some((set) => set.missingObservedCards === null) ? null : rows.reduce((total, set) => total + (set.missingObservedCards ?? 0), 0),
      verifiedNativeImages: rows.some((set) => set.cards.verifiedNativeImages === null) ? null : rows.reduce((total, set) => total + (set.cards.verifiedNativeImages ?? 0), 0),
      unverifiedImagePointers: rows.some((set) => set.cards.unverifiedImagePointers === null) ? null : rows.reduce((total, set) => total + (set.cards.unverifiedImagePointers ?? 0), 0),
    };
  });
  return {
    schemaVersion: 'stackr-four-language-catalogue-coverage-v1', generatedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
    readOnly: true, networkAccessed: false, databaseModified: false, storageModified: false,
    languages: FOUR_CATALOGUE_LANGUAGES, inputSha256: input.inputSha256 ?? {},
    imageSemantics: 'An image pointer is not load evidence. Only explicit verified_available fields count as verified native availability; this report performs no network probe.',
    expectedPopulationSemantics: 'Provider card inventory is the only expected card denominator. Provider set-only input and absent provider input remain unknown.',
    byLanguage, sets, crossLanguageSetIds, conflicts,
  };
}

function value(name: string) { return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? ''; }
function main() {
  if (process.argv.includes('--help')) { console.log('npx tsx scripts/audit-four-language-catalogue-coverage.ts --catalogue=FILE [--provider=FILE] [--output=FILE]'); return; }
  const cataloguePath = value('catalogue'); if (!cataloguePath) throw new Error('--catalogue=FILE is required.');
  const catalogue = parseInput(resolve(cataloguePath), 'catalogue input');
  const providerPath = value('provider'); const provider = providerPath ? parseInput(resolve(providerPath), 'provider input') : null;
  const report = buildFourLanguageCatalogueCoverage({ catalogue: catalogue.input, provider: provider?.input, inputSha256: { catalogue: catalogue.sha256, ...(provider ? { provider: provider.sha256 } : {}) } });
  const output = value('output'); const body = stableJson(report);
  if (output) { const path = resolve(output); if (existsSync(path)) throw new Error('Refusing to overwrite --output.'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body, { flag: 'wx' }); }
  process.stdout.write(body);
}
if (require.main === module) { try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; } }
