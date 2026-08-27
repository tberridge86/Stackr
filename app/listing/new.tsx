import { Redirect } from 'expo-router';
import CreateListingScreen from '../../features/listing/CreateListingScreen';
import { isSellerTrialModeEnabled } from '../../lib/sellerTrial';

export default function CreateListingRoute() {
  if (isSellerTrialModeEnabled()) return <Redirect href="/seller" />;
  return <CreateListingScreen />;
}
