import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';

const VIDEO_TIMEOUT_MS = 6000;

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();

  const [videoFinished, setVideoFinished] = useState(false);
  const navigatedRef = useRef(false);

  const authReady = !authLoading && !profileLoading;

  const navigate = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    if (!user) {
      router.replace('/(auth)/login');
    } else if (!profile?.collector_name) {
      router.replace('/profile/setup');
    } else {
      router.replace('/(tabs)');
    }
  };

  // Navigate once both the video and auth are ready
  useEffect(() => {
    if (videoFinished && authReady) navigate();
  }, [videoFinished, authReady]);

  // Safety — navigate after timeout even if video playback fails
  useEffect(() => {
    const t = setTimeout(() => setVideoFinished(true), VIDEO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <Video
        source={require('../assets/images/splash-video.mp4')}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        isMuted
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded && status.didJustFinish) {
            setVideoFinished(true);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
});
