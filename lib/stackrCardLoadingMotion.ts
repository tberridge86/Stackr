/** One timeline for the native indicator and its review movie. Units are milliseconds. */
export const CARD_LOADING_DURATION = 4000;
export const CARD_LOADING_STILL = 3200;
export const CARD_LOADING_STAGE = { width: 360, height: 240 };
export const CARD_LOADING_SIZES = { card: [54, 76], sleeve: [62, 84], loader: [74, 98] } as const;
export type CardLoadingTrack = { inputRange: number[]; outputRange: number[] };

function track(points: [number, number][]): CardLoadingTrack {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  points.slice(0, -1).forEach(([start, from], index) => {
    const [end, to] = points[index + 1];
    for (let step = 0; step < 16; step += 1) {
      const t = step / 16;
      const eased = t * t * (3 - 2 * t);
      inputRange.push(start + (end - start) * t);
      outputRange.push(from + (to - from) * eased);
    }
  });
  inputRange.push(points[points.length - 1][0]);
  outputRange.push(points[points.length - 1][1]);
  return { inputRange, outputRange };
}

export const CARD_LOADING_TRACKS = {
  cardX: track([[0, 64], [350, 64], [580, 100], [780, 180], [1440, 180], [1700, 220], [1900, 288], [2520, 288], [2870, 180], [4000, 180]]),
  cardY: track([[0, 162], [350, 165], [580, 58], [780, 66], [850, 66], [1080, 158], [1130, 161], [1220, 158], [1440, 158], [1700, 46], [1900, 51], [1970, 51], [2260, 151], [2330, 156], [2400, 150], [2490, 151], [4000, 151]]),
  cardRotation: track([[0, 0], [350, -5], [780, 0], [1440, 0], [1690, -6], [1900, 0], [4000, 0]]),
  sleeveX: track([[0, 180], [1440, 180], [1700, 220], [1900, 288], [2520, 288], [2870, 180], [4000, 180]]),
  sleeveY: track([[0, 158], [1440, 158], [1700, 46], [1900, 51], [1970, 51], [2260, 151], [2330, 156], [2400, 150], [2490, 151], [4000, 151]]),
  sleeveRotation: track([[0, 0], [1440, 0], [1690, -6], [1900, 0], [4000, 0]]),
  loaderX: track([[0, 288], [2520, 288], [2870, 180], [4000, 180]]),
  loaderY: track([[0, 151], [2260, 151], [2330, 156], [2400, 150], [2490, 151], [4000, 151]]),
  loaderOpacity: track([[0, 1], [4000, 1]]),
  sceneOpacity: track([[0, 0], [160, 1], [3490, 1], [3840, 0], [4000, 0]]),
  sheenOpacity: track([[0, 0], [2870, 0], [3010, 0.6], [3180, 0], [4000, 0]]),
  sheenX: track([[0, 153], [2870, 153], [3180, 207], [4000, 207]]),
} satisfies Record<string, CardLoadingTrack>;

export function cardLoadingValue(track: CardLoadingTrack, time: number) {
  const { inputRange, outputRange } = track;
  if (time <= inputRange[0]) return outputRange[0];
  for (let i = 1; i < inputRange.length; i += 1) {
    if (time <= inputRange[i]) {
      const t = (time - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
      return outputRange[i - 1] + t * (outputRange[i] - outputRange[i - 1]);
    }
  }
  return outputRange[outputRange.length - 1];
}
