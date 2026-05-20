import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { gradeCardWithXimilar } from '../../lib/ximilar';
import { Ionicons } from '@expo/vector-icons';

export default function CardGraderScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>Camera permission needed for grading</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({ base64: true });
    if (!photo) return;

    setImage(photo.uri);
    setLoading(true);

    try {
      const data = await gradeCardWithXimilar(photo.base64!);
      setResult(data.records?.[0] || null);
    } catch (e) {
      console.error(e);
      alert('Grading failed. Check your Ximilar token.');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const record = result;
    const grades = record.grades || {};
    const centering = record.card?.centering || {};

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.title}>AI Grade Result</Text>

          <View style={styles.imageRow}>
            {image && <Image source={{ uri: image }} style={styles.image} />}
            {record._clean_url_card && (
              <Image source={{ uri: record._clean_url_card }} style={styles.image} />
            )}
          </View>

          <View style={styles.gradeBox}>
            <Text style={styles.gradeText}>
              Estimated Grade: {grades.final ? grades.final.toFixed(1) : '--'}/10
            </Text>
            <Text style={styles.disclaimer}>AI estimate only — not official</Text>
          </View>

          <Text style={styles.sectionTitle}>Centering</Text>
          <Text style={styles.centerText}>
            Left/Right: {centering.left_right || '--'} • Top/Bottom: {centering.top_bottom || '--'}
          </Text>

          <Text style={styles.sectionTitle}>Breakdown</Text>
          <View style={styles.breakdown}>
            <Text>Corners: {grades.corners ?? '--'}</Text>
            <Text>Edges: {grades.edges ?? '--'}</Text>
            <Text>Surface: {grades.surface ?? '--'}</Text>
            <Text>Centering: {grades.centering ?? '--'}</Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              setResult(null);
              setImage(null);
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Grade Another Card</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
      />

      {/* Overlay controls */}
      <View style={styles.cameraOverlay}>
        <View style={styles.cameraControls}>
          <TouchableOpacity onPress={takePicture} style={styles.captureButton}>
            <Ionicons name="scan" size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.hint}>Align card straight-on with good lighting</Text>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Analyzing with Ximilar AI...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  message: { color: '#fff', fontSize: 18, textAlign: 'center', marginTop: 100 },
  button: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cameraControls: {
    alignItems: 'center',
    paddingBottom: 80,
  },
  captureButton: {
    backgroundColor: '#3b82f6',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  hint: { color: '#ccc', fontSize: 13, textAlign: 'center' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  imageRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  image: { width: 150, height: 210, borderRadius: 8 },
  gradeBox: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  gradeText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  disclaimer: { color: '#888', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#aaa', fontSize: 14, marginTop: 16, marginBottom: 6 },
  centerText: { color: '#fff', fontSize: 16 },
  breakdown: {
    backgroundColor: '#111',
    padding: 14,
    borderRadius: 10,
    gap: 6,
  },
});
