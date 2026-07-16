import { Redirect } from 'expo-router';
import { ROUTES } from '../../lib/routes';

export default function ScanCameraRedirect() {
  return <Redirect href={ROUTES.scan} />;
}
