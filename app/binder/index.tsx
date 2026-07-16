import { Redirect } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function BinderIndexRedirect() {
  return <Redirect href={ROUTES.collection} />;
}
