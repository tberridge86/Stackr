import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const TCGDEX_BASE_URL = process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2';

const TCGDEX_LANGUAGES = ['en', 'fr', 'es', 'it', 'pt-br', 'de', 'ja', 'zh-tw', 'id', 'th'] as const;
type TcgdexLanguage = typeof TCGDEX_LANGUAGES[number];

const LANGUAGE_REGION: Record<TcgdexLanguage, string | null> = {
  en: 'INTL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  'pt-br': 'BR',
  de: 'DE',
  ja: 'JP',
  'zh-tw': 'TW',
  id: 'ID',
  th: 'TH',
};

const LANGUAGE_ALIASES: Record<string, TcgdexLanguage> = {
  jp: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  pt: 'pt-br',
  ptbr: 'pt-br',
  'pt-br': 'pt-br',
  'pt_br': 'pt-br',
  zh: 'zh-tw',
  'zh-tw': 'zh-tw',
  zh_tw: 'zh-tw',
  zhtw: 'zh-tw',
  tw: 'zh-tw',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TcgdexSetBrief = {
  id: string;
  name?: string;
  logo?: string;
  symbol?: string;
  cardCount?: {
    total?: number;
    official?: number;
  };
};

type TcgdexSet = TcgdexSetBrief & {
  releaseDate?: string;
  serie?: {
    id?: string;
    name?: string;
  };
  cards?: TcgdexCardBrief[];
};

type TcgdexCardBrief = {
  id: string;
  localId?: string;
  name?: string;
  image?: string;
};

type TcgdexCard = TcgdexCardBrief & {
  rarity?: string;
  set?: {
    id?: string;
    name?: string;
    serie?: string;
    cardCount?: {
      total?: number;
      official?: number;
    };
  };
};

type SyncArgs = {
  language: TcgdexLanguage;
  setId: string | null;
  allCards: boolean;
};

function normalizeLanguage(value?: string | null): TcgdexLanguage {
  const cleaned = String(value ?? 'ja').trim().toLowerCase().replace(/\s+/g, '-');
  const aliased = LANGUAGE_ALIASES[cleaned] ?? cleaned;
  return (TCGDEX_LANGUAGES as readonly string[]).includes(aliased) ? aliased as TcgdexLanguage : 'ja';
}

function parseArgs(): SyncArgs {
  const args = process.argv.slice(2);
  const languageArg = args.find((arg) => arg.startsWith('--language='))?.split('=')[1];
  const setArg = args.find((arg) => arg.startsWith('--set='))?.split('=')[1];
  return {
    language: normalizeLanguage(languageArg),
    setId: setArg?.trim() || process.env.TCGDEX_SET_ID || null,
    allCards: args.includes('--all-cards') || process.env.TCGDEX_SYNC_ALL_CARDS === 'true',
  };
}

function toDbId(language: TcgdexLanguage, id?: string | null) {
  const clean = String(id ?? '').trim();
  if (!clean) return clean;
  return language === 'en' ? clean : `${language}:${clean}`;
}

function withWebpAsset(url?: string | null, size: 'low' | 'high' = 'low') {
  if (!url) return null;
  return `${String(url).replace(/\/$/, '')}/${size}.webp`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${TCGDEX_BASE_URL.replace(/\/$/, '')}${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TCGdex request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}

function mapSetRow(language: TcgdexLanguage, set: TcgdexSet | TcgdexSetBrief) {
  const total = set.cardCount?.total ?? 0;
  const official = set.cardCount?.official ?? total;
  return {
    id: toDbId(language, set.id),
    name: set.name ?? set.id,
    series: 'serie' in set ? set.serie?.name ?? set.serie?.id ?? '' : '',
    printed_total: official,
    total,
    release_date: 'releaseDate' in set ? set.releaseDate ?? null : null,
    symbol_url: set.symbol ?? null,
    logo_url: set.logo ?? null,
    language,
    region: LANGUAGE_REGION[language],
    external_ids: {
      tcgdex: set.id,
    },
  };
}

function mapCardRow(language: TcgdexLanguage, card: TcgdexCard, fallbackSet: TcgdexSet) {
  const tcgdexSetId = card.set?.id ?? fallbackSet.id;
  const setTotal = card.set?.cardCount?.total ?? fallbackSet.cardCount?.total ?? fallbackSet.cards?.length ?? null;
  return {
    id: toDbId(language, card.id),
    name: card.name ?? card.id,
    set_id: toDbId(language, tcgdexSetId),
    language,
    region: LANGUAGE_REGION[language],
    external_ids: {
      tcgdex: card.id,
    },
    number: card.localId ?? null,
    rarity: card.rarity ?? null,
    image_small: withWebpAsset(card.image, 'low'),
    image_large: withWebpAsset(card.image, 'high'),
    raw_data: {
      ...card,
      language,
      stackr_db_id: toDbId(language, card.id),
      set: {
        ...(card.set ?? {}),
        id: toDbId(language, tcgdexSetId),
        tcgdex_id: tcgdexSetId,
        name: card.set?.name ?? fallbackSet.name ?? tcgdexSetId,
        printedTotal: setTotal,
        total: setTotal,
      },
    },
  };
}

async function upsertRows(table: 'pokemon_sets' | 'pokemon_cards', rows: Record<string, any>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

async function syncSetSummaries(language: TcgdexLanguage) {
  const sets = await fetchJson<TcgdexSetBrief[]>(`/${language}/sets`);
  await upsertRows('pokemon_sets', sets.map((set) => mapSetRow(language, set)));
  console.log(`Synced ${sets.length} ${language} set summaries`);
  return sets;
}

async function syncSetCards(language: TcgdexLanguage, setId: string) {
  const set = await fetchJson<TcgdexSet>(`/${language}/sets/${encodeURIComponent(setId)}`);
  await upsertRows('pokemon_sets', [mapSetRow(language, set)]);

  const briefs = set.cards ?? [];
  const rows: Record<string, any>[] = [];

  for (let index = 0; index < briefs.length; index += 12) {
    const batch = briefs.slice(index, index + 12);
    const cards = await Promise.all(
      batch.map((card) => fetchJson<TcgdexCard>(`/${language}/cards/${encodeURIComponent(card.id)}`))
    );
    rows.push(...cards.map((card) => mapCardRow(language, card, set)));
    console.log(`Fetched ${Math.min(index + batch.length, briefs.length)} / ${briefs.length} cards for ${set.id}`);
  }

  await upsertRows('pokemon_cards', rows);
  console.log(`Synced ${rows.length} cards for ${language}:${set.id}`);
}

async function run() {
  const args = parseArgs();
  const sets = await syncSetSummaries(args.language);

  if (args.setId) {
    await syncSetCards(args.language, args.setId);
    return;
  }

  if (args.allCards) {
    for (const set of sets) {
      await syncSetCards(args.language, set.id);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
