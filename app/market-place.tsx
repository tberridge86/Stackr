import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function MarketPlaceRedirect() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return <Redirect href={{ pathname: ROUTES.market as any, params }} />;
}
