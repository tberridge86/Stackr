import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeGate0CommerceCopy } from './gate0CommerceCopy';
import { supabase } from './supabase';

const LEGACY_CREATE_LISTING_DRAFT_KEY = 'stackr:create-listing-draft:v2';
const CREATE_LISTING_DRAFT_KEY_PREFIX = 'stackr:create-listing-draft:v3';

export function getCreateListingDraftKey(userId: string) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) throw new Error('A verified user is required for listing drafts.');
  return `${CREATE_LISTING_DRAFT_KEY_PREFIX}:${encodeURIComponent(normalizedUserId)}`;
}

export async function clearLegacyCreateListingDraft() {
  await AsyncStorage.removeItem(LEGACY_CREATE_LISTING_DRAFT_KEY);
}

export type CreateListingDraftSummary = {
  title: string;
  subtitle: string;
  stepLabel: string;
  valueLabel: string | null;
  updatedAt: string | null;
};

const STEP_LABELS: Record<string, string> = {
  category: 'Choose product type',
  entry: 'Identify item',
  identify: 'Choose exact item',
  confirm: 'Confirm item',
  manual: 'Manual details',
  condition: 'Condition',
  value: 'Value',
  protection: 'Protection',
  evidence: 'Photos',
  ai: 'AI condition check',
  gold: 'Verification',
  details: 'Listing terms',
  review: 'Review',
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  raw_card: 'Raw Card',
  graded_slab: 'Graded Slab',
  booster_pack: 'Booster Pack',
  sleeved_booster_pack: 'Blister Pack',
  booster_bundle: 'Booster Bundle',
  booster_box: 'Booster Box',
  elite_trainer_box: 'Elite Trainer Box',
  collection_bundle: 'Collection Box',
  collector_tin: 'Collector Tin',
  sealed_product: 'Sealed Product',
  accessories: 'Accessories',
  other: 'Other',
};

function formatCurrencyDraft(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: parsed >= 100 ? 0 : 2,
  }).format(parsed);
}

export function summariseCreateListingDraft(draft: any): CreateListingDraftSummary | null {
  if (!draft || typeof draft !== 'object') return null;

  const rawTitle =
    draft.selectedCard?.name
    ?? draft.selectedProduct?.name
    ?? draft.manualIdentity?.cardName
    ?? 'Untitled listing';
  const title = sanitizeGate0CommerceCopy(
    rawTitle,
    'Untitled listing',
  ) ?? 'Untitled listing';

  const productType =
    draft.listingSubjectType
    ?? draft.selectedProduct?.product_type
    ?? draft.manualIdentity?.state
    ?? 'raw_card';

  const rawSetName =
    draft.selectedCard?.set_name
    ?? draft.selectedProduct?.set_name
    ?? draft.manualIdentity?.setName;
  const subtitleParts = [
    PRODUCT_TYPE_LABELS[productType] ?? 'Other',
    sanitizeGate0CommerceCopy(rawSetName, null),
  ].filter((value): value is string => Boolean(value));

  const valueLabel =
    draft.listingMode === 'trade'
      ? formatCurrencyDraft(draft.tradeValue)
      : formatCurrencyDraft(draft.askingPrice) ?? formatCurrencyDraft(draft.tradeValue);

  return {
    title,
    subtitle: subtitleParts.join(' - '),
    stepLabel: STEP_LABELS[draft.step] ?? 'Draft',
    valueLabel,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : null,
  };
}

export async function readCreateListingDraftSummary(userId: string) {
  await clearLegacyCreateListingDraft();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (user?.id !== userId) throw new Error('Listing draft account mismatch.');
  const raw = await AsyncStorage.getItem(getCreateListingDraftKey(userId));
  if (!raw) return null;

  try {
    return summariseCreateListingDraft(JSON.parse(raw));
  } catch (error) {
    console.log('Create Listing draft summary failed:', error);
    return null;
  }
}

export async function clearCreateListingDraft(userId: string) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (user?.id !== userId) throw new Error('Listing draft account mismatch.');
  await Promise.all([
    clearLegacyCreateListingDraft(),
    AsyncStorage.removeItem(getCreateListingDraftKey(userId)),
  ]);
}
