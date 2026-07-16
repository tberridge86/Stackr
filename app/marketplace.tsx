import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function MarketplaceRedirect() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return <Redirect href={{ pathname: ROUTES.market as any, params }} />;
}
