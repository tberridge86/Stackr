import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import {
  DEFAULT_CARD_ROI_MANIFEST,
  RECTIFIED_CARD_ASPECT_RATIO,
  roiToPixelRect,
  type CardRectificationRoi,
} from '../../lib/cardRectification';
import { getCardRectificationRecord } from '../../lib/cardRectificationStore';

function formatValue(value: unknown) {
  if (value == null || value === '') return '--';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function MetricRow({ label, value }: { label: string; value: unknown }) {
  const { theme } = useTheme();

  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', flex: 1 }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', flex: 1.3, textAlign: 'right' }}>
        {formatValue(value)}
      </Text>
    </View>
  );
}

function RoiOverlay({
  roi,
  displayWidth,
  displayHeight,
  color,
}: {
  roi: CardRectificationRoi;
  displayWidth: number;
  displayHeight: number;
  color: string;
}) {
  const rect = roiToPixelRect(roi, { width: displayWidth, height: displayHeight });

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: color + '18',
      }}
    >
      <Text style={{ color, fontSize: 9, fontWeight: '900', paddingHorizontal: 3, paddingVertical: 1 }}>
        {roi.label}
      </Text>
    </View>
  );
}

export default function RectificationDiagnosticsScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const record = useMemo(
    () => getCardRectificationRecord(typeof params.scanId === 'string' ? params.scanId : null),
    [params.scanId]
  );
  const result = record?.result ?? null;
  const manifest = result?.roiManifest ?? DEFAULT_CARD_ROI_MANIFEST;
  const rectified = result?.rectifiedFull ?? null;
  const leftEdgeCrop = result?.roiCrops?.leftEdge ?? null;
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const aspectRatio = rectified?.width && rectified?.height
    ? rectified.width / rectified.height
    : RECTIFIED_CARD_ASPECT_RATIO;
  const regions = manifest.regions.filter((region) => region.id !== 'fullFront' && region.id !== 'fullBack');
  const colors = ['#7C3AED', '#10B981', '#F59E0B', '#0EA5E9', '#EF4444', '#EC4899'];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
              Rectification ROI
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
              Development-only card region overlay.
            </Text>
          </View>
        </View>

        {!isDev ? (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Rectification diagnostics are hidden outside development builds.
            </Text>
          </View>
        ) : !record || !result || !rectified ? (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 }}>
              No rectified card available
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Capture a stable card from the VisionCamera scanner, then return to this screen.
            </Text>
          </View>
        ) : (
          <>
            <View
              onLayout={(event) => {
                setImageWidth(event.nativeEvent.layout.width);
                setImageHeight(event.nativeEvent.layout.height);
              }}
              style={{
                width: '100%',
                aspectRatio,
                borderRadius: 18,
                overflow: 'hidden',
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Image source={{ uri: rectified.uri }} style={{ width: '100%', height: '100%' }} resizeMode="stretch" />
              {imageWidth > 0 && imageHeight > 0 ? regions.map((region, index) => (
                <RoiOverlay
                  key={region.id}
                  roi={region}
                  displayWidth={imageWidth}
                  displayHeight={imageHeight}
                  color={colors[index % colors.length]}
                />
              )) : null}
            </View>

            {leftEdgeCrop ? (
              <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
                  Left edge crop
                </Text>
                <Image
                  source={{ uri: leftEdgeCrop.uri }}
                  style={{
                    width: 56,
                    height: 160,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  }}
                  resizeMode="stretch"
                />
              </View>
            ) : null}

            <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
                Output
              </Text>
              <MetricRow label="Scan" value={record.scanId} />
              <MetricRow label="Status" value={result.status} />
              <MetricRow label="ROI version" value={manifest.version} />
              <MetricRow label="Rectified" value={`${rectified.width} x ${rectified.height}`} />
              <MetricRow label="Recognition" value={result.recognitionCrop ? `${result.recognitionCrop.width} x ${result.recognitionCrop.height}` : null} />
              <MetricRow label="OCR source" value={result.ocrSourceCrop ? `${result.ocrSourceCrop.width} x ${result.ocrSourceCrop.height}` : null} />
              <MetricRow label="Thumbnail" value={result.thumbnail ? `${result.thumbnail.width} x ${result.thumbnail.height}` : null} />
              <MetricRow label="Left edge" value={result.roiCrops?.leftEdge ? `${result.roiCrops.leftEdge.width} x ${result.roiCrops.leftEdge.height}` : null} />
              <MetricRow label="Message" value={result.message} />
            </View>

            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/scan/local-inference-comparison',
                params: { scanId: record.scanId },
              })}
              style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 14,
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '900' }}>
                Compare local inference
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
                Done
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
