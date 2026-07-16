import type { ImageSourcePropType } from 'react-native';
import type { ProductLookupType } from './productSearch';
import { LISTING_CATEGORY_REGISTRY, type ListingCategoryKey } from './listingCategoryRegistry';

export type ListingCategoryType = 'raw_card' | 'graded_slab' | ProductLookupType | 'accessories' | 'collector_tin' | 'other';

export const listingCategoryIcons: Partial<Record<ListingCategoryType, ImageSourcePropType>> = {
  raw_card: LISTING_CATEGORY_REGISTRY.raw_card.asset,
  graded_slab: LISTING_CATEGORY_REGISTRY.graded_slab.asset,
  sealed_product: LISTING_CATEGORY_REGISTRY.sealed_product.asset,
  booster_pack: LISTING_CATEGORY_REGISTRY.booster_pack.asset,
  sleeved_booster_pack: LISTING_CATEGORY_REGISTRY.sleeved_booster_pack.asset,
  booster_bundle: LISTING_CATEGORY_REGISTRY.booster_bundle.asset,
  booster_box: LISTING_CATEGORY_REGISTRY.booster_box.asset,
  elite_trainer_box: LISTING_CATEGORY_REGISTRY.elite_trainer_box.asset,
  collection_bundle: LISTING_CATEGORY_REGISTRY.collection_bundle.asset,
  accessories: LISTING_CATEGORY_REGISTRY.accessories.asset,
  collector_tin: LISTING_CATEGORY_REGISTRY.collector_tin.asset,
  other: LISTING_CATEGORY_REGISTRY.other.asset,
};

export const listingCategoryAssetPaths: Record<ListingCategoryKey, string> = Object.fromEntries(
  Object.entries(LISTING_CATEGORY_REGISTRY).map(([key, config]) => [key, config.assetPath])
) as Record<ListingCategoryKey, string>;
