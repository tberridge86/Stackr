import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const STARTUP_VIDEO = require('../assets/startup/stackr-premium-opening.mp4');
const STARTUP_POSTER = require('../assets/startup/stackr-premium-poster.png');
export const STARTUP_VIDEO_TIMEOUT_MS = 12_000;

type Props = { onComplete?: () => void; preview?: boolean };

/** Local 4.2-second premium logo reveal. Playback never gates authentication. */
export function StackrStartupVideo({ onComplete, preview = false }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width, height);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const completed = useRef(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [firstFrame, setFirstFrame] = useState(false);
  const player = useVideoPlayer(STARTUP_VIDEO, video => {
    video.loop = preview;
    video.muted = true;
    video.playbackRate = 1;
    video.audioMixingMode = 'mixWithOthers';
  });
  const complete = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    player.pause();
    callback.current?.();
  }, [player]);

  useEffect(() => {
    let mounted = true;
    const setPreference = (value: boolean) => { if (mounted) setReduceMotion(value); };
    void AccessibilityInfo.isReduceMotionEnabled().then(setPreference).catch(() => setPreference(true));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setPreference);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const end = player.addListener('playToEnd', complete);
    const status = player.addListener('statusChange', ({ status: nextStatus }) => {
      if (nextStatus === 'error') complete();
    });
    if (player.status === 'error') complete();
    const timeout = preview ? undefined : setTimeout(complete, STARTUP_VIDEO_TIMEOUT_MS);
    return () => {
      end.remove();
      status.remove();
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [complete, player, preview]);

  useEffect(() => {
    if (reduceMotion === false && !completed.current) player.play();
    else if (reduceMotion === true) complete();
  }, [complete, player, reduceMotion]);

  return (
    <View accessible accessibilityLabel="Opening Stackr" style={styles.container}>
      <VideoView
        player={player}
        style={{ width: size, height: size }}
        contentFit="contain"
        nativeControls={false}
        surfaceType="textureView"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        allowsVideoFrameAnalysis={false}
        playsInline
        accessible={false}
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {!firstFrame || reduceMotion !== false ? (
        <Image source={STARTUP_POSTER} style={StyleSheet.absoluteFill} resizeMode="contain" accessible={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' } });
