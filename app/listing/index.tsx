import { Redirect } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function ListingIndexRedirect() {
  return <Redirect href={ROUTES.listingNew} />;
}
