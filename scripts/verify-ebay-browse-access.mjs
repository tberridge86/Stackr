import 'dotenv/config';
import { createEbayBrowsePriceSource } from '../backend/lib/marketPricing/ebayBrowseSource.js';

if (!process.argv.includes('--probe')) throw Error('Explicit --probe is required for the read-only OAuth/Browse access check.');
const result = await createEbayBrowsePriceSource().healthCheck({ verifyAccess: true });
console.log(JSON.stringify({ provider: 'ebay_browse_active', ...result }));
if (!result.accessVerified) process.exitCode = 1;
