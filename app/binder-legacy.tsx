import { Redirect } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function BinderLegacyRedirect() {
  return <Redirect href={ROUTES.collection} />;
}
