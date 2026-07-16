import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function ListingDetailRedirect() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return (
    <Redirect
      href={{
        pathname: ROUTES.market as any,
        params: {
          listingId: id,
        },
      }}
    />
  );
}
