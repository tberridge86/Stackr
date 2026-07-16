export const stackrLogoSizes = {
  homeMark: {
    width: 38,
    height: 42,
  },
  homeWordmark: {
    smallWidth: 78,
    mediumWidth: 92,
    largeWidth: 110,
    height: 31,
  },
  screenHeaderWordmark: {
    minWidth: 132,
    maxWidth: 182,
    widthRatio: 0.42,
    height: 58,
  },
  authLogo: {
    compact: {
      width: 210,
      height: 126,
    },
    regular: {
      width: 240,
      height: 144,
    },
  },
  loadingWordmarkHeightRatio: 0.24,
} as const;

export const stackrActionIconSizes = {
  defaultFrame: 44,
  defaultArtwork: 34,
  headerTouch: 42,
  headerFrame: 34,
  headerArtwork: 30,
  headerAvatar: 36,
} as const;

export const stackrSellCategoryIconSizes = {
  categoryTileFrame: 78,
  categoryTileArtwork: 70,
  manualTileFrame: 40,
  manualTileArtwork: 36,
  priceTileFrame: 58,
  priceTileArtwork: 52,
  selectedPickerFrame: 34,
  selectedPickerArtwork: 30,
  chipFrame: 24,
  chipArtwork: 22,
  badgeFrame: 16,
  badgeArtwork: 16,
  emptyStateFrame: 48,
  emptyStateArtwork: 28,
} as const;

export const stackrTabBarSizes = {
  homeFrame: 54,
  secondaryFrame: 54,
  homeIcon: 42,
  secondaryIcon: 42,
  marketCommunityIcon: 44,
  bindersVaultIcon: 42,
  centerScanFrame: 62,
  centerScanIcon: 40,
  footerSearchIcon: 34,
  nativeSearchMinArtwork: 18,
  barHeightIos: 96,
  barHeightAndroid: 80,
  paddingBottomIos: 10,
  paddingBottomAndroid: 8,
  activeGlowExtra: 10,
  activeGlowCoreExtra: 3,
  scanRaise: 20,
  tabRaise: 10,
} as const;

export const stackrCardImageSizes = {
  cardAspectRatio: 0.72,
  rowCard: {
    width: 52,
    height: 72,
    radius: 9,
  },
  gridCardRadius: 10,
} as const;

export const stackrTabContentPadding = {
  compact: 116,
  standard: 136,
  floatingAction: 160,
  deepSheet: 288,
} as const;

export function getStackrHomeWordmarkWidth(screenWidth: number) {
  if (screenWidth < 360) return stackrLogoSizes.homeWordmark.smallWidth;
  if (screenWidth < 390) return stackrLogoSizes.homeWordmark.mediumWidth;
  return stackrLogoSizes.homeWordmark.largeWidth;
}

export function getStackrHeaderLogoWidth(screenWidth: number) {
  const { minWidth, maxWidth, widthRatio } = stackrLogoSizes.screenHeaderWordmark;
  return Math.min(maxWidth, Math.max(minWidth, screenWidth * widthRatio));
}
