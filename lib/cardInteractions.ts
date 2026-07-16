export type CardInteractionMode =
  | 'browse'
  | 'collection-edit'
  | 'selection'
  | 'marketplace'
  | 'seller-inventory';

export type CardInteractionRule = {
  mode: CardInteractionMode;
  tapBehaviour: string;
  primaryActionRequired: boolean;
  allowsOwnershipMutation: boolean;
  requiresVisibleModeIndicator: boolean;
  longPressOnlyAllowed: false;
};

export const CARD_INTERACTION_RULES: Record<CardInteractionMode, CardInteractionRule> = {
  browse: {
    mode: 'browse',
    tapBehaviour: 'Open quick view or details. Never mutate ownership from an unlabelled tap.',
    primaryActionRequired: true,
    allowsOwnershipMutation: false,
    requiresVisibleModeIndicator: false,
    longPressOnlyAllowed: false,
  },
  'collection-edit': {
    mode: 'collection-edit',
    tapBehaviour: 'Toggle or adjust ownership only while an explicit edit state is visible.',
    primaryActionRequired: false,
    allowsOwnershipMutation: true,
    requiresVisibleModeIndicator: true,
    longPressOnlyAllowed: false,
  },
  selection: {
    mode: 'selection',
    tapBehaviour: 'Select or deselect for a bulk action, listing, trade, offer or binder move.',
    primaryActionRequired: true,
    allowsOwnershipMutation: false,
    requiresVisibleModeIndicator: true,
    longPressOnlyAllowed: false,
  },
  marketplace: {
    mode: 'marketplace',
    tapBehaviour: 'Open listing details. Buy, offer and save controls must be explicit.',
    primaryActionRequired: true,
    allowsOwnershipMutation: false,
    requiresVisibleModeIndicator: false,
    longPressOnlyAllowed: false,
  },
  'seller-inventory': {
    mode: 'seller-inventory',
    tapBehaviour: 'Open stock actions or select inventory according to the active Stock In or Stock Out mode.',
    primaryActionRequired: true,
    allowsOwnershipMutation: true,
    requiresVisibleModeIndicator: true,
    longPressOnlyAllowed: false,
  },
};

export function getCardInteractionRule(mode: CardInteractionMode) {
  return CARD_INTERACTION_RULES[mode];
}

export function getCardInteractionAccessibilityLabel(mode: CardInteractionMode, cardName: string) {
  const rule = getCardInteractionRule(mode);
  return `${cardName}. ${rule.tapBehaviour}`;
}
