import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function UserTradeListingsRedirect() {
  const params = useLocalSearchParams<{ userId?: string; userName?: string }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const userName = Array.isArray(params.userName) ? params.userName[0] : params.userName;

  return (
    <Redirect
      href={{
        pathname: ROUTES.market as any,
        params: {
          mode: 'trade',
          userId,
          userName,
        },
      }}
    />
  );
}
