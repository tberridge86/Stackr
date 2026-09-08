import { stackrApiClient, type StackrCardPrice } from './stackrApiV1';

/** Refreshes one exact normal/raw-NM/GBP provider estimate, then returns the persisted quote. */
export async function refreshPersonalProviderEstimate(variantId: string): Promise<StackrCardPrice> {
  const response = await stackrApiClient.refreshExactProviderPrice(variantId);
  return response.data;
}
