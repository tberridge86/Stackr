import type {
  CardFrameAnalyserFailureReason,
  LuminanceFrameInput,
} from '../lib/cardVisionFrameAnalyser';

export type CardFrameAnalyserFixtureName =
  | 'no-card'
  | 'correctly-framed-card'
  | 'rotated-card'
  | 'severe-perspective'
  | 'blurred-card'
  | 'glare'
  | 'dark-image'
  | 'clipped-edge'
  | 'finger-over-corner'
  | 'two-visible-cards'
  | 'rectangular-non-card-object';

export type CardFrameAnalyserFixtureExpectation = {
  cardDetected?: boolean;
  qualityAccepted?: boolean;
  failureReasonsInclude?: CardFrameAnalyserFailureReason[];
};

export type CardFrameAnalyserFixture = LuminanceFrameInput & {
  name: CardFrameAnalyserFixtureName;
  description: string;
  expected: CardFrameAnalyserFixtureExpectation;
};

type PixelPoint = {
  x: number;
  y: number;
};

const FIXTURE_WIDTH = 160;
const FIXTURE_HEIGHT = 224;

const createCanvas = (value = 44) => new Uint8Array(FIXTURE_WIDTH * FIXTURE_HEIGHT).fill(value);

const indexFor = (x: number, y: number) => y * FIXTURE_WIDTH + x;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const setPixel = (pixels: Uint8Array, x: number, y: number, value: number) => {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= FIXTURE_WIDTH || iy >= FIXTURE_HEIGHT) return;
  pixels[indexFor(ix, iy)] = clamp(Math.round(value), 0, 255);
};

const pointInPolygon = (point: PixelPoint, polygon: PixelPoint[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const drawLine = (pixels: Uint8Array, from: PixelPoint, to: PixelPoint, value: number, thickness = 2) => {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    for (let oy = -thickness; oy <= thickness; oy += 1) {
      for (let ox = -thickness; ox <= thickness; ox += 1) {
        if (Math.hypot(ox, oy) <= thickness) setPixel(pixels, x + ox, y + oy, value);
      }
    }
  }
};

const drawPolygon = (
  pixels: Uint8Array,
  polygon: PixelPoint[],
  fillValue: number,
  borderValue = 18,
  borderThickness = 3
) => {
  const minX = Math.floor(Math.min(...polygon.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...polygon.map((point) => point.x)));
  const minY = Math.floor(Math.min(...polygon.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...polygon.map((point) => point.y)));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon({ x, y }, polygon)) {
        setPixel(pixels, x, y, fillValue);
      }
    }
  }

  polygon.forEach((point, index) => {
    drawLine(pixels, point, polygon[(index + 1) % polygon.length], borderValue, borderThickness);
  });
};

const drawCircle = (pixels: Uint8Array, center: PixelPoint, radius: number, value: number) => {
  for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y += 1) {
    for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x += 1) {
      if (Math.hypot(x - center.x, y - center.y) <= radius) setPixel(pixels, x, y, value);
    }
  }
};

const rotatedCard = (center: PixelPoint, width: number, height: number, degrees = 0): PixelPoint[] => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const halfW = width / 2;
  const halfH = height / 2;
  const local = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  return local.map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }));
};

const boxBlur = (source: Uint8Array, radius: number, passes: number) => {
  let current = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < FIXTURE_HEIGHT; y += 1) {
      for (let x = 0; x < FIXTURE_WIDTH; x += 1) {
        let total = 0;
        let count = 0;
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            const sx = x + ox;
            const sy = y + oy;
            if (sx < 0 || sy < 0 || sx >= FIXTURE_WIDTH || sy >= FIXTURE_HEIGHT) continue;
            total += current[indexFor(sx, sy)];
            count += 1;
          }
        }
        next[indexFor(x, y)] = Math.round(total / count);
      }
    }
    current = next;
  }
  return current;
};

const makeFixture = (
  name: CardFrameAnalyserFixtureName,
  description: string,
  luminance: Uint8Array,
  expected: CardFrameAnalyserFixtureExpectation
): CardFrameAnalyserFixture => ({
  name,
  description,
  width: FIXTURE_WIDTH,
  height: FIXTURE_HEIGHT,
  rowStride: FIXTURE_WIDTH,
  luminance,
  guide: { x: 0.08, y: 0.06, width: 0.84, height: 0.88 },
  expected,
});

export function createCardFrameAnalyserFixtures(): CardFrameAnalyserFixture[] {
  const noCard = createCanvas(52);

  const correct = createCanvas(42);
  drawPolygon(correct, rotatedCard({ x: 80, y: 112 }, 91, 127, 0), 184);

  const rotated = createCanvas(42);
  drawPolygon(rotated, rotatedCard({ x: 80, y: 112 }, 86, 121, -11), 184);

  const severePerspective = createCanvas(42);
  drawPolygon(severePerspective, [
    { x: 60, y: 46 },
    { x: 101, y: 54 },
    { x: 129, y: 178 },
    { x: 31, y: 177 },
  ], 184);

  const blurredSource = createCanvas(42);
  drawPolygon(blurredSource, rotatedCard({ x: 80, y: 112 }, 91, 127, 0), 184);
  const blurred = boxBlur(blurredSource, 4, 3);

  const glare = createCanvas(42);
  drawPolygon(glare, rotatedCard({ x: 80, y: 112 }, 91, 127, 0), 184);
  drawCircle(glare, { x: 105, y: 77 }, 23, 255);

  const dark = createCanvas(14);
  drawPolygon(dark, rotatedCard({ x: 80, y: 112 }, 91, 127, 0), 25, 118);

  const clipped = createCanvas(42);
  drawPolygon(clipped, [
    { x: -8, y: 38 },
    { x: 83, y: 38 },
    { x: 83, y: 166 },
    { x: -8, y: 166 },
  ], 184);

  const finger = createCanvas(42);
  drawPolygon(finger, rotatedCard({ x: 80, y: 112 }, 91, 127, 0), 184);
  drawCircle(finger, { x: 34, y: 48 }, 20, 18);

  const twoCards = createCanvas(42);
  drawPolygon(twoCards, rotatedCard({ x: 49, y: 112 }, 54, 76, 0), 184);
  drawPolygon(twoCards, rotatedCard({ x: 112, y: 112 }, 54, 76, 0), 184);

  const nonCard = createCanvas(42);
  drawPolygon(nonCard, [
    { x: 20, y: 82 },
    { x: 140, y: 82 },
    { x: 140, y: 139 },
    { x: 20, y: 139 },
  ], 184);

  return [
    makeFixture('no-card', 'Uniform luminance field with no quadrilateral candidate.', noCard, {
      cardDetected: false,
      qualityAccepted: false,
      failureReasonsInclude: ['NO_CARD'],
    }),
    makeFixture('correctly-framed-card', 'A centered card-shaped rectangle filling the guide.', correct, {
      cardDetected: true,
      qualityAccepted: true,
    }),
    makeFixture('rotated-card', 'A single card-shaped rectangle rotated inside the guide.', rotated, {
      cardDetected: true,
      qualityAccepted: true,
    }),
    makeFixture('severe-perspective', 'A trapezoid with strong side imbalance.', severePerspective, {
      cardDetected: false,
      qualityAccepted: false,
      failureReasonsInclude: ['PERSPECTIVE'],
    }),
    makeFixture('blurred-card', 'A centered card blurred by repeated box filters.', blurred, {
      cardDetected: true,
      qualityAccepted: false,
      failureReasonsInclude: ['BLUR'],
    }),
    makeFixture('glare', 'A centered card with a high-luminance reflected patch.', glare, {
      cardDetected: true,
      qualityAccepted: false,
      failureReasonsInclude: ['GLARE'],
    }),
    makeFixture('dark-image', 'A card with low overall luminance and a visible edge.', dark, {
      cardDetected: true,
      qualityAccepted: false,
      failureReasonsInclude: ['UNDEREXPOSED'],
    }),
    makeFixture('clipped-edge', 'A card candidate that touches the frame edge.', clipped, {
      cardDetected: true,
      qualityAccepted: false,
      failureReasonsInclude: ['EDGE_CLIPPED'],
    }),
    makeFixture('finger-over-corner', 'A dark occluder covers the top-left corner.', finger, {
      cardDetected: true,
      qualityAccepted: false,
      failureReasonsInclude: ['CORNER_OCCLUDED'],
    }),
    makeFixture('two-visible-cards', 'Two plausible card-shaped objects in the same frame.', twoCards, {
      cardDetected: false,
      qualityAccepted: false,
      failureReasonsInclude: ['MULTIPLE_CARDS'],
    }),
    makeFixture('rectangular-non-card-object', 'A high-contrast wide rectangle with the wrong card aspect.', nonCard, {
      cardDetected: false,
      qualityAccepted: false,
      failureReasonsInclude: ['NON_CARD_RECTANGLE', 'ASPECT_RATIO'],
    }),
  ];
}

export function createCardFrameAnalyserBenchmarkFixtures(count = 100): CardFrameAnalyserFixture[] {
  const fixtures: CardFrameAnalyserFixture[] = [];
  const seeds = createCardFrameAnalyserFixtures().filter((fixture) => fixture.name !== 'no-card');
  for (let index = 0; index < count; index += 1) {
    const seed = seeds[index % seeds.length];
    fixtures.push({
      ...seed,
      name: seed.name,
      description: `${seed.description} Benchmark copy ${index + 1}.`,
      luminance: new Uint8Array(seed.luminance),
    });
  }
  return fixtures;
}
