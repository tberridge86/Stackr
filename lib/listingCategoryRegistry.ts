import type { ImageSourcePropType } from 'react-native';
import type { ProductLookupType } from './productSearch';

export type ListingProductFamily =
  | 'raw_card'
  | 'graded_slab'
  | 'sealed_pack'
  | 'sealed_box'
  | 'sealed_bundle'
  | 'sealed_collection'
  | 'sealed_tin'
  | 'sealed_deck'
  | 'multi_item_lot'
  | 'other';

export type ListingCatalogueLookup =
  | 'card'
  | 'graded_card'
  | 'sealed_product'
  | 'manual';

export type ListingConditionSchema =
  | 'raw_card'
  | 'slab_case'
  | 'sealed_packaging'
  | 'lot_condition'
  | 'manual';

export type ListingFlowKey =
  | 'raw_card'
  | 'graded_slab'
  | 'booster_pack'
  | 'sleeved_booster_pack'
  | 'booster_bundle'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'collection_bundle'
  | 'collector_tin'
  | 'sealed_product'
  | 'accessories'
  | 'other';

export type ListingCategoryKey = ListingFlowKey;

export type ListingCategoryConfig = {
  key: ListingCategoryKey;
  title: string;
  description: string;
  asset: ImageSourcePropType;
  assetPath: string;
  family: ListingProductFamily;
  flowKey: ListingFlowKey;
  catalogueLookup: ListingCatalogueLookup;
  catalogueProductType?: ProductLookupType;
  conditionSchema: ListingConditionSchema;
  supported: boolean;
  todo?: string;
};

export const LISTING_CATEGORY_REGISTRY: Record<ListingCategoryKey, ListingCategoryConfig> = {
  raw_card: {
    key: 'raw_card',
    title: 'Raw Card',
    description: 'Ungraded single cards.',
    asset: require('../assets/rev2/04-listing-categories/clean/Raw Card.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Raw Card.png',
    family: 'raw_card',
    flowKey: 'raw_card',
    catalogueLookup: 'card',
    conditionSchema: 'raw_card',
    supported: true,
  },
  graded_slab: {
    key: 'graded_slab',
    title: 'Graded Slab',
    description: 'Professional graded cards.',
    asset: require('../assets/rev2/04-listing-categories/clean/Graded Slab.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Graded Slab.png',
    family: 'graded_slab',
    flowKey: 'graded_slab',
    catalogueLookup: 'graded_card',
    conditionSchema: 'slab_case',
    supported: true,
  },
  booster_pack: {
    key: 'booster_pack',
    title: 'Booster Pack',
    description: 'Loose unopened packs.',
    asset: require('../assets/rev2/04-listing-categories/clean/Booster Pack.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Booster Pack.png',
    family: 'sealed_pack',
    flowKey: 'booster_pack',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'booster_pack',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  sleeved_booster_pack: {
    key: 'sleeved_booster_pack',
    title: 'Blister Pack',
    description: 'Sleeved or blister sealed packs.',
    asset: require('../assets/rev2/04-listing-categories/clean/Blister Pack.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Blister Pack.png',
    family: 'sealed_pack',
    flowKey: 'sleeved_booster_pack',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'sleeved_booster_pack',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  booster_bundle: {
    key: 'booster_bundle',
    title: 'Booster Bundle',
    description: 'Official sealed bundles.',
    asset: require('../assets/rev2/04-listing-categories/clean/Booster Bundle.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Booster Bundle.png',
    family: 'sealed_bundle',
    flowKey: 'booster_bundle',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'booster_bundle',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  booster_box: {
    key: 'booster_box',
    title: 'Booster Box',
    description: 'Sealed display boxes.',
    asset: require('../assets/rev2/04-listing-categories/clean/Booster Box.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Booster Box.png',
    family: 'sealed_box',
    flowKey: 'booster_box',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'booster_box',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  elite_trainer_box: {
    key: 'elite_trainer_box',
    title: 'Elite Trainer Box',
    description: 'ETBs and special variants.',
    asset: require('../assets/rev2/04-listing-categories/clean/Elite Trainer Box.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Elite Trainer Box.png',
    family: 'sealed_box',
    flowKey: 'elite_trainer_box',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'elite_trainer_box',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  collection_bundle: {
    key: 'collection_bundle',
    title: 'Collection Box',
    description: 'Collection and premium boxes.',
    asset: require('../assets/rev2/04-listing-categories/clean/Collection Bundle.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Collection Bundle.png',
    family: 'sealed_collection',
    flowKey: 'collection_bundle',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'collection_bundle',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  collector_tin: {
    key: 'collector_tin',
    title: 'Collector Tin',
    description: 'Tins and mini tins.',
    asset: require('../assets/rev2/04-listing-categories/clean/Collector tins.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Collector tins.png',
    family: 'sealed_tin',
    flowKey: 'collector_tin',
    catalogueLookup: 'manual',
    conditionSchema: 'sealed_packaging',
    supported: true,
    todo: 'Add dedicated tin catalogue lookup when market_products supports collector_tin.',
  },
  sealed_product: {
    key: 'sealed_product',
    title: 'Sealed Product',
    description: 'Other sealed products.',
    asset: require('../assets/rev2/04-listing-categories/clean/Sealed Product.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Sealed Product.png',
    family: 'sealed_collection',
    flowKey: 'sealed_product',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'sealed_product',
    conditionSchema: 'sealed_packaging',
    supported: true,
  },
  accessories: {
    key: 'accessories',
    title: 'Accessories',
    description: 'Binders, sleeves and cases.',
    asset: require('../assets/rev2/04-listing-categories/clean/Accessories.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Accessories.png',
    family: 'other',
    flowKey: 'accessories',
    catalogueLookup: 'sealed_product',
    catalogueProductType: 'accessories',
    conditionSchema: 'manual',
    supported: true,
  },
  other: {
    key: 'other',
    title: 'Other',
    description: 'Manual review pathway.',
    asset: require('../assets/rev2/04-listing-categories/clean/Miscellaneous.png'),
    assetPath: './assets/rev2/04-listing-categories/clean/Miscellaneous.png',
    family: 'other',
    flowKey: 'other',
    catalogueLookup: 'manual',
    conditionSchema: 'manual',
    supported: true,
    todo: 'Use this for approved assets or products that cannot yet be mapped confidently.',
  },
};

export const LISTING_CATEGORY_ORDER: ListingCategoryKey[] = [
  'raw_card',
  'graded_slab',
  'booster_pack',
  'sleeved_booster_pack',
  'booster_bundle',
  'booster_box',
  'elite_trainer_box',
  'collection_bundle',
  'collector_tin',
  'sealed_product',
  'accessories',
  'other',
];

export function getListingCategories() {
  return LISTING_CATEGORY_ORDER
    .map((key) => LISTING_CATEGORY_REGISTRY[key])
    .filter((category) => category.supported);
}

export function getListingCategoryConfig(key: string | null | undefined) {
  return LISTING_CATEGORY_REGISTRY[(key as ListingCategoryKey) ?? 'raw_card'] ?? LISTING_CATEGORY_REGISTRY.raw_card;
}

export function isListingCategoryKey(value: unknown): value is ListingCategoryKey {
  return typeof value === 'string' && value in LISTING_CATEGORY_REGISTRY;
}

export function isCardCatalogueCategory(key: ListingCategoryKey) {
  const lookup = getListingCategoryConfig(key).catalogueLookup;
  return lookup === 'card' || lookup === 'graded_card';
}

export function isSealedLikeCategory(key: ListingCategoryKey) {
  const family = getListingCategoryConfig(key).family;
  return family.startsWith('sealed_');
}
