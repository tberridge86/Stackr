// app/offer/[id].tsx
import { useLocalSearchParams, Redirect } from 'expo-router';

export default function OfferDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/offer?id=${id}`} />;
}