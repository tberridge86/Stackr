import { Redirect } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function CollectionRedirect() {
  return <Redirect href={ROUTES.collection} />;
}
