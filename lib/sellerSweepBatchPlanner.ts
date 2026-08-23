export const SELLER_SWEEP_MAX_DISTINCT_CARDS = 250;
export const SELLER_SWEEP_MAX_REVIEWED_LINES = 500;
export const SELLER_SWEEP_MAX_COPIES_PER_LINE = 999;
export const SELLER_SWEEP_MAX_TOTAL_COPIES = 5_000;
export const SELLER_SWEEP_MAX_INVENTORY_ITEMS = 5_000;
export const SELLER_SWEEP_MAX_INVENTORY_QUANTITY = 1_000_000;

export const SELLER_SWEEP_INVENTORY_CONDITIONS = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
  'Sealed',
] as const;

export type SellerSweepInventoryCondition =
  (typeof SELLER_SWEEP_INVENTORY_CONDITIONS)[number];

export type SellerSweepCardSnapshot = {
  id: string;
  name: string;
  number: string | null;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  tcg_price: number | null;
  ebay_price: number | null;
  cardmarket_price: number | null;
  language?: string | null;
  variant_code?: string | null;
  is_product?: boolean;
  product_type?: string | null;
  product_name?: string | null;
  product_price_low?: number | null;
  product_price_high?: number | null;
  product_price_count?: number | null;
  product_price_query?: string | null;
  product_price_source?: string | null;
  inventory_binder_id?: string | null;
  inventory_binder_name?: string | null;
};

export type SellerSweepInventoryItem = {
  id: string;
  card_id: string;
  set_id: string | null;
  condition: SellerSweepInventoryCondition;
  quantity: number;
  asking_price: number | null;
  buy_price: number | null;
  notes: string | null;
  card: SellerSweepCardSnapshot;
  persisted_card_snapshot?: SellerSweepCardSnapshot;
  created_at: string;
  updated_at: string;
};

export type SellerSweepReviewedLine = {
  scanItemId: string;
  status: 'confirmed' | 'review' | 'unresolved';
  identityResolution: 'exact' | 'ambiguous';
  card: SellerSweepCardSnapshot & {
    set_id: string;
    language: string;
    variant_code: string;
  };
  condition: SellerSweepInventoryCondition | null;
  quantity: number;
  movementId: string;
  binder?: {
    id: string;
    name: string;
  } | null;
  valueAtTime?: number | null;
};

export type SellerSweepMovementDraft = {
  id: string;
  inventory_item_id: string;
  action_type: 'scan_in';
  card_id: string;
  set_id: string;
  card_name: string;
  quantity: number;
  reason: 'Added to Binder' | 'Added to Sell/Trade';
  binder_id: string | null;
  binder_name: string | null;
  collection_id: null;
  value_at_time: number | null;
  image_small: string | null;
  created_at: string;
};

export type SellerSweepBinderDelta = {
  binder_id: string;
  card_id: string;
  set_id: string;
  quantity_delta: number;
  card_name: string;
  card_number: string | null;
  image_url: string | null;
  set_name: string | null;
};

export type SellerSweepInventoryBatchProposal = {
  requestId: string;
  expectedItems: SellerSweepInventoryItem[];
  items: SellerSweepInventoryItem[];
  movements: SellerSweepMovementDraft[];
  sale: null;
  binderDeltas: SellerSweepBinderDelta[];
};

export type SellerSweepBatchPlanningErrorCode =
  | 'invalid_request_id'
  | 'invalid_timestamp'
  | 'invalid_expected_inventory'
  | 'duplicate_expected_inventory_id'
  | 'duplicate_expected_inventory_identity'
  | 'inventory_item_limit_exceeded'
  | 'duplicate_scan_item_id'
  | 'invalid_movement_id'
  | 'duplicate_movement_id'
  | 'scan_not_confirmed'
  | 'ambiguous_identity'
  | 'invalid_card_identity'
  | 'invalid_condition'
  | 'invalid_quantity'
  | 'invalid_binder'
  | 'binder_identity_not_representable'
  | 'invalid_value_at_time'
  | 'reviewed_line_limit_exceeded'
  | 'distinct_card_limit_exceeded'
  | 'copy_limit_exceeded'
  | 'ambiguous_existing_inventory';

export class SellerSweepBatchPlanningError extends Error {
  constructor(
    public readonly code: SellerSweepBatchPlanningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SellerSweepBatchPlanningError';
  }
}
type ValidatedLine = Omit<SellerSweepReviewedLine, 'binder' | 'condition'> & {
  condition: SellerSweepInventoryCondition;
  binder: NonNullable<SellerSweepReviewedLine['binder']> | null;
  inventoryIdentityKey: string;
  baseInventoryIdentityKey: string;
};

type IncomingGroup = {
  identityKey: string;
  baseIdentityKey: string;
  lines: ValidatedLine[];
  quantity: number;
  targetInventoryItemId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;
const INVENTORY_CONDITION_SET = new Set<string>(SELLER_SWEEP_INVENTORY_CONDITIONS);

function planningError(code: SellerSweepBatchPlanningErrorCode, message: string): never {
  throw new SellerSweepBatchPlanningError(code, message);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, deepClone(entry)]),
    ) as T;
  }
  return value;
}

function requiredText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeIdentifier(value: unknown, maximumLength: number) {
  return requiredText(value)
    && String(value).trim() === value
    && String(value).length <= maximumLength
    && !/[\u0000-\u001f\u007f]/.test(String(value));
}

function identityPart(value: string | null | undefined) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US');
}

function binderIdFromCard(card: SellerSweepCardSnapshot) {
  return requiredText(card.inventory_binder_id) ? String(card.inventory_binder_id) : null;
}

function inventoryIdentityKey(input: {
  cardId: string;
  setId: string;
  variantCode: string;
  language: string;
  condition: SellerSweepInventoryCondition;
  binderId: string | null;
}) {
  return JSON.stringify([
    identityPart(input.cardId),
    identityPart(input.setId),
    identityPart(input.variantCode),
    identityPart(input.language),
    input.condition,
    identityPart(input.binderId),
  ]);
}

function baseInventoryIdentityKey(input: {
  cardId: string;
  setId: string | null;
  condition: SellerSweepInventoryCondition;
  binderId: string | null;
}) {
  return JSON.stringify([
    identityPart(input.cardId),
    identityPart(input.setId),
    input.condition,
    identityPart(input.binderId),
  ]);
}

function validateExpectedInventory(expectedItems: SellerSweepInventoryItem[]) {
  if (!Array.isArray(expectedItems)) {
    planningError('invalid_expected_inventory', 'Expected inventory must be an array.');
  }
  if (expectedItems.length > SELLER_SWEEP_MAX_INVENTORY_ITEMS) {
    planningError(
      'inventory_item_limit_exceeded',
      `Expected inventory exceeds ${SELLER_SWEEP_MAX_INVENTORY_ITEMS} items.`,
    );
  }

  const itemIds = new Set<string>();
  const exactIdentities = new Set<string>();
  for (const item of expectedItems) {
    if (!safeIdentifier(item?.id, 512)
      || !safeIdentifier(item?.card_id, 512)
      || !item.card
      || typeof item.card !== 'object'
      || !Number.isSafeInteger(item.quantity)
      || item.quantity < 1
      || item.quantity > SELLER_SWEEP_MAX_INVENTORY_QUANTITY
      || !INVENTORY_CONDITION_SET.has(item.condition)
      || !Number.isFinite(Date.parse(item.created_at))
      || !Number.isFinite(Date.parse(item.updated_at))) {
      planningError('invalid_expected_inventory', 'Expected inventory contains an invalid item.');
    }
    if (itemIds.has(item.id)) {
      planningError(
        'duplicate_expected_inventory_id',
        `Expected inventory item ID ${item.id} appears more than once.`,
      );
    }
    itemIds.add(item.id);

    const variantCode = identityPart(item.card.variant_code);
    const language = identityPart(item.card.language);
    if (!variantCode || !language || !requiredText(item.set_id)) continue;
    const key = inventoryIdentityKey({
      cardId: item.card_id,
      setId: String(item.set_id),
      variantCode,
      language,
      condition: item.condition,
      binderId: binderIdFromCard(item.card),
    });
    if (exactIdentities.has(key)) {
      planningError(
        'duplicate_expected_inventory_identity',
        'Expected inventory contains more than one row for the same exact identity.',
      );
    }
    exactIdentities.add(key);
  }
}

function validateLine(
  line: SellerSweepReviewedLine,
  seenScanItemIds: Set<string>,
  seenMovementIds: Set<string>,
): ValidatedLine {
  if (!safeIdentifier(line?.scanItemId, 512)) {
    planningError('invalid_card_identity', 'Every sweep line requires a stable scan item ID.');
  }
  if (seenScanItemIds.has(line.scanItemId)) {
    planningError('duplicate_scan_item_id', `Sweep item ${line.scanItemId} appears more than once.`);
  }
  seenScanItemIds.add(line.scanItemId);

  if (line.status !== 'confirmed') {
    planningError('scan_not_confirmed', `Sweep item ${line.scanItemId} is not confirmed.`);
  }
  if (line.identityResolution !== 'exact') {
    planningError('ambiguous_identity', `Sweep item ${line.scanItemId} has an ambiguous identity.`);
  }
  if (!line.card
    || !safeIdentifier(line.card.id, 512)
    || !safeIdentifier(line.card.set_id, 512)
    || !requiredText(line.card.name)
    || !requiredText(line.card.language)
    || !requiredText(line.card.variant_code)) {
    planningError(
      'invalid_card_identity',
      `Sweep item ${line.scanItemId} is missing an exact card, set, language, or variant identity.`,
    );
  }
  if (!line.condition || !INVENTORY_CONDITION_SET.has(line.condition)) {
    planningError('invalid_condition', `Sweep item ${line.scanItemId} requires a valid condition.`);
  }
  if (!Number.isSafeInteger(line.quantity)
    || line.quantity < 1
    || line.quantity > SELLER_SWEEP_MAX_COPIES_PER_LINE) {
    planningError(
      'invalid_quantity',
      `Sweep item ${line.scanItemId} quantity must be an integer from 1 to ${SELLER_SWEEP_MAX_COPIES_PER_LINE}.`,
    );
  }
  if (!safeIdentifier(line.movementId, 512)) {
    planningError('invalid_movement_id', `Sweep item ${line.scanItemId} requires a movement ID.`);
  }
  if (seenMovementIds.has(line.movementId)) {
    planningError('duplicate_movement_id', `Movement ID ${line.movementId} appears more than once.`);
  }
  seenMovementIds.add(line.movementId);

  const binder = line.binder ?? null;
  if (binder && (!UUID_PATTERN.test(binder.id) || !requiredText(binder.name))) {
    planningError(
      'invalid_binder',
      `Sweep item ${line.scanItemId} has invalid binder metadata.`,
    );
  }
  if (line.valueAtTime != null
    && (!Number.isFinite(line.valueAtTime)
      || line.valueAtTime < 0
      || line.valueAtTime > 100_000_000)) {
    planningError(
      'invalid_value_at_time',
      `Sweep item ${line.scanItemId} has an invalid value-at-time.`,
    );
  }

  const condition = line.condition as SellerSweepInventoryCondition;
  const exactKey = inventoryIdentityKey({
    cardId: line.card.id,
    setId: line.card.set_id,
    variantCode: line.card.variant_code,
    language: line.card.language,
    condition,
    binderId: binder?.id ?? null,
  });
  return {
    ...deepClone(line),
    binder,
    condition,
    inventoryIdentityKey: exactKey,
    baseInventoryIdentityKey: baseInventoryIdentityKey({
      cardId: line.card.id,
      setId: line.card.set_id,
      condition,
      binderId: binder?.id ?? null,
    }),
  };
}

function compareLines(left: ValidatedLine, right: ValidatedLine) {
  return left.inventoryIdentityKey.localeCompare(right.inventoryIdentityKey)
    || left.scanItemId.localeCompare(right.scanItemId)
    || left.movementId.localeCompare(right.movementId);
}

function cardForInventory(line: ValidatedLine) {
  return {
    ...deepClone(line.card),
    inventory_binder_id: line.binder?.id ?? null,
    inventory_binder_name: line.binder?.name ?? 'Sell/Trade inventory',
  };
}

function exactExpectedIdentity(item: SellerSweepInventoryItem) {
  if (!requiredText(item.set_id)
    || !requiredText(item.card.variant_code)
    || !requiredText(item.card.language)) {
    return null;
  }
  return inventoryIdentityKey({
    cardId: item.card_id,
    setId: String(item.set_id),
    variantCode: String(item.card.variant_code),
    language: String(item.card.language),
    condition: item.condition,
    binderId: binderIdFromCard(item.card),
  });
}

function expectedBaseIdentity(item: SellerSweepInventoryItem) {
  return baseInventoryIdentityKey({
    cardId: item.card_id,
    setId: item.set_id,
    condition: item.condition,
    binderId: binderIdFromCard(item.card),
  });
}

function buildBinderDeltas(lines: ValidatedLine[]) {
  const groups = new Map<string, SellerSweepBinderDelta>();
  const representedIdentity = new Map<string, string>();
  for (const line of lines) {
    if (!line.binder) continue;
    const key = JSON.stringify([identityPart(line.binder.id), identityPart(line.card.id)]);
    const exactIdentity = JSON.stringify([
      identityPart(line.card.set_id),
      identityPart(line.card.language),
      identityPart(line.card.variant_code),
      line.condition,
    ]);
    if (identityPart(line.card.variant_code) !== 'normal' || line.condition !== 'Near Mint') {
      planningError(
        'binder_identity_not_representable',
        'The current binder batch contract cannot preserve a non-normal variant or non-Near-Mint condition.',
      );
    }
    const priorIdentity = representedIdentity.get(key);
    if (priorIdentity && priorIdentity !== exactIdentity) {
      planningError(
        'binder_identity_not_representable',
        'The current binder batch contract would merge distinct set, language, variant, or condition identities.',
      );
    }
    representedIdentity.set(key, exactIdentity);
    const current = groups.get(key);
    if (current) {
      current.quantity_delta += line.quantity;
      continue;
    }
    groups.set(key, {
      binder_id: line.binder.id,
      card_id: line.card.id,
      set_id: line.card.set_id,
      quantity_delta: line.quantity,
      card_name: line.card.name,
      card_number: line.card.number,
      image_url: line.card.image_small,
      set_name: line.card.set_name,
    });
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, delta]) => delta);
}

/**
 * Builds the exact input expected by commitSellerInventoryBatch without touching
 * authentication, caches, clocks, storage, or a remote database.
 */
export function planSellerSweepInventoryBatch(input: {
  requestId: string;
  timestamp: string;
  expectedItems: SellerSweepInventoryItem[];
  lines: SellerSweepReviewedLine[];
}): SellerSweepInventoryBatchProposal {
  if (!REQUEST_TOKEN_PATTERN.test(input?.requestId ?? '')) {
    planningError(
      'invalid_request_id',
      'Request ID must be a 1-64 character seller batch token using letters, numbers, colons, underscores, or dashes.',
    );
  }
  if (!requiredText(input?.timestamp) || !Number.isFinite(Date.parse(input.timestamp))) {
    planningError('invalid_timestamp', 'A valid caller-supplied timestamp is required.');
  }
  validateExpectedInventory(input.expectedItems);
  if (!Array.isArray(input.lines)) {
    planningError('invalid_card_identity', 'Sweep lines must be an array.');
  }
  if (input.lines.length > SELLER_SWEEP_MAX_REVIEWED_LINES) {
    planningError(
      'reviewed_line_limit_exceeded',
      `A Seller Sweep batch cannot exceed ${SELLER_SWEEP_MAX_REVIEWED_LINES} reviewed lines.`,
    );
  }

  const seenScanItemIds = new Set<string>();
  const seenMovementIds = new Set<string>();
  const lines = input.lines
    .map((line) => validateLine(line, seenScanItemIds, seenMovementIds))
    .sort(compareLines);

  const groupsByIdentity = new Map<string, IncomingGroup>();
  let totalCopies = 0;
  for (const line of lines) {
    totalCopies += line.quantity;
    if (totalCopies > SELLER_SWEEP_MAX_TOTAL_COPIES) {
      planningError(
        'copy_limit_exceeded',
        `A Seller Sweep batch cannot exceed ${SELLER_SWEEP_MAX_TOTAL_COPIES} copies.`,
      );
    }
    const current = groupsByIdentity.get(line.inventoryIdentityKey);
    if (current) {
      current.lines.push(line);
      current.quantity += line.quantity;
    } else {
      groupsByIdentity.set(line.inventoryIdentityKey, {
        identityKey: line.inventoryIdentityKey,
        baseIdentityKey: line.baseInventoryIdentityKey,
        lines: [line],
        quantity: line.quantity,
        targetInventoryItemId: '',
      });
    }
  }

  const groups = [...groupsByIdentity.values()]
    .sort((left, right) => left.identityKey.localeCompare(right.identityKey));
  if (groups.length > SELLER_SWEEP_MAX_DISTINCT_CARDS) {
    planningError(
      'distinct_card_limit_exceeded',
      `A Seller Sweep batch cannot exceed ${SELLER_SWEEP_MAX_DISTINCT_CARDS} exact inventory identities.`,
    );
  }

  const expectedItems = deepClone(input.expectedItems);
  const items = deepClone(input.expectedItems);
  const exactExpectedIndexes = new Map<string, number>();
  const incompleteExpectedBaseKeys = new Set<string>();
  items.forEach((item, index) => {
    const exactKey = exactExpectedIdentity(item);
    if (exactKey) exactExpectedIndexes.set(exactKey, index);
    else incompleteExpectedBaseKeys.add(expectedBaseIdentity(item));
  });

  const newItems: SellerSweepInventoryItem[] = [];
  groups.forEach((group, index) => {
    if (incompleteExpectedBaseKeys.has(group.baseIdentityKey)) {
      planningError(
        'ambiguous_existing_inventory',
        'Existing inventory is missing language or variant metadata for an incoming exact identity.',
      );
    }
    const representative = group.lines[0];
    const existingIndex = exactExpectedIndexes.get(group.identityKey);
    if (existingIndex != null) {
      const existing = items[existingIndex];
      if (existing.quantity + group.quantity > SELLER_SWEEP_MAX_INVENTORY_QUANTITY) {
        planningError(
          'copy_limit_exceeded',
          `Inventory item ${existing.id} would exceed the supported quantity.`,
        );
      }
      existing.quantity += group.quantity;
      existing.updated_at = input.timestamp;
      existing.card = cardForInventory(representative);
      group.targetInventoryItemId = existing.id;
      return;
    }

    const newItemId = `sweep:${input.requestId}:item:${String(index + 1).padStart(3, '0')}`;
    group.targetInventoryItemId = newItemId;
    newItems.push({
      id: newItemId,
      card_id: representative.card.id,
      set_id: representative.card.set_id,
      condition: representative.condition,
      quantity: group.quantity,
      asking_price: null,
      buy_price: null,
      notes: null,
      card: cardForInventory(representative),
      created_at: input.timestamp,
      updated_at: input.timestamp,
    });
  });

  if (items.length + newItems.length > SELLER_SWEEP_MAX_INVENTORY_ITEMS) {
    planningError(
      'inventory_item_limit_exceeded',
      `The proposed inventory exceeds ${SELLER_SWEEP_MAX_INVENTORY_ITEMS} items.`,
    );
  }

  const targetIds = new Map(groups.map((group) => [group.identityKey, group.targetInventoryItemId]));
  const movements = lines.map((line): SellerSweepMovementDraft => ({
    id: line.movementId,
    inventory_item_id: String(targetIds.get(line.inventoryIdentityKey)),
    action_type: 'scan_in',
    card_id: line.card.id,
    set_id: line.card.set_id,
    card_name: line.card.name,
    quantity: line.quantity,
    reason: line.binder ? 'Added to Binder' : 'Added to Sell/Trade',
    binder_id: line.binder?.id ?? null,
    binder_name: line.binder?.name ?? null,
    collection_id: null,
    value_at_time: line.valueAtTime ?? null,
    image_small: line.card.image_small,
    created_at: input.timestamp,
  }));

  return {
    requestId: input.requestId,
    expectedItems,
    items: [...items, ...newItems],
    movements,
    sale: null,
    binderDeltas: buildBinderDeltas(lines),
  };
}
