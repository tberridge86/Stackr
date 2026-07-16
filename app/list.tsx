import { Redirect } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function ListRedirect() {
  return <Redirect href={ROUTES.listingNew} />;
}
