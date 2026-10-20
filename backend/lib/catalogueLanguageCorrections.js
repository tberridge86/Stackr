import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function validateCatalogueCorrectionAliases(value) {
  if (value.schemaVersion !== 1 || value.cohort !== 'chinese-language-correction-20261010' || value.targetLanguage !== 'zh-tw') throw new Error('Invalid catalogue correction metadata');
  const expected = { sets: 'de6c97ccdd1548ffc9604b407876a5c4', printings: 'c03c33e8deae5bfd0ca7cdea05fc5d51', variants: '0dcc5a5aeafe04aaaa3fd0d854ff2f4f' };
  for (const [kind, digest] of Object.entries(expected)) {
    const entries = Object.entries(value[kind] ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const actual = createHash('md5').update(entries.map(([source, target]) => `${source}:${target}`).join(',')).digest('hex');
    if (actual !== digest) throw new Error(`Unreviewed catalogue correction mapping: ${kind}`);
  }
  return value;
}

// Immutable, reviewed cohort only. These are identity corrections, never
// image/price fallbacks between two valid language printings.
const aliases = validateCatalogueCorrectionAliases(JSON.parse(readFileSync(new URL('../data/chinese-language-correction-aliases.json', import.meta.url), 'utf8')));
export const CORRECTION_LANGUAGE = aliases.targetLanguage;

export function correctedCatalogueSetId(id) {
  return aliases.sets[String(id).toLowerCase()] ?? id;
}

export function correctedCatalogueCardId(id) {
  const key = String(id).toLowerCase();
  return aliases.printings[key] ?? aliases.variants[key] ?? id;
}
