import { Redirect } from 'expo-router';
import { ROUTES } from '../lib/routes';

export default function CameraRedirect() {
  return <Redirect href={ROUTES.scan} />;
}
