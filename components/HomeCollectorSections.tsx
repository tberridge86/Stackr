import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { BinderArtwork } from "./BinderArtwork";
import { StackrImage } from "./StackrImage";
import { Text } from "./Text";
import { useTheme } from "./theme-context";
import type { HomeBinderSummary, HomeCardPreview } from "./HomeCommandCenter";
import { stackrIcons } from "../lib/stackrIcons";
import { getHomeCardDisplayName, getHomeCardLanguageLabel } from "../lib/homeDisplayLabels";

export type HomeCollectionHeroProps = {
  binder: HomeBinderSummary | null;
  missingCards: HomeCardPreview[];
  chaseCards?: HomeCardPreview[];
  isLoading: boolean;
  error?: string | null;
  onRetry: () => void;
  onOpenBinder: (id: string) => void;
  onCreateBinder: () => void;
  onCardPress: (card: HomeCardPreview) => void;
};

const PURPLE = "#6938F5";
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function getCompletion(binder: HomeBinderSummary) {
  if (
    binder.type !== "official" ||
    !Number.isFinite(binder.total) ||
    binder.total <= 0
  )
    return null;
  const owned = Math.max(0, binder.owned);
  const total = Math.max(0, binder.total);
  const percent = clamp(
    Number.isFinite(binder.completionPercent)
      ? binder.completionPercent
      : (owned / total) * 100,
  );
  const basis = binder.masterSetEnabled
    ? "Master set progress"
    : "Set completion";
  const detail = `${owned} of ${total} collected · ${Math.round(percent)}%`;
  return { basis, detail, percent, accessibilityLabel: `${basis}: ${detail}` };
}

function getCards(
  binder: HomeBinderSummary,
  missingCards: HomeCardPreview[],
  chaseCards: HomeCardPreview[],
) {
  const validMissingCount = binder.type === "official" && Number.isFinite(binder.missing) && binder.missing > 0;
  const nearCompletionMissing = validMissingCount
    && binder.missing <= 3
    && missingCards.length >= binder.missing;
  if (nearCompletionMissing) return { label: "Still to collect", cards: missingCards.slice(0, 3) };

  const missing = validMissingCount ? missingCards.slice(0, 3) : [];
  const missingHasNoArtwork = missing.length > 0 && missing.every((card) => !card.imageUrl);
  const wishedWithArtwork = chaseCards.filter((card) => Boolean(card.imageUrl)).slice(0, 3);
  if (missingHasNoArtwork && wishedWithArtwork.length) return { label: "On your wish list", cards: wishedWithArtwork };
  if (missing.length) return { label: "Still to collect", cards: missing };
  const owned = binder.topValueCards
    .slice(0, 3)
    .map<HomeCardPreview>((card) => ({
      cardId: card.cardId,
      setId: card.setId,
      name: card.name,
      englishName: card.englishName,
      setName: card.setName ?? binder.name,
      englishSetSupplement: card.englishSetSupplement,
      number: card.number,
      imageUrl: card.imageUrl,
      language: card.language,
      estimatedValue: card.estimatedValue,
    }));
  return owned.length ? { label: "From your binder", cards: owned } : null;
}

export function HomeCollectionHero({
  binder,
  missingCards,
  chaseCards = [],
  isLoading,
  error = null,
  onRetry,
  onOpenBinder,
  onCreateBinder,
  onCardPress,
}: HomeCollectionHeroProps) {
  const { theme } = useTheme();
  if (!binder && error)
    return <ErrorRecovery error={error} onRetry={onRetry} />;
  if (!binder && isLoading) return <LoadingCollection />;
  if (!binder) return <EmptyCollection onCreateBinder={onCreateBinder} />;

  const completion = getCompletion(binder);
  const cardSection = getCards(binder, missingCards, chaseCards);
  const goalCopy = binder.type === "official" && Number.isFinite(binder.missing) && binder.missing >= 0
    ? binder.missing === 0 ? "Set complete" : `${binder.missing} card${binder.missing === 1 ? "" : "s"} to go`
    : null;
  return (
    <View style={styles.section}>
      <TouchableOpacity
        onPress={() => onOpenBinder(binder.id)}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`Open ${binder.name} binder`}
        accessibilityHint={completion ? completion.accessibilityLabel : "Open this binder to view its cards."}
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.artStage,
            {
              backgroundColor: binder.color
                ? `${binder.color}18`
                : `${PURPLE}12`,
            },
          ]}
        >
          <BinderArtwork
            coverKey={binder.coverKey}
            sourceSetId={binder.sourceSetId}
            sourceSetLanguage={binder.sourceSetLanguage}
            setName={binder.name}
            fallbackLogoUrl={
              binder.sourceSetCoverUrl ??
              binder.sourceSetLogoUrl ??
              binder.sourceSetSymbolUrl
            }
            fallbackColor={binder.color}
            progress={completion?.percent ?? 0}
            width={84}
            stageHeight={96}
            plateWidth={74}
            plateHeight={82}
            artworkWidth={62}
            artworkHeight={72}
            progressWidth={66}
            showProgressBar={false}
            showProgressText={false}
            showFan={false}
          />
        </View>
        <View style={styles.heroCopy}>
          <Text
            style={[styles.kicker, { color: theme.colors.textSoft }]}
            numberOfLines={1}
          >
            {binder.type === "official" ? "CONTINUE COLLECTING" : "YOUR BINDER"}
          </Text>
          <Text
            style={[styles.binderName, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            {binder.name}
          </Text>
          {completion ? (
            <View
              style={styles.progressBlock}
              accessibilityRole="progressbar"
              accessibilityLabel={completion.accessibilityLabel}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(completion.percent),
                text: completion.accessibilityLabel,
              }}
            >
              <Text
                style={[styles.progressLabel, { color: theme.colors.textSoft }]}
              >
                {completion.basis}
              </Text>
              <Text
                style={[styles.progressDetail, { color: theme.colors.text }]}
              >
                {completion.detail}
              </Text>
              {goalCopy ? (
                <Text style={[styles.goalCopy, { color: theme.colors.textSoft }]}>
                  {goalCopy}
                </Text>
              ) : null}
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: `${completion.percent}%` },
                  ]}
                />
              </View>
            </View>
          ) : (
            <Text
              style={[styles.collectionCount, { color: theme.colors.textSoft }]}
            >
              {binder.owned} card{binder.owned === 1 ? "" : "s"} in this binder
            </Text>
          )}
        </View>
        <Ionicons
          name="chevron-forward"
          size={19}
          color={theme.colors.textSoft}
        />
      </TouchableOpacity>
      {cardSection ? (
        <View style={styles.cardSection}>
          <Text style={[styles.cardSectionTitle, { color: theme.colors.text }]}>
            {cardSection.label}
          </Text>
          <View style={styles.cardRow}>
            {cardSection.cards.map((card) => (
              <CollectionCardTile
                key={`${card.setId ?? "set"}:${card.cardId}`}
                card={card}
                onPress={onCardPress}
              />
            ))}
          </View>
        </View>
      ) : null}
      {error ? <InlineRecovery error={error} onRetry={onRetry} /> : null}
    </View>
  );
}

function CollectionCardTile({
  card,
  onPress,
}: {
  card: HomeCardPreview;
  onPress: (card: HomeCardPreview) => void;
}) {
  const { theme } = useTheme();
  const displayName = getHomeCardDisplayName(card);
  const languageLabel = getHomeCardLanguageLabel(card.language);
  return (
    <TouchableOpacity
      onPress={() => onPress(card)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`View ${displayName}${languageLabel ? `, ${languageLabel}` : ""}`}
      style={[
        styles.cardTile,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <StackrImage
        uri={card.imageUrl}
        contentFit="contain"
        style={styles.cardArt}
        showFallbackIcon
      />
      <Text
        style={[styles.cardName, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      {card.number || languageLabel ? (
        <Text
          style={[styles.cardMeta, { color: theme.colors.textSoft }]}
          numberOfLines={1}
        >
          {[card.number ? `#${card.number}` : null, languageLabel].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyCollection({
  onCreateBinder,
}: Pick<HomeCollectionHeroProps, "onCreateBinder">) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.emptyIcon, { backgroundColor: `${PURPLE}12` }]}>
        <Image
          source={stackrIcons.binders}
          style={styles.brandIcon}
          resizeMode="contain"
        />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={[styles.kicker, { color: theme.colors.textSoft }]}>
          YOUR COLLECTION
        </Text>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          Start a binder
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSoft }]}>
          Organise a set, then add cards from your library or scanner.
        </Text>
      </View>
      <View style={styles.emptyActions}>
        <TouchableOpacity
          onPress={onCreateBinder}
          activeOpacity={0.84}
          accessibilityRole="button"
          accessibilityLabel="Start a binder"
          style={styles.primaryAction}
        >
          <Text style={styles.primaryActionText}>Start binder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LoadingCollection() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.loadingCard,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your collection"
    >
      <ActivityIndicator color={PURPLE} />
      <View style={styles.loadingCopy}>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          Loading your collection
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSoft }]}>
          Finding your next binder.
        </Text>
      </View>
    </View>
  );
}
function ErrorRecovery({
  error,
  onRetry,
}: Pick<HomeCollectionHeroProps, "error" | "onRetry">) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.errorCard,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={23} color={PURPLE} />
      <View style={styles.errorCopy}>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          Collection unavailable
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSoft }]}>
          {error}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Retry loading collection"
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
function InlineRecovery({
  error,
  onRetry,
}: Pick<HomeCollectionHeroProps, "error" | "onRetry">) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.inlineRecovery,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={17}
        color={theme.colors.textSoft}
      />
      <Text
        style={[styles.recoveryText, { color: theme.colors.textSoft }]}
        numberOfLines={2}
      >
        {error}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Retry loading collection"
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginBottom: 20 },
  heroCard: {
    minHeight: 132,
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artStage: {
    width: 88,
    height: 104,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroCopy: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.5,
    fontWeight: "800",
  },
  binderName: { fontSize: 18, lineHeight: 22, fontWeight: "900", marginTop: 3 },
  collectionCount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 9,
  },
  progressBlock: { marginTop: 7, gap: 3 },
  progressLabel: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  progressDetail: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  goalCopy: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: PURPLE },
  cardSection: { gap: 8, marginTop: 2 },
  cardSectionTitle: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  cardRow: { flexDirection: "row", gap: 8 },
  cardTile: {
    minHeight: 128,
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    padding: 7,
    gap: 3,
  },
  cardArt: { height: 88, borderRadius: 9, backgroundColor: "#F7F3FF" },
  cardName: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  cardMeta: { fontSize: 10, lineHeight: 13, fontWeight: "700" },
  emptyCard: {
    minHeight: 184,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brandIcon: { width: 34, height: 34 },
  emptyCopy: { flex: 1, minWidth: 170 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "900", marginTop: 2 },
  emptySubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    marginTop: 3,
  },
  emptyActions: { width: "100%", flexDirection: "row", gap: 10 },
  primaryAction: {
    minHeight: 44,
    flex: 1,
    borderRadius: 14,
    backgroundColor: PURPLE,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  loadingCard: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginBottom: 20,
  },
  loadingCopy: { flex: 1 },
  errorCard: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 20,
  },
  errorCopy: { flex: 1, minWidth: 0 },
  inlineRecovery: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 11,
    paddingRight: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recoveryText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  retryText: { color: PURPLE, fontSize: 12, lineHeight: 16, fontWeight: "900" },
});
