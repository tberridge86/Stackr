import {
  buildMintyHomeInsight,
  DEFAULT_MINTY_FEEDBACK_PROFILE,
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  type MintyHomeInsightInput,
} from '../lib/mintyInsights';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseInput: MintyHomeInsightInput = {
  totalValue: 240,
  absoluteChange: 4,
  percentageChange: 1.8,
  changePeriodLabel: '30D',
  trendData: [220, 224, 230, 235, 240],
  ownedCount: 12,
  duplicateSummary: null,
  activeBinder: null,
  missingCards: [],
  recentActivity: [],
  marketplaceMatchCount: 0,
};

const anniversaryInsight = buildMintyHomeInsight(
  {
    ...baseInput,
    chaseCards: [
      {
        cardId: 'charizard-base-test',
        name: 'Charizard',
        setName: 'Base Set',
        estimatedValue: 180,
      },
    ],
  },
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  DEFAULT_MINTY_FEEDBACK_PROFILE
);

assert(
  anniversaryInsight.title === '30th anniversary watch' || anniversaryInsight.tags.includes('anniversary'),
  `Expected anniversary catalyst, received ${anniversaryInsight.title}`
);
assert(anniversaryInsight.forecast, 'Anniversary insight should include a forecast object.');
assert(
  anniversaryInsight.forecast?.caveat.includes('not guaranteed prices'),
  'Forecast caveat must make uncertainty explicit.'
);
assert(
  anniversaryInsight.body.includes('sold comps'),
  'Insight copy must tell collectors to confirm with sold comps.'
);

const xyInsight = buildMintyHomeInsight(
  {
    ...baseInput,
    chaseCards: [
      {
        cardId: 'zygarde-xy-test',
        name: 'Zygarde ex',
        setName: 'XY Fates Collide',
        estimatedValue: 36,
      },
    ],
  },
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  DEFAULT_MINTY_FEEDBACK_PROFILE
);

assert(
  xyInsight.title === 'XY and Mega watch' || xyInsight.tags.includes('mega_evolution'),
  `Expected XY/Mega catalyst, received ${xyInsight.title}`
);
assert(xyInsight.forecast?.estimatedImpactPctRange, 'XY insight should include an estimated watch band.');

const quietInsight = buildMintyHomeInsight(
  {
    ...baseInput,
    chaseCards: [
      {
        cardId: 'charizard-base-test',
        name: 'Charizard',
        setName: 'Base Set',
        estimatedValue: 180,
      },
    ],
  },
  {
    ...DEFAULT_MINTY_PERSONALISATION_SETTINGS,
    useMarketCatalysts: false,
  },
  DEFAULT_MINTY_FEEDBACK_PROFILE
);

assert(
  !quietInsight.tags.includes('anniversary') && !quietInsight.tags.includes('mega_evolution'),
  'Market catalyst toggle should suppress built-in catalyst insights.'
);

console.log('Minty intelligence checks passed');
