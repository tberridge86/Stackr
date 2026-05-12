import { useTheme } from '../../components/theme-context';
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { createTradeReview } from '../../lib/tradeOffers';

export default function LeaveReviewScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    offerId?: string;
    reviewUserId?: string;
  }>();

  const offerId = Array.isArray(params.offerId) ? params.offerId[0] : params.offerId;
  const reviewUserId = Array.isArray(params.reviewUserId) ? params.reviewUserId[0] : params.reviewUserId;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }

    if (!offerId || !reviewUserId) {
      Alert.alert('Error', 'Missing trade or user information.');
      return;
    }

    try {
      setSubmitting(true);

      await createTradeReview({
        offerId,
        reviewedUserId: reviewUserId,
        rating,
        comment: comment.trim() || null,
      });

      Alert.alert(
        'Review submitted',
        'Thanks for leaving a review. It helps build trust in the community.',
        [{ text: 'OK', onPress: () => router.replace('/offers') }]
      );
    } catch (error: any) {
      Alert.alert('Could not submit review', error?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>

        {/* Header */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 26 }}>‹</Text>
        </TouchableOpacity>

        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900', marginBottom: 6 }}>
          Leave a Review
        </Text>
        <Text style={{ color: theme.colors.textSoft, marginBottom: 28, lineHeight: 20 }}>
          How did the trade go? Your honest feedback helps the Stackr community.
        </Text>

        {/* Star Rating */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 20,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 16 }}>
            Rate this trader
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 38 }}>
                  {star <= rating ? '⭐' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }}>
            {rating === 0 && 'Tap to rate'}
            {rating === 1 && '😞 Poor — serious issues with this trade'}
            {rating === 2 && '😕 Below average — some problems'}
            {rating === 3 && '😐 Average — trade completed but not smooth'}
            {rating === 4 && '😊 Good — minor issues but overall fine'}
            {rating === 5 && '🌟 Excellent — smooth, fast, trustworthy!'}
          </Text>
        </View>

        {/* Comment */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 10 }}>
            Comment (optional)
          </Text>

          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Describe how the trade went — card condition, communication, speed..."
            placeholderTextColor={theme.colors.textSoft}
            multiline
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 12,
              color: theme.colors.text,
              minHeight: 100,
              textAlignVertical: 'top',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          />
        </View>

        {/* Trust notice */}
        <View style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          padding: 12,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 }}>
            ℹ️ Reviews are public and help other collectors decide who to trade with.
            Please be honest and fair.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
          style={{
            backgroundColor: rating === 0 ? theme.colors.textSoft : theme.colors.primary,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900' }}>
              Submit Review
            </Text>
          )}
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity
          onPress={() => router.replace('/offers')}
          style={{ marginTop: 12, alignItems: 'center' }}
        >
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
            Skip for now
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}