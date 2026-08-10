import { analyzeLuminanceFrame } from '../lib/cardVisionFrameAnalyser';
import { createCardFrameAnalyserBenchmarkFixtures } from './card-frame-analyser-fixtures';

const fixtureCount = 120;
const fixtures = createCardFrameAnalyserBenchmarkFixtures(fixtureCount);
const durations: number[] = [];

for (const fixture of fixtures) {
  const result = analyzeLuminanceFrame(fixture);
  durations.push(result.processingMs);
}

durations.sort((left, right) => left - right);

const percentile = (values: number[], ratio: number) => {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
};

const summary = {
  analyser: 'stackr-card-frame-analyser-reference',
  fixtureCount,
  medianMs: percentile(durations, 0.5),
  p95Ms: percentile(durations, 0.95),
  maxMs: durations[durations.length - 1] ?? 0,
};

console.log(JSON.stringify(summary, null, 2));
