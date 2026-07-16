import { Redirect } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function ListingCameraRedirect() {
  return <Redirect href={ROUTES.listingNew} />;
}
