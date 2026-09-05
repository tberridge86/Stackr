import { createEbayActiveAdapter } from './ebayActive.js';
import { createEbaySoldAdapter } from './ebaySold.js';
import { createExistingStackrAdapter } from './existingStackr.js';
import { createManualVerifiedCompAdapter } from './manualVerified.js';
import { createPokeTraceSoldAdapter } from './pokeTraceSold.js';

export function createPricingSourceAdapters(context = {}) {
  return [
    createManualVerifiedCompAdapter(context),
    createEbaySoldAdapter(),
    createPokeTraceSoldAdapter(undefined, context),
    createExistingStackrAdapter(context),
    createEbayActiveAdapter(),
  ];
}
