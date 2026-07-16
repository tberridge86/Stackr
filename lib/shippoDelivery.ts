export type ShippoDeliveryMethod = {
  id: string;
  carrier: string;
  service: string;
  displayName: string;
  eta: string;
  priceGbp: number;
  tracked: boolean;
  recommended?: boolean;
  shippoCarrierAccount?: string;
  shippoServiceLevel?: string;
  source: 'shippo_preview' | 'manual';
  protectionHint: string;
};

export const SHIPPO_DELIVERY_METHODS: ShippoDeliveryMethod[] = [
  {
    id: 'royal-mail-tracked-48',
    carrier: 'Royal Mail',
    service: 'Tracked 48',
    displayName: 'Royal Mail Tracked 48',
    eta: '2 working days',
    priceGbp: 3.49,
    tracked: true,
    recommended: true,
    shippoCarrierAccount: 'royal_mail',
    shippoServiceLevel: 'tracked_48',
    source: 'shippo_preview',
    protectionHint: 'Tracked delivery suited to most card listings.',
  },
  {
    id: 'royal-mail-tracked-24',
    carrier: 'Royal Mail',
    service: 'Tracked 24',
    displayName: 'Royal Mail Tracked 24',
    eta: '1 working day',
    priceGbp: 4.49,
    tracked: true,
    shippoCarrierAccount: 'royal_mail',
    shippoServiceLevel: 'tracked_24',
    source: 'shippo_preview',
    protectionHint: 'Faster tracked delivery for higher-intent buyers.',
  },
  {
    id: 'evri-standard',
    carrier: 'Evri',
    service: 'Standard',
    displayName: 'Evri Standard',
    eta: '2-4 working days',
    priceGbp: 2.99,
    tracked: true,
    shippoCarrierAccount: 'evri',
    shippoServiceLevel: 'standard',
    source: 'shippo_preview',
    protectionHint: 'Tracked budget option for lower-value listings.',
  },
  {
    id: 'inpost-locker',
    carrier: 'InPost',
    service: 'Locker drop-off',
    displayName: 'InPost Locker',
    eta: '2-3 working days',
    priceGbp: 2.89,
    tracked: true,
    shippoCarrierAccount: 'inpost',
    shippoServiceLevel: 'locker',
    source: 'shippo_preview',
    protectionHint: 'Locker drop-off option where available.',
  },
  {
    id: 'dpd-next-day',
    carrier: 'DPD',
    service: 'Next Day',
    displayName: 'DPD Next Day',
    eta: 'Next working day',
    priceGbp: 6.99,
    tracked: true,
    shippoCarrierAccount: 'dpd_uk',
    shippoServiceLevel: 'next_day',
    source: 'shippo_preview',
    protectionHint: 'Premium tracked courier for higher-value cards.',
  },
  {
    id: 'local-handover',
    carrier: 'Local',
    service: 'Collector handover',
    displayName: 'Local handover',
    eta: 'Arranged with buyer',
    priceGbp: 0,
    tracked: false,
    source: 'manual',
    protectionHint: 'Manual arrangement. Not a Shippo label.',
  },
];

export function getShippoDeliveryMethod(methodId?: string | null) {
  return SHIPPO_DELIVERY_METHODS.find((method) => method.id === methodId)
    ?? SHIPPO_DELIVERY_METHODS[0];
}

export function getShippoDeliveryMethodByName(displayName?: string | null) {
  if (!displayName) return SHIPPO_DELIVERY_METHODS[0];
  return SHIPPO_DELIVERY_METHODS.find((method) => method.displayName === displayName)
    ?? SHIPPO_DELIVERY_METHODS[0];
}
