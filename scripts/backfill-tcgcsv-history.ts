import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const BASE_ARCHIVE_URL = 'https://tcgcsv.com/archive/tcgplayer/prices-{date}.ppmd.7z';
const DEFAULT_START = '2024-02-08';
const DEFAULT_DAYS = 30;
const DEFAULT_REQUEST_LIMIT = 500;
const DEFAULT_DELAY_MS = 250;
const CARD_PAGE_SIZE = 1000;
const POKEMON_CATEGORY_ID = '3';
const TCGCSV_BASE_URL = 'https://tcgcsv.com';
const USD_TO_GBP = Number(process.env.USD_TO_GBP ?? 0.79);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Args = {
  start?: string;
  end?: string;
  days: number;
  cacheDir: string;
  write: boolean;
  allowMore: boolean;
  requestLimit: number;
  delayMs: number;
};

type CardRow = {
  id: string;
  name: string;
  set_id: string | null;
  raw_data: any;
};

type TcgcsvGroup = {
  groupId: number;
  name: string;
  categoryId: number;
};

type TcgcsvProduct = {
  productId: number;
  name: string;
  groupId: number;
  imageUrl?: string | null;
  extendedData?: { name?: string; value?: string }[];
};

type ArchivePrice = {
  productId: number;
  subTypeName?: string;
  marketPrice?: number | null;
  lowPrice?: number | null;
  midPrice?: number | null;
};

type PriceSummary = {
  low: number | null;
  mid: number | null;
  market: number | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv: string[]): Args {
  const args: Args = {
    days: DEFAULT_DAYS,
    cacheDir: path.join(homedir(), '.tcgcsv', 'archives'),
    write: false,
    allowMore: false,
    requestLimit: DEFAULT_REQUEST_LIMIT,
    delayMs: DEFAULT_DELAY_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--write') args.write = true;
    else if (arg === '--allow-more') args.allowMore = true;
    else if (arg === '--start' && next) { args.start = next; index += 1; }
    else if (arg === '--end' && next) { args.end = next; index += 1; }
    else if (arg === '--days' && next) { args.days = Number(next); index += 1; }
    else if (arg === '--cache-dir' && next) { args.cacheDir = next; index += 1; }
    else if (arg === '--request-limit' && next) { args.requestLimit = Number(next); index += 1; }
    else if (arg === '--delay-ms' && next) { args.delayMs = Number(next); index += 1; }
    else if (arg === '--help') {
      console.log([
        'Usage: npm run backfill-tcgcsv-history -- [options]',
        '',
        'Options:',
        '  --days 30             Backfill the last N days ending yesterday',
        '  --start YYYY-MM-DD    Inclusive start date',
        '  --end YYYY-MM-DD      Inclusive end date',
        '  --write               Write snapshots. Without this, dry-run only',
        '  --allow-more          Allow more than 30 days',
        '  --request-limit 500   Stop before exceeding this many TCGCSV requests',
        '  --cache-dir PATH      Archive cache directory',
      ].join('\n'));
      process.exit(0);
    }
  }

  return args;
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function isoDay(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getDateRange(args: Args): string[] {
  let start: Date;
  let end: Date;

  if (args.start || args.end) {
    start = parseDate(args.start ?? DEFAULT_START);
    end = parseDate(args.end ?? isoDay(addDays(new Date(), -1)));
  } else {
    end = parseDate(isoDay(addDays(new Date(), -1)));
    start = addDays(end, -(args.days - 1));
  }

  if (start > end) throw new Error('--start cannot be after --end');

  const days: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    days.push(isoDay(current));
  }

  if (days.length > 30 && !args.allowMore) {
    throw new Error(`Refusing to process ${days.length} days without --allow-more`);
  }

  return days;
}

function normalizeNumber(value: string): string {
  return value.trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
}

function parseCollectorNumber(value: string): string {
  const normalized = normalizeNumber(value);
  if (!normalized) return '';
  const left = normalized.split('/')[0] ?? normalized;
  return left.replace(/^0+/, '') || '0';
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bex\b/g, ' ex ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toGbpFromUsd(value: number | null): number | null {
  return typeof value === 'number' ? Math.round(value * USD_TO_GBP * 100) / 100 : null;
}

function nextMidnightUTC(snapshotDate: string): string {
  const date = new Date(snapshotDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function getExtendedDataValue(product: TcgcsvProduct, key: string): string | null {
  const entries = Array.isArray(product.extendedData) ? product.extendedData : [];
  const match = entries.find((entry) => String(entry?.name ?? '').toLowerCase() === key.toLowerCase());
  const value = match?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isDisplayableSingleCard(product: TcgcsvProduct): boolean {
  const lowerName = product.name.toLowerCase();
  const blockedNameTerms = [
    'code card',
    'booster',
    'elite trainer box',
    'etb',
    'bundle',
    'case',
    'blister',
    'collection',
    'deck',
    'tin',
    'playmat',
    'sleeves',
    'binder',
    'poster',
    'coins',
    'box',
  ];
  if (blockedNameTerms.some((term) => lowerName.includes(term))) return false;
  return Boolean(getExtendedDataValue(product, 'Number') || getExtendedDataValue(product, 'Rarity'));
}

function summarizePrices(prices: ArchivePrice[]): PriceSummary {
  const values = prices
    .flatMap((price) => [price.lowPrice, price.midPrice, price.marketPrice])
    .filter((value): value is number => typeof value === 'number');
  const midValues = prices.map((price) => price.midPrice).filter((value): value is number => typeof value === 'number');
  const marketValues = prices.map((price) => price.marketPrice).filter((value): value is number => typeof value === 'number');
  const avg = (arr: number[]) => arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : null;
  return {
    low: toGbpFromUsd(values.length ? Math.min(...values) : null),
    mid: toGbpFromUsd(avg(midValues)),
    market: toGbpFromUsd(avg(marketValues)),
  };
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function getSevenZipCandidates(): string[] {
  const candidates = ['7z', '7za'];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe'
    );
  }
  return candidates;
}

async function extractArchive(archivePath: string): Promise<string> {
  const extractDir = await mkdtemp(path.join(tmpdir(), 'tcgcsv-history-'));
  const args = ['x', archivePath, `-o${extractDir}`, '-y'];
  let lastError: unknown = null;

  for (const candidate of getSevenZipCandidates()) {
    try {
      await runProcess(candidate, args);
      return extractDir;
    } catch (error) {
      lastError = error;
    }
  }

  await rm(extractDir, { recursive: true, force: true });
  throw new Error(`Could not extract ${path.basename(archivePath)}. Install 7-Zip or make sure 7z is on PATH. ${lastError}`);
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function fetchJson<T>(url: string, requestState: { count: number }, args: Args): Promise<T> {
  requestState.count += 1;
  if (requestState.count > args.requestLimit) {
    throw new Error(`Request limit exceeded (${args.requestLimit})`);
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'PocketVault/1.0.0' } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TCGCSV request failed ${response.status}: ${text.slice(0, 160)}`);
  }
  if (args.delayMs > 0) await delay(args.delayMs);
  return response.json() as Promise<T>;
}

async function downloadArchive(date: string, args: Args, requestState: { count: number }): Promise<string | null> {
  await mkdir(args.cacheDir, { recursive: true });
  const archivePath = path.join(args.cacheDir, `prices-${date}.ppmd.7z`);
  if (existsSync(archivePath)) return archivePath;

  requestState.count += 1;
  if (requestState.count > args.requestLimit) {
    throw new Error(`Request limit exceeded (${args.requestLimit})`);
  }

  const url = BASE_ARCHIVE_URL.replace('{date}', date);
  const response = await fetch(url, { headers: { 'User-Agent': 'PocketVault/1.0.0' } });
  if (response.status === 404) return null;
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`Archive download failed ${response.status}: ${text.slice(0, 160)}`);
  }

  await pipeline(response.body as any, createWriteStream(archivePath));
  const info = await stat(archivePath);
  if (info.size === 0) {
    await rm(archivePath, { force: true });
    throw new Error(`Downloaded empty archive for ${date}`);
  }
  if (args.delayMs > 0) await delay(args.delayMs);
  return archivePath;
}

async function readArchivePrices(extractDir: string): Promise<Map<string, Map<number, ArchivePrice[]>>> {
  const files = await walkFiles(extractDir);
  const byGroup = new Map<string, Map<number, ArchivePrice[]>>();

  for (const filePath of files) {
    if (path.basename(filePath) !== 'prices') continue;
    const parts = filePath.split(path.sep);
    const priceIndex = parts.length - 1;
    const categoryId = parts[priceIndex - 2];
    const groupId = parts[priceIndex - 1];
    if (categoryId !== POKEMON_CATEGORY_ID || !groupId) continue;

    const content = (await readFile(filePath, 'utf8')).trim();
    if (!content) continue;
    const json = JSON.parse(content);
    const rows = Array.isArray(json?.results) ? json.results : [];
    if (!byGroup.has(groupId)) byGroup.set(groupId, new Map());
    const groupMap = byGroup.get(groupId)!;
    for (const row of rows) {
      if (typeof row?.productId !== 'number') continue;
      if (!groupMap.has(row.productId)) groupMap.set(row.productId, []);
      groupMap.get(row.productId)!.push(row);
    }
  }

  return byGroup;
}

async function fetchAllCards(): Promise<CardRow[]> {
  const cards: CardRow[] = [];
  for (let from = 0; ; from += CARD_PAGE_SIZE) {
    const to = from + CARD_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, set_id, raw_data')
      .range(from, to);
    if (error) throw error;
    cards.push(...(data ?? []) as CardRow[]);
    if (!data || data.length < CARD_PAGE_SIZE) break;
  }
  return cards;
}

function buildCardIndex(cards: CardRow[]) {
  const bySetName = new Map<string, CardRow[]>();
  for (const card of cards) {
    const setName = String(card.raw_data?.set?.name ?? '').trim();
    if (!setName) continue;
    const key = normalizeName(setName);
    if (!bySetName.has(key)) bySetName.set(key, []);
    bySetName.get(key)!.push(card);
  }
  return bySetName;
}

function matchCard(product: TcgcsvProduct, setCards: CardRow[]): CardRow | null {
  const productNumber = getExtendedDataValue(product, 'Number') ?? '';
  const productNumberNormalized = normalizeNumber(productNumber);
  const productCollector = parseCollectorNumber(productNumber);
  const productName = normalizeName(product.name.replace(/\s+-\s+[0-9a-z/]+$/i, ''));

  return (
    setCards.find((card) => normalizeNumber(card.raw_data?.number ?? '') === productNumberNormalized && productNumberNormalized !== '') ??
    setCards.find((card) => parseCollectorNumber(card.raw_data?.number ?? '') === productCollector && productCollector !== '') ??
    setCards.find((card) => normalizeName(card.name ?? card.raw_data?.name ?? '') === productName && productName.length > 2) ??
    null
  );
}

async function saveMarketPriceSnapshotByDay(snapshot: any, snapshotDate: string) {
  const nextDay = nextMidnightUTC(snapshotDate);
  const updatePayload = { ...snapshot };
  delete updatePayload.user_id;
  delete updatePayload.card_id;
  delete updatePayload.set_id;

  const updateQuery = supabase
    .from('market_price_snapshots')
    .update(updatePayload)
    .eq('card_id', snapshot.card_id)
    .gte('snapshot_at', snapshotDate)
    .lt('snapshot_at', nextDay);

  const { data: updated, error: updateError } = snapshot.set_id == null
    ? await updateQuery.is('set_id', null).select('card_id').limit(1)
    : await updateQuery.eq('set_id', snapshot.set_id).select('card_id').limit(1);

  if (updateError) return updateError;
  if (updated && updated.length > 0) return null;

  const { error: insertError } = await supabase.from('market_price_snapshots').insert(snapshot);
  return insertError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dates = getDateRange(args);
  const requestState = { count: 0 };

  console.log(`TCGCSV history backfill: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log(args.write ? 'Mode: WRITE' : 'Mode: DRY RUN');

  const groupsJson = await fetchJson<{ results?: TcgcsvGroup[] }>(
    `${TCGCSV_BASE_URL}/tcgplayer/3/groups`,
    requestState,
    args
  );
  const groupById = new Map((groupsJson.results ?? []).map((group) => [String(group.groupId), group]));
  const cardsBySetName = buildCardIndex(await fetchAllCards());
  const productCache = new Map<string, TcgcsvProduct[]>();

  let archivesFound = 0;
  let totalMatched = 0;
  let totalWritten = 0;
  let totalNoMatch = 0;
  let totalErrors = 0;

  for (const date of dates) {
    const archivePath = await downloadArchive(date, args, requestState);
    if (!archivePath) {
      console.log(`[skip] ${date}: no archive`);
      continue;
    }

    archivesFound += 1;
    const extractDir = await extractArchive(archivePath);
    try {
      const byGroup = await readArchivePrices(extractDir);
      let dateMatched = 0;
      let dateWritten = 0;
      let dateNoMatch = 0;

      for (const [groupId, pricesByProduct] of byGroup.entries()) {
        const group = groupById.get(groupId);
        if (!group) continue;
        const setCards = cardsBySetName.get(normalizeName(group.name)) ?? [];
        if (!setCards.length) continue;

        if (!productCache.has(groupId)) {
          const productsJson = await fetchJson<{ results?: TcgcsvProduct[] }>(
            `${TCGCSV_BASE_URL}/tcgplayer/3/${groupId}/products`,
            requestState,
            args
          );
          productCache.set(groupId, (productsJson.results ?? []).filter(isDisplayableSingleCard));
        }

        const products = productCache.get(groupId) ?? [];
        for (const product of products) {
          const prices = pricesByProduct.get(product.productId);
          if (!prices?.length) continue;
          const card = matchCard(product, setCards);
          if (!card) {
            dateNoMatch += 1;
            continue;
          }

          const summary = summarizePrices(prices);
          const tcgMid = summary.market ?? summary.mid ?? summary.low;
          if (tcgMid == null) continue;

          dateMatched += 1;
          if (!args.write) continue;

          const snapshotAt = `${date}T00:00:00.000Z`;
          const error = await saveMarketPriceSnapshotByDay({
            user_id: null,
            card_id: card.id,
            set_id: card.set_id ?? card.raw_data?.set?.id ?? null,
            tcg_low: summary.low,
            tcg_mid: tcgMid,
            cardmarket_trend: null,
            ebay_low: null,
            ebay_average: null,
            ebay_high: null,
            ebay_count: 0,
            snapshot_at: snapshotAt,
          }, snapshotAt);

          if (error) totalErrors += 1;
          else dateWritten += 1;
        }
      }

      totalMatched += dateMatched;
      totalWritten += dateWritten;
      totalNoMatch += dateNoMatch;
      console.log(`[done] ${date}: matched ${dateMatched}, ${args.write ? `written ${dateWritten}` : 'dry-run'}, no match ${dateNoMatch}`);
    } finally {
      await rm(extractDir, { recursive: true, force: true });
    }
  }

  console.log([
    '',
    'Backfill complete',
    `Archives found: ${archivesFound}/${dates.length}`,
    `Matched prices: ${totalMatched}`,
    `Written snapshots: ${totalWritten}`,
    `No match: ${totalNoMatch}`,
    `Errors: ${totalErrors}`,
    `TCGCSV requests used: ${requestState.count}/${args.requestLimit}`,
  ].join('\n'));
}

main().catch((error) => {
  console.error('TCGCSV history backfill failed:', error);
  process.exit(1);
});
