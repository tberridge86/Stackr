import { Redirect, useLocalSearchParams } from 'expo-router';

export default function UserProfileRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Redirect
      href={{
        pathname: '/community/profile/[userId]',
        params: { userId: Array.isArray(id) ? id[0] : id ?? '' },
      }}
    />
  );
}
