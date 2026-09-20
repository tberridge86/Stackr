// Support/privacy contact designated by the operator on 20 September 2026.
export const SUPPORT_EMAIL = 'berridge14@icloud.com';
export const SUPPORT_URL = 'https://tberridge86.github.io/stackr-support/';
export const PRIVACY_URL = `${SUPPORT_URL}privacy.html`;
export const HELP_ARTICLES = [
  { id: 'scan', title: 'Scanning and correcting a match', body: 'Use Scan with good light and the whole card in view. Check the language, set, number and finish before saving. If there is no reliable match, use manual search or try another photo. Camera access can be changed in Settings → Permissions. Keep Stackr open until a save is confirmed; a recognition result is not a saved binder card.' },
  { id: 'prices', title: 'Missing prices and collection value', body: 'A guide price is an estimate, not a confirmed sale or an offer for your card. Compare the source, currency, condition, grade, language and finish. A cached older quote keeps its original date. “Unavailable” can mean there is no supported quote for that exact printing. “Could not load” means a request failed; retry when connected. “Pending” means a stored value has not been prepared yet. Missing values are not zero, and a partial collection total covers only the priced cards.' },
  { id: 'binder', title: 'Binders, quantities and master sets', body: 'Open Collection to manage binders. Official binders use the selected set and language; a master set includes its supported variants. Check the selected finish and quantity when adding a card. Wait for save confirmation before closing. Unsaved or pending work is not a completed sync. If an entry looks wrong, report its identity before removing it.' },
  { id: 'images', title: 'Missing images and card details', body: 'A placeholder can mean exact artwork is unavailable or an image could not load. Reopen the card while connected. Long press supported catalogue cards to inspect their artwork; ordinary taps still open the card action. Only supported finishes have simulated foil. Reduce Motion disables interactive lighting. Catalogue artwork and simulated lighting do not show the condition or authenticity of a card you own.' },
  { id: 'account', title: 'Account access and password recovery', body: 'Use Login → Forgot password for an email/password account. Use the original sign-in provider for other accounts. Settings can log out this device or sign out other sessions. Existing access on other devices can continue until its token expires. Contact support if you cannot recover access. Never include passwords or recovery codes in a report.' },
  { id: 'data', title: 'Your data and downloaded images', body: 'Settings → Your data has a route to request access, correction or deletion. Sending a request does not itself delete an account. Identity checks may be needed. Clearing downloaded images removes replaceable image-cache copies; it does not remove binder entries, original photos, scan contributions or pending edits. Do not reinstall Stackr or clear all app data to troubleshoot unsynchronised work.' },
] as const;

export function searchHelp(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return HELP_ARTICLES.filter(article => words.every(word => `${article.title} ${article.body}`.toLowerCase().includes(word)));
}
const CONTEXT_FIELDS = ['screen', 'cardId', 'setId', 'language', 'finish', 'variantId'] as const;
export function supportContext(input: Record<string, unknown>) {
  return CONTEXT_FIELDS.flatMap(key => {
    const value = input[key];
    return typeof value === 'string' && value.trim() ? [`${key}: ${value.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180)}`] : [];
  }).join('\n');
}
export function supportDraftKey(accountId: string | null, context: string) {
  return `stackr.support-draft.v1:${accountId ?? 'signed-out'}:${encodeURIComponent(context)}`;
}
export function supportEmailUrl(message: string, context: string, diagnostics: string) {
  const body = [message.trim().slice(0, 4000), context, diagnostics].filter(Boolean).join('\n\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Stackr support request')}&body=${encodeURIComponent(body)}`;
}
