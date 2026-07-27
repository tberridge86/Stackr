import { PRICE_API_URL, USD_TO_GBP } from './config';
import {
  fetchTcgcsvUiProductPricesForSet,
  type TcgcsvUiProductPriceRow,
} from './pricing';
import { fetchAllSets, getPokemonCardLanguageLabel, normalizePokemonCardLanguage, type PokemonSet } from './pokemonTcg';
import { getPreferredSetDisplayName } from './pokemonDisplayNames';
import { supabase } from './supabase';
import type { InventoryCardSnapshot } from './inventory';

export type ProductLookupType =
  | 'sealed_product'
  | 'booster_pack'
  | 'sleeved_booster_pack'
  | 'booster_bundle'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'pokemon_center_elite_trainer_box'
  | 'collection_bundle'
  | 'collection_box'
  | 'special_collection'
  | 'premium_collection'
  | 'starter_deck'
  | 'theme_deck'
  | 'deck_build_box'
  | 'high_class_pack'
  | 'special_set'
  | 'promo_pack'
  | 'blister'
  | 'tin'
  | 'display'
  | 'case'
  | 'other'
  | 'accessories';

export type ProductPriceResult = {
  low: number | null;
  average: number | null;
  high: number | null;
  tcgLow?: number | null;
  tcgMid?: number | null;
  tcgMarket?: number | null;
  tcgProductId?: number | null;
  count: number | null;
  query: string;
  soldDataSource: string | null;
};

export type MarketProduct = {
  id: string;
  product_type: ProductLookupType;
  name: string;
  set_name: string | null;
  language?: string | null;
  release_year?: string | null;
  image_url: string | null;
  image_large_url: string | null;
  aliases: string[];
  search_text: string;
  source: string | null;
  latest_price?: ProductPriceResult | null;
};

export const PRODUCT_LOOKUP_OPTIONS: {
  key: ProductLookupType;
  label: string;
  icon: string;
}[] = [
  { key: 'sealed_product', label: 'Sealed Product', icon: 'cube-outline' },
  { key: 'booster_pack', label: 'Booster Pack', icon: 'file-tray-full-outline' },
  { key: 'sleeved_booster_pack', label: 'Sleeved Pack', icon: 'file-tray-full-outline' },
  { key: 'booster_bundle', label: 'Booster Bundle', icon: 'file-tray-stacked-outline' },
  { key: 'booster_box', label: 'Booster Box', icon: 'archive-outline' },
  { key: 'elite_trainer_box', label: 'Elite Trainer Box', icon: 'file-tray-stacked-outline' },
  { key: 'collection_bundle', label: 'Collection Bundle', icon: 'cube-outline' },
  { key: 'accessories', label: 'Accessories', icon: 'layers-outline' },
];

export const PRODUCT_QUERY_SUFFIX: Record<ProductLookupType | 'raw_card' | 'graded_slab', string> = {
  raw_card: 'pokemon card',
  graded_slab: 'pokemon graded slab',
  sealed_product: 'pokemon sealed product',
  booster_pack: 'pokemon booster pack sealed',
  sleeved_booster_pack: 'pokemon sleeved booster pack sealed',
  booster_bundle: 'pokemon booster bundle sealed',
  booster_box: 'pokemon booster box sealed',
  elite_trainer_box: 'pokemon elite trainer box sealed',
  pokemon_center_elite_trainer_box: 'pokemon center elite trainer box sealed',
  collection_bundle: 'pokemon collection box sealed',
  collection_box: 'pokemon collection box sealed',
  special_collection: 'pokemon special collection sealed',
  premium_collection: 'pokemon premium collection sealed',
  starter_deck: 'pokemon starter deck sealed',
  theme_deck: 'pokemon theme deck sealed',
  deck_build_box: 'pokemon deck build box sealed',
  high_class_pack: 'pokemon japanese high class pack sealed',
  special_set: 'pokemon japanese special set sealed',
  promo_pack: 'pokemon japanese promo pack sealed',
  blister: 'pokemon blister pack sealed',
  tin: 'pokemon tin sealed',
  display: 'pokemon display box sealed',
  case: 'pokemon case sealed',
  other: 'pokemon product',
  accessories: 'pokemon card accessories',
};

export const productLookupLabel = (type: ProductLookupType) =>
  PRODUCT_LOOKUP_OPTIONS.find((option) => option.key === type)?.label ?? PRODUCT_FALLBACK_LABELS[type] ?? 'Product';

export const buildProductQuery = (text: string, type: ProductLookupType | 'raw_card' | 'graded_slab') =>
  `${text.trim()} ${PRODUCT_QUERY_SUFFIX[type]}`.trim();

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);

export const productInventoryId = (name: string, type: ProductLookupType) =>
  `product:${type}:${slugify(name) || 'item'}`;

const normaliseText = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/pokemon|pok[e\u00e9]mon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .trim();

const buildSearchText = (name: string, type: ProductLookupType, aliases: string[] = [], setName?: string | null) =>
  [
    name,
    productLookupLabel(type),
    type.replace(/_/g, ' '),
    setName ?? '',
    ...aliases,
  ].map(normaliseText).filter(Boolean).join(' ');

const PRODUCT_FALLBACK_LABELS: Record<ProductLookupType, string> = {
  sealed_product: 'Sealed Product',
  booster_pack: 'Booster Pack',
  sleeved_booster_pack: 'Sleeved Booster Pack',
  booster_bundle: 'Booster Bundle',
  booster_box: 'Booster Box',
  elite_trainer_box: 'Elite Trainer Box',
  pokemon_center_elite_trainer_box: 'Pokemon Center Elite Trainer Box',
  collection_bundle: 'Collection Box',
  collection_box: 'Collection Box',
  special_collection: 'Special Collection',
  premium_collection: 'Premium Collection',
  starter_deck: 'Starter Deck',
  theme_deck: 'Theme Deck',
  deck_build_box: 'Deck Build Box',
  high_class_pack: 'High-Class Pack',
  special_set: 'Special Set',
  promo_pack: 'Promo Pack',
  blister: 'Blister',
  tin: 'Tin',
  display: 'Display',
  case: 'Case',
  other: 'Other Product',
  accessories: 'Accessories',
};

const PRODUCT_FALLBACK_ALIASES: Record<ProductLookupType, string[]> = {
  sealed_product: ['sealed', 'sealed product'],
  booster_pack: ['pack', 'single pack', 'loose pack'],
  sleeved_booster_pack: ['sleeved pack', 'blister pack', 'sleeved booster'],
  booster_bundle: ['bundle', 'booster bundle'],
  booster_box: ['box', 'booster box', 'booster display', 'display box'],
  elite_trainer_box: ['etb', 'elite trainer box'],
  pokemon_center_elite_trainer_box: ['pokemon center etb', 'pokemon center elite trainer box'],
  collection_bundle: ['collection', 'collection box', 'premium collection'],
  collection_box: ['collection', 'collection box'],
  special_collection: ['special collection', 'special set'],
  premium_collection: ['premium collection', 'ultra premium', 'premium box'],
  starter_deck: ['starter deck', 'start deck', 'starter set'],
  theme_deck: ['theme deck', 'battle deck'],
  deck_build_box: ['deck build box', 'deck build'],
  high_class_pack: ['high class pack', 'high-class pack', 'japanese high class'],
  special_set: ['special set', 'special deck set', 'japanese special'],
  promo_pack: ['promo pack', 'promotional pack', 'jp promo'],
  blister: ['blister', 'blister pack', 'checklane blister'],
  tin: ['tin', 'collector tin', 'mini tin'],
  display: ['display', 'booster display'],
  case: ['case', 'sealed case'],
  other: ['product', 'sealed product'],
  accessories: ['accessory', 'sleeves', 'binder', 'deck box', 'playmat'],
};

const PRODUCT_QUERY_STOPWORDS: Record<ProductLookupType, string[]> = {
  sealed_product: ['sealed', 'product'],
  booster_pack: ['booster', 'pack', 'single', 'loose', 'sealed'],
  sleeved_booster_pack: ['sleeved', 'blister', 'booster', 'pack', 'sealed'],
  booster_bundle: ['booster', 'bundle', 'sealed'],
  booster_box: ['booster', 'box', 'display', 'sealed'],
  elite_trainer_box: ['elite', 'trainer', 'box', 'etb', 'sealed'],
  pokemon_center_elite_trainer_box: ['pokemon', 'center', 'elite', 'trainer', 'box', 'etb', 'sealed'],
  collection_bundle: ['collection', 'box', 'premium', 'ultra', 'sealed'],
  collection_box: ['collection', 'box', 'sealed'],
  special_collection: ['special', 'collection', 'box', 'sealed'],
  premium_collection: ['premium', 'collection', 'box', 'sealed'],
  starter_deck: ['starter', 'start', 'deck', 'sealed'],
  theme_deck: ['theme', 'battle', 'deck', 'sealed'],
  deck_build_box: ['deck', 'build', 'box', 'sealed'],
  high_class_pack: ['high', 'class', 'pack', 'sealed', 'japanese'],
  special_set: ['special', 'set', 'sealed', 'japanese'],
  promo_pack: ['promo', 'promotional', 'pack', 'sealed'],
  blister: ['blister', 'booster', 'pack', 'sealed'],
  tin: ['tin', 'sealed'],
  display: ['display', 'box', 'sealed'],
  case: ['case', 'sealed'],
  other: ['product', 'sealed'],
  accessories: ['accessory', 'accessories'],
};

function getLargeTcgcsvImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  return imageUrl.replace(/_200w(\.[a-z]+)$/i, '_400w$1');
}

function toGbp(value: number | null | undefined) {
  return typeof value === 'number' ? Math.round(value * USD_TO_GBP * 100) / 100 : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeTcgcsvProductPrice(product: TcgcsvUiProductPriceRow): ProductPriceResult | null {
  const saleableVariants = product.variants.filter((variant) => {
    const label = normaliseText(variant.subTypeName ?? '');
    return !/\b(case|lot|master case)\b/.test(label);
  });
  const variants = saleableVariants.length ? saleableVariants : product.variants;
  const lows = variants.map((variant) => variant.lowPrice).filter((value): value is number => typeof value === 'number');
  const mids = variants.map((variant) => variant.midPrice).filter((value): value is number => typeof value === 'number');
  const markets = variants.map((variant) => variant.marketPrice).filter((value): value is number => typeof value === 'number');
  const tcgLow = toGbp(lows.length ? Math.min(...lows) : null);
  const tcgMid = toGbp(average(mids));
  const tcgMarket = toGbp(average(markets));
  const averagePrice = tcgMarket ?? tcgMid ?? tcgLow;

  if (averagePrice == null && tcgLow == null && tcgMid == null && tcgMarket == null) return null;

  return {
    low: tcgLow,
    average: averagePrice,
    high: null,
    tcgLow,
    tcgMid,
    tcgMarket,
    tcgProductId: product.productId,
    count: variants.length || null,
    query: product.name,
    soldDataSource: 'tcgcsv',
  };
}

function classifyTcgcsvProductType(name: string): ProductLookupType | null {
  const lower = name.toLowerCase();
  if (lower.includes('code card') || lower.includes('empty box')) return null;
  if (lower.includes('deck box') || lower.includes('sleeves') || lower.includes('playmat') || lower.includes('binder') || lower.includes('portfolio')) {
    return 'accessories';
  }
  if (/\bcase\b/.test(lower) || lower.includes('master case')) return 'case';
  if (lower.includes('pokemon center elite trainer box') || lower.includes('pokemon center etb')) return 'pokemon_center_elite_trainer_box';
  if (lower.includes('elite trainer box') || /\betb\b/.test(lower)) return 'elite_trainer_box';
  if (lower.includes('high class pack') || lower.includes('high-class pack')) return 'high_class_pack';
  if (lower.includes('booster bundle')) return 'booster_bundle';
  if (lower.includes('booster box') || lower.includes('booster display')) return 'booster_box';
  if (lower.includes('sleeved booster')) return 'sleeved_booster_pack';
  if (
    lower.includes('blister pack') ||
    lower.includes('checklane blister') ||
    lower.includes('3-pack blister') ||
    lower.includes('three-pack blister') ||
    lower.includes('single pack blister')
  ) {
    return 'blister';
  }
  if (lower.includes('booster pack')) return 'booster_pack';
  if (lower.includes('starter deck') || lower.includes('start deck') || lower.includes('starter set')) return 'starter_deck';
  if (lower.includes('theme deck') || lower.includes('battle deck')) return 'theme_deck';
  if (lower.includes('deck build box') || lower.includes('deck build')) return 'deck_build_box';
  if (lower.includes('special set')) return 'special_set';
  if (lower.includes('premium collection') || lower.includes('ultra-premium') || lower.includes('ultra premium') || lower.includes('premium box')) {
    return 'premium_collection';
  }
  if (lower.includes('special collection')) return 'special_collection';
  if (lower.includes('collection')) return 'collection_box';
  if (lower.includes('mini tin') || /\btin\b/.test(lower)) return 'tin';
  if (
    lower.includes('build & battle') ||
    lower.includes('build and battle') ||
    lower.includes('trainer toolkit')
  ) {
    return 'collection_bundle';
  }

  return null;
}

function tcgcsvProductMatchesType(product: TcgcsvUiProductPriceRow, type: ProductLookupType) {
  const classifiedType = classifyTcgcsvProductType(product.name);
  if (type === 'sealed_product') return classifiedType != null && classifiedType !== 'accessories';
  return classifiedType === type;
}

function getProductTypeHints(type: ProductLookupType) {
  switch (type) {
    case 'pokemon_center_elite_trainer_box':
      return ['pokemon center elite trainer box', 'pokemon center etb'];
    case 'elite_trainer_box':
      return ['elite trainer box', 'etb'];
    case 'booster_box':
      return ['booster box', 'booster display'];
    case 'booster_bundle':
      return ['booster bundle'];
    case 'booster_pack':
      return ['booster pack', 'loose pack'];
    case 'sleeved_booster_pack':
      return ['sleeved booster', 'blister pack', 'checklane blister'];
    case 'blister':
      return ['blister pack', 'checklane blister', '3 pack blister'];
    case 'collection_bundle':
      return ['collection', 'premium collection', 'ultra premium', 'tin', 'build battle'];
    case 'collection_box':
      return ['collection box', 'collection'];
    case 'special_collection':
      return ['special collection'];
    case 'premium_collection':
      return ['premium collection', 'ultra premium'];
    case 'starter_deck':
      return ['starter deck', 'start deck', 'starter set'];
    case 'theme_deck':
      return ['theme deck', 'battle deck'];
    case 'deck_build_box':
      return ['deck build box', 'deck build'];
    case 'high_class_pack':
      return ['high class pack', 'high-class pack'];
    case 'special_set':
      return ['special set'];
    case 'promo_pack':
      return ['promo pack', 'promotional pack'];
    case 'tin':
      return ['tin', 'mini tin', 'collector tin'];
    case 'display':
      return ['display', 'booster display'];
    case 'case':
      return ['case', 'sealed case'];
    case 'accessories':
      return ['sleeves', 'binder', 'playmat', 'deck box'];
    case 'other':
      return ['sealed product', 'product'];
    case 'sealed_product':
    default:
      return ['sealed product'];
  }
}

function scoreTcgcsvProductMatch(
  product: MarketProduct,
  candidate: TcgcsvUiProductPriceRow,
  type: ProductLookupType
) {
  const productName = normaliseText(product.name);
  const candidateName = normaliseText(candidate.name);
  const productSet = normaliseText(product.set_name ?? '');
  const candidateSet = normaliseText(candidate.groupName);
  const candidateType = classifyTcgcsvProductType(candidate.name);
  let score = 0;

  if (candidateName === productName) score += 120;
  if (candidateName.includes(productName) || productName.includes(candidateName)) score += 65;
  if (productSet && candidateSet.includes(productSet)) score += 25;
  if (candidate.imageUrl) score += 8;
  if (candidateType && (candidateType === type || product.product_type === candidateType)) score += 30;
  if (type === 'sealed_product' && candidateType && candidateType !== 'accessories') score += 12;

  const productWords = productName.split(/\s+/).filter((word) => word.length > 2);
  const sharedWords = productWords.filter((word) => candidateName.includes(word));
  score += Math.min(sharedWords.length * 5, 35);

  for (const alias of product.aliases.map(normaliseText)) {
    if (alias && (candidateName.includes(alias) || alias.includes(candidateName))) score += 20;
  }

  for (const hint of getProductTypeHints(product.product_type)) {
    if (candidateName.includes(normaliseText(hint))) score += 10;
  }

  if (candidateName.includes('code card')) score -= 100;
  if (candidateName.includes('case') && !productName.includes('case')) score -= 45;

  return score;
}

function buildTcgcsvProductAliases(
  product: TcgcsvUiProductPriceRow,
  set: PokemonSet,
  type: ProductLookupType
) {
  const releaseYear = set.releaseDate ? String(new Date(set.releaseDate).getFullYear()) : null;
  return [
    product.name,
    product.groupName,
    set.name,
    set.id,
    set.series,
    getPokemonCardLanguageLabel(set.language),
    set.language,
    releaseYear,
    ...PRODUCT_FALLBACK_ALIASES[type],
  ].filter((value): value is string => Boolean(value?.trim()));
}

function mapTcgcsvProductToMarketProduct(
  product: TcgcsvUiProductPriceRow,
  set: PokemonSet,
  requestedType: ProductLookupType
): MarketProduct {
  const classifiedType = classifyTcgcsvProductType(product.name);
  const productType = requestedType === 'sealed_product'
    ? (classifiedType ?? requestedType)
    : requestedType;
  const releaseYear = set.releaseDate ? String(new Date(set.releaseDate).getFullYear()) : null;
  const languageLabel = getPokemonCardLanguageLabel(set.language);
  const aliases = buildTcgcsvProductAliases(product, set, productType);

  return {
    id: productInventoryId(`${set.name} ${product.name}`, productType),
    product_type: productType,
    name: product.name,
    set_name: set.name,
    language: languageLabel,
    release_year: releaseYear,
    image_url: product.imageUrl,
    image_large_url: getLargeTcgcsvImageUrl(product.imageUrl),
    aliases,
    search_text: buildSearchText(product.name, productType, aliases, set.name),
    source: 'tcgcsv',
    latest_price: summarizeTcgcsvProductPrice(product),
  };
}

async function fetchTcgcsvProductsForSet(setName: string) {
  try {
    return await fetchTcgcsvUiProductPricesForSet(setName);
  } catch (error) {
    console.log('TCGCSV product media lookup failed', { setName, error });
    return [];
  }
}

async function getTcgcsvProductFallbackProducts(
  sets: PokemonSet[],
  type: ProductLookupType,
  limit: number
) {
  const products: MarketProduct[] = [];
  const setsToCheck = sets.slice(0, Math.min(sets.length, 8));

  for (const set of setsToCheck) {
    const rows = await fetchTcgcsvProductsForSet(set.name);
    for (const row of rows) {
      if (!tcgcsvProductMatchesType(row, type)) continue;
      products.push(mapTcgcsvProductToMarketProduct(row, set, type));
      if (products.length >= limit) return products;
    }
  }

  return products;
}

async function enrichProductsWithTcgcsvMedia(
  products: MarketProduct[],
  type?: ProductLookupType
) {
  const productsNeedingEnrichment = products.filter((product) =>
    product.set_name && (
      !product.image_url ||
      !product.image_large_url ||
      product.latest_price?.average == null ||
      product.source === 'tcgcsv' ||
      product.source === 'set_catalog'
    )
  );
  if (!productsNeedingEnrichment.length) return products;

  const productsBySet = new Map<string, MarketProduct[]>();
  for (const product of productsNeedingEnrichment) {
    const setName = product.set_name;
    if (!setName) continue;
    if (!productsBySet.has(setName)) productsBySet.set(setName, []);
    productsBySet.get(setName)!.push(product);
  }

  const enrichedById = new Map<string, MarketProduct>();
  const setEntries = [...productsBySet.entries()].slice(0, 8);
  for (const [setName, setProducts] of setEntries) {
    const candidates = await fetchTcgcsvProductsForSet(setName);
    if (!candidates.length) continue;

    for (const product of setProducts) {
      const requestedType = type ?? product.product_type;
      const best = candidates
        .filter((candidate) => tcgcsvProductMatchesType(candidate, requestedType))
        .map((candidate) => ({ candidate, score: scoreTcgcsvProductMatch(product, candidate, requestedType) }))
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < 40) continue;

      const tcgcsvPrice = summarizeTcgcsvProductPrice(best.candidate);
      const hasStrongTcgcsvMatch = best.score >= 80;
      const shouldUpdateImage = Boolean(best.candidate.imageUrl) && (
        !product.image_url ||
        !product.image_large_url ||
        product.source === 'tcgcsv' ||
        product.source === 'set_catalog' ||
        hasStrongTcgcsvMatch
      );
      const shouldUpdatePrice = product.latest_price?.average == null && tcgcsvPrice != null;

      if (!shouldUpdateImage && !shouldUpdatePrice) continue;

      enrichedById.set(product.id, {
        ...product,
        image_url: shouldUpdateImage ? best.candidate.imageUrl : product.image_url,
        image_large_url: shouldUpdateImage ? getLargeTcgcsvImageUrl(best.candidate.imageUrl) : product.image_large_url,
        source: product.source === 'set_catalog' ? 'tcgcsv' : product.source,
        latest_price: shouldUpdatePrice ? tcgcsvPrice : product.latest_price,
      });
    }
  }

  if (!enrichedById.size) return products;
  return products.map((product) => enrichedById.get(product.id) ?? product);
}

function getSetFallbackQuery(text: string, type?: ProductLookupType) {
  const words = normaliseText(text).split(/\s+/).filter(Boolean);
  if (!type) return words.join(' ');
  const stopwords = new Set([...PRODUCT_QUERY_STOPWORDS[type], 'pokemon', 'tcg']);
  const setWords = words.filter((word) => !stopwords.has(word));
  return (setWords.length ? setWords : words).join(' ');
}

function boundedSetEditDistance(a: string, b: string, maxDistance: number) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function getSetProductSearchText(set: PokemonSet) {
  const raw = (set as any).raw_data ?? {};
  const preferredName = getPreferredSetDisplayName({
    id: set.id,
    sourceId: set.externalIds?.tcgdex ?? raw.source_id ?? raw.provider_id ?? set.id,
    setCode: set.externalIds?.setCode ?? raw.set_code ?? set.id,
    language: set.language ?? raw.language ?? null,
    region: set.region ?? raw.region ?? null,
    localName: set.localName ?? raw.local_name ?? raw.name ?? null,
    englishDisplayName: set.englishDisplayName ?? raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: set.name,
    fallbackName: set.id,
    raw,
  });

  return normaliseText([
    preferredName,
    set.name,
    set.id,
    set.series,
    set.localName,
    set.englishDisplayName,
    [
      normalizePokemonCardLanguage(set.language),
      getPokemonCardLanguageLabel(set.language),
      normalizePokemonCardLanguage(set.language) === 'ja' ? 'jp jpn japan japanese vintage modern' : null,
      normalizePokemonCardLanguage(set.language) === 'zh-tw' ? 'zh zhtw zh tw chinese traditional taiwan tc' : null,
    ].filter(Boolean).join(' '),
    set.region ?? '',
    set.externalIds ? Object.values(set.externalIds).join(' ') : '',
    set.releaseDate ? new Date(set.releaseDate).getFullYear().toString() : '',
  ].filter(Boolean).join(' '));
}

function fuzzySetWordMatches(word: string, tokens: string[]) {
  const fuzzyLimit = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
  return tokens.some((token) => {
    if (token === word) return true;
    if (token.includes(word) && word.length >= 3) return true;
    if (word.includes(token) && token.length >= 4) return true;
    return fuzzyLimit > 0 && boundedSetEditDistance(word, token, fuzzyLimit) <= fuzzyLimit;
  });
}

function setMatchesProductSearch(set: PokemonSet, normalizedQuery: string) {
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!queryWords.length) return false;

  const haystack = getSetProductSearchText(set);
  const tokens = haystack.split(/\s+/).filter(Boolean);

  return queryWords.every((word) => haystack.includes(word) || fuzzySetWordMatches(word, tokens));
}

function setProductFallbackName(setName: string, type: ProductLookupType) {
  if (type === 'sealed_product') return `${setName} sealed product`;
  if (type === 'accessories') return `${setName} accessories`;
  return `${setName} ${PRODUCT_FALLBACK_LABELS[type]}`;
}

function buildSetProductFallback(set: PokemonSet, type: ProductLookupType): MarketProduct {
  const label = PRODUCT_FALLBACK_LABELS[type];
  const name = setProductFallbackName(set.name, type);
  const releaseYear = set.releaseDate ? String(new Date(set.releaseDate).getFullYear()) : null;
  const languageLabel = getPokemonCardLanguageLabel(set.language);
  const aliases = [
    set.id,
    set.series,
    set.language,
    languageLabel,
    releaseYear,
    ...PRODUCT_FALLBACK_ALIASES[type],
    ...PRODUCT_FALLBACK_ALIASES[type].map((alias) => `${set.name} ${alias}`),
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    id: productInventoryId(name, type),
    product_type: type,
    name,
    set_name: set.name,
    language: languageLabel,
    release_year: releaseYear,
    image_url: set.images?.logo ?? set.images?.symbol ?? null,
    image_large_url: set.images?.logo ?? set.images?.symbol ?? null,
    aliases,
    search_text: buildSearchText(name, type, aliases, set.name),
    source: 'set_catalog',
    latest_price: null,
  };
}

async function getSetCatalogFallbackProducts(
  text: string,
  type?: ProductLookupType,
  limit = 20,
  language?: string | null
): Promise<MarketProduct[]> {
  if (!type || type === 'accessories') return [];

  const trimmed = normaliseText(text);
  if (trimmed.length < 2) return [];
  const setQuery = getSetFallbackQuery(text, type);
  if (setQuery.length < 2) return [];

  try {
    const languageFilter = language ? normalizePokemonCardLanguage(language) : 'all';
    const sets = await fetchAllSets({ language: languageFilter });
    const matchedSets = sets
      .filter((set) => setMatchesProductSearch(set, setQuery))
      .slice(0, Math.max(limit, 8));
    const tcgcsvFallbacks = await getTcgcsvProductFallbackProducts(matchedSets, type, limit);
    const tcgcsvSetNames = new Set(tcgcsvFallbacks.map((product) => normaliseText(product.set_name ?? '')));
    const tcgcsvSetKeys = new Set(tcgcsvFallbacks.map((product) => [
      normaliseText(product.set_name ?? ''),
      product.product_type,
    ].join(':')));
    const genericFallbacks = matchedSets
      .filter((set) => type === 'sealed_product'
        ? !tcgcsvSetNames.has(normaliseText(set.name))
        : !tcgcsvSetKeys.has([normaliseText(set.name), type].join(':')))
      .slice(0, limit)
      .map((set) => buildSetProductFallback(set, type));
    const enrichedGenericFallbacks = await enrichProductsWithTcgcsvMedia(genericFallbacks, type);
    return mergeProductResults(tcgcsvFallbacks, enrichedGenericFallbacks, limit);
  } catch (error) {
    console.log('Set catalogue product fallback failed', error);
    return [];
  }
}

function productDedupeKey(product: MarketProduct) {
  return [
    product.product_type,
    normaliseText(product.set_name ?? ''),
    normaliseText(product.name),
  ].join(':');
}

function mergeProductResults(
  primary: MarketProduct[],
  fallback: MarketProduct[],
  limit: number
) {
  const seen = new Set<string>();
  const merged: MarketProduct[] = [];
  for (const product of [...primary, ...fallback]) {
    const key = productDedupeKey(product);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(product);
    if (merged.length >= limit) break;
  }
  return merged;
}

const mapProductRow = (row: any): MarketProduct => ({
  id: row.id,
  product_type: row.product_type,
  name: row.name,
  set_name: row.set_name ?? null,
  language: row.language ?? null,
  release_year: row.release_year == null ? null : String(row.release_year),
  image_url: row.image_url ?? null,
  image_large_url: row.image_large_url ?? null,
  aliases: Array.isArray(row.aliases) ? row.aliases : [],
  search_text: row.search_text ?? '',
  source: row.source ?? null,
});

const shouldShowCatalogProduct = (product: MarketProduct) =>
  product.source !== 'user' && product.source !== 'local' && Boolean(product.set_name || product.image_url || product.image_large_url);

function marketProductMatchesLanguage(product: MarketProduct, language?: string | null) {
  if (!language) return true;
  const normalized = normalizePokemonCardLanguage(language);
  const productLanguage = String(product.language ?? '').trim().toLowerCase();
  if (!productLanguage) return normalized === 'en';
  return productLanguage === normalized || productLanguage === getPokemonCardLanguageLabel(normalized).toLowerCase();
}

function marketProductMatchesRequestedType(product: MarketProduct, type?: ProductLookupType) {
  if (!type) return true;
  if (type === 'sealed_product') return product.product_type !== 'accessories';
  return product.product_type === type;
}

const mapSnapshotRow = (row: any): ProductPriceResult => ({
  low: row?.ebay_low == null ? null : Number(row.ebay_low),
  average: row?.ebay_average == null ? null : Number(row.ebay_average),
  high: row?.ebay_high == null ? null : Number(row.ebay_high),
  tcgLow: row?.tcg_low == null ? null : Number(row.tcg_low),
  tcgMid: row?.tcg_mid == null ? null : Number(row.tcg_mid),
  tcgMarket: row?.tcg_market == null ? null : Number(row.tcg_market),
  tcgProductId: row?.tcg_product_id == null ? null : Number(row.tcg_product_id),
  count: row?.sold_count == null ? null : Number(row.sold_count),
  query: row?.query ?? '',
  soldDataSource: row?.source ?? null,
});

function isCaseProductText(value?: string | null) {
  return /\b(case|master case)\b/.test(normaliseText(value ?? ''));
}

function isSnapshotCompatibleWithProduct(row: any, product?: MarketProduct | null) {
  const productType = String(row?.product_type ?? product?.product_type ?? '').trim();
  const queryText = [row?.query, row?.product_name].filter(Boolean).join(' ');

  if (isCaseProductText(queryText) && productType !== 'case') return false;

  const query = normaliseText(queryText);
  if (productType === 'booster_box') {
    return /\bbooster box\b|\bbooster display\b/.test(query)
      && !/\b(case|bundle|pack|blister|sleeved|elite trainer|etb|build battle|build and battle)\b/.test(query);
  }

  if (productType === 'booster_bundle') {
    return /\bbooster bundle\b/.test(query) && !/\bcase\b/.test(query);
  }

  if (productType === 'booster_pack') {
    return /\bbooster pack\b/.test(query)
      && !/\b(case|bundle|art bundle|sleeved|blister)\b/.test(query);
  }

  if (productType === 'sleeved_booster_pack') {
    return /\bsleeved booster pack\b/.test(query) && !/\b(case|art bundle)\b/.test(query);
  }

  if (productType === 'elite_trainer_box') {
    return /\belite trainer box\b|\betb\b/.test(query)
      && !/\b(pokemon center|case)\b/.test(query);
  }

  if (productType === 'pokemon_center_elite_trainer_box') {
    return /\bpokemon center\b/.test(query) && !/\bcase\b/.test(query);
  }

  return true;
}

const mergeSnapshotRows = (rows: any[]): ProductPriceResult => {
  const merged: ProductPriceResult = {
    low: null,
    average: null,
    high: null,
    tcgLow: null,
    tcgMid: null,
    tcgMarket: null,
    tcgProductId: null,
    count: null,
    query: '',
    soldDataSource: null,
  };

  for (const row of rows) {
    const snapshot = mapSnapshotRow(row);
    merged.low ??= snapshot.low;
    merged.average ??= snapshot.average;
    merged.high ??= snapshot.high;
    merged.tcgLow ??= snapshot.tcgLow;
    merged.tcgMid ??= snapshot.tcgMid;
    merged.tcgMarket ??= snapshot.tcgMarket;
    merged.tcgProductId ??= snapshot.tcgProductId;
    merged.count ??= snapshot.count;
    if (!merged.query && snapshot.query) merged.query = snapshot.query;
    if (!merged.soldDataSource && snapshot.soldDataSource) merged.soldDataSource = snapshot.soldDataSource;
  }

  return merged;
};

const buildLatestProductPriceMap = (snapshots: any[] = [], products: MarketProduct[] = []) => {
  const rowsByProduct = new Map<string, any[]>();
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const snapshot of snapshots) {
    if (!snapshot.product_id) continue;
    if (!isSnapshotCompatibleWithProduct(snapshot, productById.get(snapshot.product_id))) continue;
    if (!rowsByProduct.has(snapshot.product_id)) rowsByProduct.set(snapshot.product_id, []);
    rowsByProduct.get(snapshot.product_id)!.push(snapshot);
  }

  const latestMap = new Map<string, ProductPriceResult>();
  for (const [productId, rows] of rowsByProduct.entries()) {
    latestMap.set(productId, mergeSnapshotRows(rows));
  }

  return latestMap;
};

async function fetchProductSnapshots(ids: string[]) {
  const columnsWithTcg = 'product_id, product_type, product_name, ebay_low, ebay_average, ebay_high, tcg_low, tcg_mid, tcg_market, tcg_product_id, sold_count, query, source, snapshot_at';
  const columnsLegacy = 'product_id, product_type, product_name, ebay_low, ebay_average, ebay_high, sold_count, query, source, snapshot_at';
  let result: any = await supabase
    .from('market_product_price_snapshots')
    .select(columnsWithTcg)
    .in('product_id', ids)
    .order('snapshot_at', { ascending: false });

  if (result.error && /\b(tcg_|product_type|product_name)\b/.test(String(result.error.message ?? ''))) {
    result = await supabase
      .from('market_product_price_snapshots')
      .select(columnsLegacy)
      .in('product_id', ids)
      .order('snapshot_at', { ascending: false });
  }

  return result;
}

export async function searchMarketProducts(
  text: string,
  type?: ProductLookupType,
  limit = 20,
  options: { language?: string | null } = {}
): Promise<MarketProduct[]> {
  const trimmed = normaliseText(text);
  if (trimmed.length < 2) return [];

  let query = supabase
    .from('market_products')
    .select('*')
    .limit(limit);

  if (type && type !== 'sealed_product') query = query.eq('product_type', type);
  for (const word of trimmed.split(/\s+/).filter(Boolean).slice(0, 8)) {
    query = query.ilike('search_text', `%${word}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.log('Market product search failed', error);
    return [];
  }

  const products = (data ?? [])
    .map(mapProductRow)
    .filter(shouldShowCatalogProduct)
    .filter((product) => marketProductMatchesRequestedType(product, type))
    .filter((product) => marketProductMatchesLanguage(product, options.language));
  const ids = products.map((product) => product.id);
  if (!ids.length) {
    return getSetCatalogFallbackProducts(text, type, limit, options.language);
  }

  const { data: snapshots, error: snapshotError } = await fetchProductSnapshots(ids);

  if (snapshotError) {
    const fallback = await getSetCatalogFallbackProducts(text, type, Math.max(0, limit - products.length), options.language);
    const enrichedProducts = await enrichProductsWithTcgcsvMedia(products, type);
    return mergeProductResults(enrichedProducts, fallback, limit);
  }

  const latestMap = buildLatestProductPriceMap(snapshots ?? [], products);

  const pricedProducts = products.map((product) => ({ ...product, latest_price: latestMap.get(product.id) ?? null }));
  const enrichedProducts = await enrichProductsWithTcgcsvMedia(pricedProducts, type);
  if (enrichedProducts.length >= limit) return enrichedProducts;

  const fallback = await getSetCatalogFallbackProducts(text, type, limit - enrichedProducts.length, options.language);
  return mergeProductResults(enrichedProducts, fallback, limit);
}

export async function listMarketProducts(
  type?: ProductLookupType,
  limit = 40
): Promise<MarketProduct[]> {
  let query = supabase
    .from('market_products')
    .select('*')
    .order('product_type')
    .order('name')
    .limit(limit);

  if (type && type !== 'sealed_product') query = query.eq('product_type', type);

  const { data, error } = await query;
  if (error) {
    console.log('Market product catalog failed', error);
    return [];
  }

  const products = (data ?? [])
    .map(mapProductRow)
    .filter(shouldShowCatalogProduct)
    .filter((product) => marketProductMatchesRequestedType(product, type));
  const ids = products.map((product) => product.id);
  if (!ids.length) return products;

  const { data: snapshots, error: snapshotError } = await fetchProductSnapshots(ids);

  if (snapshotError) return enrichProductsWithTcgcsvMedia(products, type);

  const latestMap = buildLatestProductPriceMap(snapshots ?? [], products);

  const pricedProducts = products.map((product) => ({ ...product, latest_price: latestMap.get(product.id) ?? null }));
  return enrichProductsWithTcgcsvMedia(pricedProducts, type);
}

export async function getMarketProductById(productId: string): Promise<MarketProduct | null> {
  const id = productId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('market_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.log('Market product lookup failed', error);
    return null;
  }

  const product = mapProductRow(data);
  if (!shouldShowCatalogProduct(product)) return null;

  const latestPrice = await getLatestProductPrice(product.id, product);
  const [enrichedProduct] = await enrichProductsWithTcgcsvMedia([{ ...product, latest_price: latestPrice }], product.product_type);
  return enrichedProduct ?? { ...product, latest_price: latestPrice };
}

export async function ensureMarketProduct(name: string, type: ProductLookupType): Promise<MarketProduct | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const id = productInventoryId(trimmed, type);
  const { data: existing } = await supabase
    .from('market_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (existing) return mapProductRow(existing);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      id,
      product_type: type,
      name: trimmed,
      set_name: null,
      image_url: null,
      image_large_url: null,
      aliases: [],
      search_text: buildSearchText(trimmed, type),
      source: 'local',
    };
  }

  const row = {
    id,
    product_type: type,
    name: trimmed,
    set_name: null,
    image_url: null,
    image_large_url: null,
    aliases: [],
    search_text: buildSearchText(trimmed, type),
    source: 'user',
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('market_products')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.log('Market product upsert failed', error);
    return mapProductRow(row);
  }

  return data ? mapProductRow(data) : mapProductRow(row);
}

export async function getLatestProductPrice(productId: string, product?: MarketProduct | null): Promise<ProductPriceResult | null> {
  const { data, error } = await fetchProductSnapshots([productId]);

  if (error || !data?.length) return null;
  const compatibleRows = product
    ? data.filter((row: any) => isSnapshotCompatibleWithProduct(row, product))
    : data;
  if (!compatibleRows.length) return null;
  return mergeSnapshotRows(compatibleRows);
}

async function saveProductPriceSnapshot(
  product: MarketProduct,
  price: ProductPriceResult
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('market_product_price_snapshots').insert({
    product_id: product.id,
    product_type: product.product_type,
    product_name: product.name,
    ebay_low: price.low,
    ebay_average: price.average,
    ebay_high: price.high,
    sold_count: price.count,
    query: price.query,
    source: price.soldDataSource,
    created_by: user.id,
  });

  if (error) console.log('Market product price snapshot save failed', error);
}

export async function fetchProductPrice(name: string, type: ProductLookupType): Promise<ProductPriceResult> {
  const product = await ensureMarketProduct(name, type);
  const price = await fetchLiveProductPrice(name, type);
  if (product) await saveProductPriceSnapshot(product, price);
  return price;
}

async function fetchLiveProductPrice(name: string, type: ProductLookupType): Promise<ProductPriceResult> {
  if (!PRICE_API_URL) throw new Error('Missing price API URL');

  const query = buildProductQuery(name, type);
  const params = new URLSearchParams({
    q: query,
    productType: type === 'accessories' ? 'accessory' : 'sealed',
    productSubtype: type,
  });

  const response = await fetch(`${PRICE_API_URL.replace(/\/$/, '')}/api/price/ebay?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to fetch product price: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    low: data.low ?? null,
    average: data.average ?? null,
    high: data.high ?? null,
    count: data.count ?? null,
    query: data.query ?? query,
    soldDataSource: data.soldDataSource ?? null,
  };
}

export async function refreshMarketProductPrice(product: MarketProduct): Promise<ProductPriceResult> {
  const price = await fetchLiveProductPrice(product.name, product.product_type);
  await saveProductPriceSnapshot(product, price);
  return price;
}

export async function getProductPriceWithFallback(
  name: string,
  type: ProductLookupType
): Promise<ProductPriceResult | null> {
  const matchingProducts = await searchMarketProducts(name, type, 1);
  const product = matchingProducts[0] ?? await ensureMarketProduct(name, type);
  const cached = product ? await getLatestProductPrice(product.id, product) : null;
  if (cached?.average != null) return cached;

  try {
    return product ? await refreshMarketProductPrice(product) : await fetchProductPrice(name, type);
  } catch (error) {
    console.log('Live product price fetch failed', error);
    return cached;
  }
}

export function productToInventorySnapshot(product: MarketProduct): InventoryCardSnapshot {
  return {
    id: product.id,
    name: product.name,
    number: null,
    set_id: null,
    set_name: product.set_name ?? productLookupLabel(product.product_type),
    rarity: null,
    image_small: product.image_url,
    image_large: product.image_large_url ?? product.image_url,
    tcg_price: product.latest_price?.tcgMarket ?? product.latest_price?.tcgMid ?? product.latest_price?.tcgLow ?? null,
    ebay_price: product.latest_price?.average ?? null,
    cardmarket_price: null,
    is_product: true,
    product_type: product.product_type,
    product_name: product.name,
    product_price_low: product.latest_price?.low ?? null,
    product_price_high: product.latest_price?.high ?? null,
    product_price_count: product.latest_price?.count ?? null,
    product_price_query: product.latest_price?.query ?? null,
    product_price_source: product.latest_price?.soldDataSource ?? null,
  };
}

export function toInventoryProductSnapshot(
  name: string,
  type: ProductLookupType,
  price?: ProductPriceResult | null
): InventoryCardSnapshot {
  return {
    id: productInventoryId(name, type),
    name: name.trim(),
    number: null,
    set_id: null,
    set_name: productLookupLabel(type),
    rarity: null,
    image_small: null,
    image_large: null,
    tcg_price: null,
    ebay_price: price?.average ?? null,
    cardmarket_price: null,
    is_product: true,
    product_type: type,
    product_name: name.trim(),
    product_price_low: price?.low ?? null,
    product_price_high: price?.high ?? null,
    product_price_count: price?.count ?? null,
    product_price_query: price?.query ?? null,
    product_price_source: price?.soldDataSource ?? null,
  };
}
