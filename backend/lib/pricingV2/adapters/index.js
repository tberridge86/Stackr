import { createEbayActiveAdapter } from './ebayActive.js';
import { createEbaySoldAdapter } from './ebaySold.js';
import { createExistingStackrAdapter } from './existingStackr.js';
import { createManualVerifiedCompAdapter } from './manualVerified.js';

export function createPricingSourceAdapters(context = {}) {
  return [
    createManualVerifiedCompAdapter(context),
    createEbaySoldAdapter(),
    createExistingStackrAdapter(context),
    createEbayActiveAdapter(),
  ];
}
