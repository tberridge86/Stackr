import { PRICE_API_URL } from './config';

export type ShippoAddress = {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state?: string;
  zip?: string;
  postcode?: string;
  postalCode?: string;
  country: string;
  phone?: string;
  email?: string;
};

export type ShippoParcel = {
  length?: string | number;
  width?: string | number;
  height?: string | number;
  distanceUnit?: 'in' | 'cm' | string;
  distance_unit?: 'in' | 'cm' | string;
  weight?: string | number;
  massUnit?: 'lb' | 'oz' | 'g' | 'kg' | string;
  mass_unit?: 'lb' | 'oz' | 'g' | 'kg' | string;
};

export type StackrShippoRate = {
  id: string | null;
  provider: string | null;
  service: string | null;
  serviceToken: string | null;
  amount: number | null;
  currency: string | null;
  estimatedDays: number | null;
  durationTerms: string | null;
  trackable: boolean | null;
  attributes: string[];
  raw?: unknown;
};

export type StackrShippoRatesResponse = {
  shipmentId: string | null;
  status: string | null;
  testMode: boolean;
  rates: StackrShippoRate[];
  raw?: unknown;
};

export type StackrShippoLabelResponse = {
  id: string | null;
  status: string | null;
  labelUrl: string | null;
  commercialInvoiceUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  eta: string | null;
  messages: unknown[];
  testMode: boolean;
  raw?: unknown;
};

export type StackrShippoStatus = {
  configured: boolean;
  mode: 'test' | 'live_or_custom' | 'missing';
  labelPurchasesEnabled: boolean;
};

function assertPriceApiUrl() {
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');
  return PRICE_API_URL.replace(/\/$/, '');
}

async function fetchShippoJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${assertPriceApiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.detail?.message ?? json?.detail ?? json?.error ?? `Shippo API failed: ${response.status}`);
  }
  return json as T;
}

export async function fetchShippoStatus(): Promise<StackrShippoStatus> {
  return fetchShippoJson<StackrShippoStatus>('/api/shippo/status');
}

export async function fetchShippoRates(input: {
  addressFrom: ShippoAddress;
  addressTo: ShippoAddress;
  parcel?: ShippoParcel;
  metadata?: string;
  extra?: Record<string, unknown>;
}): Promise<StackrShippoRatesResponse> {
  return fetchShippoJson<StackrShippoRatesResponse>('/api/shippo/rates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createShippoLabel(input: {
  rateId: string;
  labelFileType?: 'PDF' | 'PDF_4x6' | 'PNG' | 'PNG_2.3x7.5' | 'ZPLII' | string;
  metadata?: string;
}): Promise<StackrShippoLabelResponse> {
  return fetchShippoJson<StackrShippoLabelResponse>('/api/shippo/labels', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchShippoTracking(carrier: string, trackingNumber: string): Promise<unknown> {
  const json = await fetchShippoJson<{ tracking: unknown }>(
    `/api/shippo/track/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`
  );
  return json.tracking;
}
