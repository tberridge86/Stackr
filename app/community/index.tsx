import { Redirect } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function CommunityRedirect() {
  return <Redirect href={ROUTES.community} />;
}
