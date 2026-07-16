import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../components/Text';
import { StackrLoadingScreen } from '../components/StackrLoadingScreen';
import { useTheme } from '../components/theme-context';
import { StackrBackButton } from '../components/StackrBackButton';

export default function SplashPreviewScreen() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrLoadingScreen message="Opening Stackr" />

      <SafeAreaView
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      >
        <View style={{ marginLeft: 16, marginTop: 8 }}>
          <StackrBackButton onPress={() => router.back()} />
        </View>
      </SafeAreaView>

      <SafeAreaView
        pointerEvents="none"
        edges={['bottom']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 18 }}
      >
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
          Splash preview · this is the loading screen shown on app launch
        </Text>
      </SafeAreaView>
    </View>
  );
}
