/**
 * Local visual-QA data only. These entries must never be submitted to Supabase
 * or displayed as live marketplace activity.
 */

export const TRADE_SERVICE_PREVIEW_FIXTURE_NOTICE = 'Preview data — not a real trade or delivery service.';

export type TradeServicePreviewFixture = {
  id: string;
  label: string;
  serviceLevel: 'direct' | 'tracked';
  status: 'pending' | 'accepted' | 'declined' | 'revised';
  senderCards: number;
  receiverCards: number;
  cashAmount: number | null;
  tracking: {
    party: 'sender' | 'receiver';
    carrier: string | null;
    reference: string | null;
  }[];
  expectedNotice: string;
};

export const TRADE_SERVICE_PREVIEW_FIXTURES: TradeServicePreviewFixture[] = [
  {
    id: 'fixture-trade-service-direct-swap',
    label: 'Direct card swap',
    serviceLevel: 'direct',
    status: 'pending',
    senderCards: 1,
    receiverCards: 1,
    cashAmount: null,
    tracking: [],
    expectedNotice: 'Direct trade · no tracking requirement.',
  },
  {
    id: 'fixture-trade-service-direct-demo-cash',
    label: 'Direct card and demo cash',
    serviceLevel: 'direct',
    status: 'pending',
    senderCards: 0,
    receiverCards: 1,
    cashAmount: 12.5,
    tracking: [],
    expectedNotice: 'Preview cash term · no live payment is taken or held by Stackr.',
  },
  {
    id: 'fixture-trade-service-tracked-requested',
    label: 'Tracked trade requested',
    serviceLevel: 'tracked',
    status: 'pending',
    senderCards: 1,
    receiverCards: 1,
    cashAmount: null,
    tracking: [],
    expectedNotice: 'Tracked trade requested · the recipient must agree before acceptance.',
  },
  {
    id: 'fixture-trade-service-tracked-swap',
    label: 'Tracked card swap accepted',
    serviceLevel: 'tracked',
    status: 'accepted',
    senderCards: 1,
    receiverCards: 1,
    cashAmount: null,
    tracking: [
      { party: 'sender', carrier: 'Preview carrier', reference: 'PREVIEW-TRACK-001' },
      { party: 'receiver', carrier: 'Preview carrier', reference: 'PREVIEW-TRACK-002' },
    ],
    expectedNotice: 'Each party sending cards needs a carrier and tracking reference before marking sent.',
  },
  {
    id: 'fixture-trade-service-tracked-card-sale',
    label: 'Tracked card sale accepted',
    serviceLevel: 'tracked',
    status: 'accepted',
    senderCards: 0,
    receiverCards: 1,
    cashAmount: 18,
    tracking: [
      { party: 'receiver', carrier: 'Preview carrier', reference: 'PREVIEW-TRACK-003' },
    ],
    expectedNotice: 'Only the participant sending physical cards needs tracking.',
  },
  {
    id: 'fixture-trade-service-tracked-declined',
    label: 'Tracked request declined',
    serviceLevel: 'tracked',
    status: 'declined',
    senderCards: 1,
    receiverCards: 1,
    cashAmount: null,
    tracking: [],
    expectedNotice: 'The sender can make a new offer with Direct trade.',
  },
  {
    id: 'fixture-trade-service-counter-reselect',
    label: 'Changed counter requires a new offer',
    serviceLevel: 'tracked',
    status: 'revised',
    senderCards: 2,
    receiverCards: 1,
    cashAmount: 5,
    tracking: [],
    expectedNotice: 'Cards or cash changed · create a new offer and select the delivery service again.',
  },
  {
    id: 'fixture-trade-service-one-sided-warning',
    label: 'One-sided offer warning',
    serviceLevel: 'direct',
    status: 'pending',
    senderCards: 1,
    receiverCards: 0,
    cashAmount: null,
    tracking: [],
    expectedNotice: 'You will receive no cards or cash. Review before accepting.',
  },
];
