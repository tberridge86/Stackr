import { LIVE_COMMERCE_RELEASE_APPROVED } from './config';

export const GATE0_HIDDEN_MESSAGE_COPY = 'Message hidden during this beta.';
export const GATE0_HIDDEN_NOTIFICATION_TITLE = 'Stackr beta update';
export const GATE0_HIDDEN_NOTIFICATION_MESSAGE = 'Details hidden during this beta.';
export const GATE0_UNSAFE_USER_COPY_ERROR =
  'Keep beta messages to card-only negotiation. Payment and fulfilment details are disabled.';
export const GATE0_OFFER_FREE_TEXT_DISABLED_ERROR =
  'Free-form offer messages and notes are disabled during this beta.';

const INVISIBLE_COPY_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;
const COPY_SEPARATORS = /[._:/\\\-\u2010-\u2015]+/gu;
const CAMEL_CASE_BOUNDARY = /([\p{Ll}\d])(\p{Lu})/gu;
const SPACED_LETTER_SEQUENCE = /\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/gu;
const COMMERCE_CONFUSABLES: Record<string, string> = {
  '\u039F': 'O',
  '\u03BF': 'o',
  '\u0405': 'S',
  '\u0406': 'I',
  '\u0410': 'A',
  '\u0415': 'E',
  '\u041E': 'O',
  '\u0420': 'P',
  '\u0423': 'Y',
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043E': 'o',
  '\u0440': 'p',
  '\u0443': 'y',
  '\u0455': 's',
  '\u0456': 'i',
};
const OBFUSCATED_COMMERCE_TOKEN = /^(?:(?:payments?|payouts?|purchas(?:e|es|ed|ing)|checkouts?|shipments?|deliver(?:y|ies|ed|ing)|fulfil(?:l)?ments?)(?:link|request|ready|status|update)?|stripe|shippo(?:tracking)?|paypal|cashapp|applepay|googlepay|shippinglabel|postagelabel|orderready|buynow)$/iu;
const EXTERNAL_CURRENCY_TRANSFER = /\b(?:send|give|transfer|wire|owe|pay)\s+(?:(?:me|you|him|her|them)\s+)?(?:[£$€]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:gbp|usd|eur))\b|(?:[£$€]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:gbp|usd|eur))\s+(?:extra|on\s+top)\b/iu;
const FULFILMENT_ROUTE_COPY = /\b(?:send|sent|post|posts|posted|posting|mail|mails|mailed|mailing|receive|receives|receiving)\s+(?:(?:the|this|that|a|my|your)\s+cards?|cards)\b(?!\s+(?:photo|photos|image|images|picture|pictures|scan|scans|list|lists|name|names))|\bin\s+the\s+post\b|\b(?:cards?\s+(?:(?:has|have|had)\s+)?arriv(?:e|ed|ing)|(?:it|this|that)\s+(?:(?:has|had)\s+)?arrived|confirm\s+(?:(?:that\s+)?(?:it|this|that|the\s+card)\s+)?arrived|cards?\s+arrival|arrival\s+of\s+(?:the|this|that|a|my|your)\s+card)\b|\b(?:use|via|by|with|through)\s+(?:r[o0]yal\s*mail|rm\s*48|dpd|evri|in\s*post|fed\s*ex|ups|dhl|usps)(?:\s+(?:for|to)\s+(?:(?:the|this|that|a|my|your)\s+)?cards?)?\b|\bcards?\b[^.!?\n]{0,40}\b(?:via|by|with|through)\s+(?:r[o0]yal\s*mail|rm\s*48|dpd|evri|in\s*post|fed\s*ex|ups|dhl|usps)\b|\b(?:print|create|make)\s+(?:a\s+)?(?:shipping\s+|postage\s+)?label\b|\blabel\s+ready\b|(?:[£$€]\s*\d+(?:[.,]\d+)?)\s+posted\b/iu;
const DIRECT_FULFILMENT_LIFECYCLE_COPY = /\b(?:send|sent|receive|received|post|posted|mail|mailed)\s+it\b|\b(?:it|this|that)\s+(?:(?:is|was|has\s+been|had\s+been)\s+)?(?:sent|received|posted|mailed)\b|\b(?:it|this|that|package|packages)\s+(?:(?:is|was|has\s+been|had\s+been)\s+)?(?:on\s+(?:the|its)\s+way|arriv(?:e|ed|ing))\b|\bpackages?\s+(?:(?:has|have|had|is|was)\s+)?arriv(?:e|ed|ing)\b/iu;
const EXTERNAL_PAYMENT_DETAIL_COPY = /\b(?:revolut|iban|swift|bic|sort\s*code|routing\s+number|account\s+(?:number|no\.?|#)|bank\s+(?:account|details)|wallet\s+address|cash\s+on\s+delivery|cod)\b|\b(?:send|give|transfer|wire|owe|pay|deposit|add)\b[^.!?\n]{0,40}(?:[£$€]\s*\d+(?:[.,]\d+)?|\b(?:funds?|money|pounds?|quid|tenner|sterling|gbp|usd|eur)\b)|\b(?:bank|wire)\s+(?:(?:me|it)\s+)?(?:\d+(?:[.,]\d+)?|it\s+over)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:quid|pounds?|gbp|usd|eur)\s+on\s+top\b|\btransfer\s+to\s+@[\p{L}\p{N}_]{2,}\b|\b(?:send|transfer)\s+funds?\s+to\s+(?:(?:my|the|this)\s+)?account(?:\s+\d{6,})?\b|\baccount\s+(?:number|no\.?|#)?\s*\d{6,}\b|\b(?:btc|usdt|bitcoin|crypto)\s+accepted\b|\b(?:str[i1]pe|shipp[o0])\b|\bfor\s+sale\b/iu;
const LEET_PROVIDER_COPY = /\b(?:str[\W_]*[i1!][\W_]*pe|[s5]tr[i1!]pe|sh[i1!]pp[o0]|c[a@4]sh\s*app|evr1|d[._-]+p[._-]+d)\b/iu;
const CARRIER_PROVIDER_COPY = /\b(?:r[o0]yal\s*mail|rm\s*48|dpd|evri|in\s*post|fed\s*ex|dhl|usps)\b/iu;
const UPS_CARRIER_PROVIDER_COPY = /\bUPS\b/u;
const COLLECTIBLE_CARRIER_REFERENCE = /\b(?:(?:promotional|promo)\s+card|(?:logo|brand)\s+(?:reference|mark|variant)|provenance(?:\s+notes?)?|memorabilia|ephemera)\b/iu;

const GATE0_RESTRICTED_COMMERCE_COPY = new RegExp(
  [
    '\\b(?:buy|buys|buying|bought)\\b',
    '\\b(?:sell|sells|selling)\\b',
    '\\bpurchas(?:e|es|ed|ing)\\b',
    '\\bcheck(?:out|outs|ing\\s+out)\\b',
    '\\b(?:pay|pays|paying|paid|payment|payments|payout|payouts)\\b',
    '\\b(?:refund|refunds|refunded|refunding|chargeback|chargebacks)\\b',
    '\\border(?:s|ed|ing)?\\b',
    '\\bship(?:s|ped|ping|ment|ments)?\\b',
    '\\bdeliver(?:s|ed|ing|y|ies)?\\b',
    '\\b(?:dispatch|dispatches|dispatched|dispatching|postage|parcel|parcels|courier|couriers|carrier|carriers)\\b',
    '\\b(?:tracking|tracked|shipping\\s+label|shipping\\s+labels|postage\\s+label|postage\\s+labels)\\b',
    '\\bfulfil(?:s|led|ling|ment|ments)?\\b',
    '\\bfulfill(?:s|ed|ing|ment|ments)?\\b',
    '\\b(?:stripe|shippo)\\b',
    '\\bpay\\s*pal\\b',
    '\\bvenmo\\b',
    '\\b(?:zelle|skrill|moneygram|western\\s+union)\\b',
    '\\bcash\\s*app\\b',
    '\\b(?:apple|google)\\s*pay\\b',
    '\\b(?:bank|wire|money)\\s+transfer(?:s|red|ring)?\\b',
    '\\b(?:cash|crypto|cryptocurrency|bitcoin|invoice|invoices|invoiced|billing)\\b',
    '\\b(?:credit|debit)\\s+card(?:s)?\\b',
    '\\b(?:external|outside|off\\s*platform)\\s+(?:pay|payment|payments|checkout)\\b',
    '\\b(?:payment|pay)\\s+(?:link|links|request|requests)\\b',
    '\\b(?:mark|marked)\\s+(?:(?:this|it|cards?|trade|offer)\\s+)?(?:as\\s+)?(?:sent|received)\\b',
    '\\bcards?\\s+(?:(?:were|was)\\s+|have\\s+been\\s+)?(?:sent|received|shipped|delivered)\\b',
    '\\b(?:trade|offer)\\s+(?:(?:is|was|has\\s+been)\\s+)?complet(?:e|ed)\\b',
  ].join('|'),
  'iu',
);

const GATE0_VISIBLE_NOTIFICATION_TYPES = new Set([
  'wishlist_match',
  'trade_offer',
  'offer_accepted',
  'offer_declined',
  'friend_request',
  'friend_accepted',
]);

function normalizeCopyForInspection(value: string): string {
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_COPY_CHARACTERS, '')
    .replace(/[\u039F\u03BF\u0405\u0406\u0410\u0415\u041E\u0420\u0423\u0430\u0435\u043E\u0440\u0443\u0455\u0456]/gu, (character) => COMMERCE_CONFUSABLES[character] ?? character)
    .replace(CAMEL_CASE_BOUNDARY, '$1 $2')
    .replace(COPY_SEPARATORS, ' ')
    .replace(/\s+/gu, ' ')
    .replace(SPACED_LETTER_SEQUENCE, (sequence) => sequence.replace(/\s+/gu, ''))
    .trim();
}

function containsObfuscatedCommerceToken(value: string): boolean {
  return normalizeCopyForInspection(value)
    .split(/\s+/u)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
    .some((token) => OBFUSCATED_COMMERCE_TOKEN.test(token));
}

function containsCarrierProviderPromotion(value: string): boolean {
  const normalized = normalizeCopyForInspection(value);
  const containsCarrier = CARRIER_PROVIDER_COPY.test(normalized)
    || UPS_CARRIER_PROVIDER_COPY.test(normalized);
  return containsCarrier && !COLLECTIBLE_CARRIER_REFERENCE.test(normalized);
}

export function gate0CopyContainsRestrictedCommerceLanguage(value: unknown): boolean {
  if (typeof value !== 'string') return value != null;
  const normalized = normalizeCopyForInspection(value);
  return GATE0_RESTRICTED_COMMERCE_COPY.test(normalized)
    || EXTERNAL_CURRENCY_TRANSFER.test(normalized)
    || FULFILMENT_ROUTE_COPY.test(normalized)
    || DIRECT_FULFILMENT_LIFECYCLE_COPY.test(normalized)
    || EXTERNAL_PAYMENT_DETAIL_COPY.test(normalized)
    || LEET_PROVIDER_COPY.test(value)
    || containsCarrierProviderPromotion(value)
    || containsObfuscatedCommerceToken(value);
}

export function sanitizeGate0CommerceCopy(
  value: unknown,
  replacement: string | null,
): string | null {
  if (value == null) return null;
  if (LIVE_COMMERCE_RELEASE_APPROVED && typeof value === 'string') return value;
  if (
    typeof value !== 'string'
    || gate0CopyContainsRestrictedCommerceLanguage(value)
  ) {
    return replacement;
  }
  return value;
}

export function assertGate0UserCopyAllowed(
  value: unknown,
  field = 'Message',
): void {
  if (
    !LIVE_COMMERCE_RELEASE_APPROVED
    && gate0CopyContainsRestrictedCommerceLanguage(value)
  ) {
    throw new Error(`${field}: ${GATE0_UNSAFE_USER_COPY_ERROR}`);
  }
}

export function assertGate0OfferFreeTextDisabled(
  value: unknown,
  field = 'Offer message',
): void {
  if (LIVE_COMMERCE_RELEASE_APPROVED || value == null) return;
  if (typeof value === 'string' && !value.trim()) return;
  throw new Error(`${field}: ${GATE0_OFFER_FREE_TEXT_DISABLED_ERROR}`);
}

export function sanitizeGate0OfferFreeText(value: unknown): string | null {
  if (value == null) return null;
  if (LIVE_COMMERCE_RELEASE_APPROVED && typeof value === 'string') return value;
  return null;
}

export function isGate0LegacyCommerceNotificationType(type: unknown): boolean {
  if (LIVE_COMMERCE_RELEASE_APPROVED) return false;
  if (typeof type !== 'string' || !type.trim()) return true;
  return !GATE0_VISIBLE_NOTIFICATION_TYPES.has(type.trim().toLowerCase());
}

export type Gate0NotificationCopyShape = {
  type: string;
  title: string | null;
  message: string | null;
};

export function sanitizeGate0Notification<T extends Gate0NotificationCopyShape>(
  notification: T,
): T | null {
  if (LIVE_COMMERCE_RELEASE_APPROVED) return notification;
  if (isGate0LegacyCommerceNotificationType(notification.type)) return null;

  return {
    ...notification,
    title: sanitizeGate0CommerceCopy(
      notification.title,
      GATE0_HIDDEN_NOTIFICATION_TITLE,
    ),
    message: sanitizeGate0CommerceCopy(
      notification.message,
      GATE0_HIDDEN_NOTIFICATION_MESSAGE,
    ),
  };
}
