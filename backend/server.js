/* eslint-env node */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';
import discordRoutes from './routes/discord.js';
import sharp from 'sharp';
import Jimp from 'jimp';
import cardsightRoutes from './routes/cardsight.js';
import giblRoutes from './routes/gibl.js';
import localAiScanRoutes from './routes/localAiScan.js';
import rareCandyScanRoutes from './routes/rareCandyScan.js';
import scannerPackRoutes from './routes/scannerPacks.js';
import stripeRoutes from './routes/stripe.js';
import { Buffer } from 'node:buffer';

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/api/cardsight', cardsightRoutes);
app.use('/api/gibl', giblRoutes);
app.use('/api/local-ai', localAiScanRoutes);
app.use('/api/rare-candy-scan', rareCandyScanRoutes);
app.use('/api/scanner-packs', scannerPackRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/stripe', stripeRoutes);

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_ENGINE = process.env.SERPAPI_ENGINE || 'ebay';
const XIMILAR_API_TOKEN = process.env.XIMILAR_API_TOKEN;
const POKEMON_TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const POKEMON_PRICE_TRACKER_API_KEY = process.env.POKEMON_PRICE_TRACKER_API_KEY;
const CARDMATRIX_API_KEY = process.env.CARDMATRIX_API_KEY;
const POKEWALLET_API_KEY = process.env.POKEWALLET_API_KEY;
const POKEWALLET_API_BASE_URL = process.env.POKEWALLET_API_BASE_URL || 'https://api.pokewallet.io';
const PORT = process.env.PORT || 3001;
const EBAY_SOLD_SEARCH_TIMEOUT_MS = Number(process.env.EBAY_SOLD_SEARCH_TIMEOUT_MS || 3500);
const EBAY_BROWSE_SEARCH_TIMEOUT_MS = Number(process.env.EBAY_BROWSE_SEARCH_TIMEOUT_MS || 4500);
const EBAY_OAUTH_SCOPES = (
  process.env.EBAY_OAUTH_SCOPES ||
  'https://api.ebay.com/oauth/api_scope'
)
  .split(/\s+/)
  .filter(Boolean);


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getApiErrorMessage(payload) {
  if (!payload) return 'Unknown error';
  if (typeof payload === 'string') return payload;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.message)) return payload.message.join(', ');
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function stripBase64ImagePrefix(value) {
  return String(value || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function averagePatchColor(data, info, startX, startY, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const endX = Math.min(info.width, startX + size);
  const endY = Math.min(info.height, startY + size);

  for (let y = Math.max(0, startY); y < endY; y += 1) {
    for (let x = Math.max(0, startX); x < endX; x += 1) {
      const idx = ((y * info.width) + x) * info.channels;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
      count += 1;
    }
  }

  return count ? [r / count, g / count, b / count] : [0, 0, 0];
}

function detectForegroundBounds(data, info) {
  const { width, height, channels } = info;
  const patch = Math.max(10, Math.floor(Math.min(width, height) * 0.045));
  const backgrounds = [
    averagePatchColor(data, info, 0, 0, patch),
    averagePatchColor(data, info, width - patch, 0, patch),
    averagePatchColor(data, info, 0, height - patch, patch),
    averagePatchColor(data, info, width - patch, height - patch, patch),
  ];

  const rowCounts = new Array(height).fill(0);
  const colCounts = new Array(width).fill(0);
  const threshold = 38;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = ((y * width) + x) * channels;
      const color = [data[idx], data[idx + 1], data[idx + 2]];
      const minBackgroundDistance = Math.min(...backgrounds.map((bg) => colorDistance(color, bg)));
      if (minBackgroundDistance > threshold) {
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }

  const rowThreshold = Math.max(8, width * 0.08);
  const colThreshold = Math.max(8, height * 0.08);
  let top = rowCounts.findIndex((count) => count > rowThreshold);
  let bottom = rowCounts.length - 1 - [...rowCounts].reverse().findIndex((count) => count > rowThreshold);
  let left = colCounts.findIndex((count) => count > colThreshold);
  let right = colCounts.length - 1 - [...colCounts].reverse().findIndex((count) => count > colThreshold);

  if (top < 0 || left < 0 || bottom < top || right < left) return null;

  const detectedWidth = right - left + 1;
  const detectedHeight = bottom - top + 1;
  const areaRatio = (detectedWidth * detectedHeight) / (width * height);
  if (areaRatio < 0.35 || areaRatio > 0.98) return null;

  const padX = Math.round(detectedWidth * 0.025);
  const padY = Math.round(detectedHeight * 0.025);
  left = Math.max(0, left - padX);
  top = Math.max(0, top - padY);
  right = Math.min(width - 1, right + padX);
  bottom = Math.min(height - 1, bottom + padY);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
    areaRatio,
  };
}

async function preprocessGradeImage(base64Image) {
  const inputBuffer = Buffer.from(stripBase64ImagePrefix(base64Image), 'base64');
  const prepared = sharp(inputBuffer)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true });
  const { data, info } = await prepared
    .clone()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bounds = detectForegroundBounds(data, info);

  const pipeline = bounds
    ? prepared.clone().extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    })
    : prepared.clone();
  const outputBuffer = await pipeline
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    base64: outputBuffer.toString('base64'),
    debug: {
      detected: Boolean(bounds),
      bounds,
      source: { width: info.width, height: info.height },
    },
  };
}

async function analyzeEdgeWhitening(base64Image) {
  const image = sharp(Buffer.from(stripBase64ImagePrefix(base64Image), 'base64'))
    .rotate()
    .resize({ width: 1000, withoutEnlargement: true })
    .removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const band = Math.max(8, Math.round(Math.min(width, height) * 0.035));
  const inset = Math.max(6, Math.round(Math.min(width, height) * 0.02));

  const sampleRegion = (name, x1, y1, x2, y2) => {
    let total = 0;
    let white = 0;
    let bright = 0;
    let pale = 0;
    let maxRun = 0;

    for (let y = y1; y < y2; y += 1) {
      let rowRun = 0;
      for (let x = x1; x < x2; x += 1) {
        const idx = ((y * width) + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const saturation = max === 0 ? 0 : (max - min) / max;
        const isBright = brightness > 188;
        const isPale = brightness > 152 && saturation < 0.22;
        const isWhite = isBright && saturation < 0.18;
        total += 1;
        if (isBright) bright += 1;
        if (isPale) pale += 1;
        if (isWhite) {
          white += 1;
          rowRun += 1;
          maxRun = Math.max(maxRun, rowRun);
        } else {
          rowRun = 0;
        }
      }
    }

    const whiteRatio = total ? white / total : 0;
    const paleRatio = total ? pale / total : 0;
    const brightRatio = total ? bright / total : 0;
    const score = Math.min(1, (whiteRatio * 1.8) + (paleRatio * 0.8) + (maxRun / Math.max(1, x2 - x1)) * 0.35);
    return {
      name,
      whiteRatio: Number(whiteRatio.toFixed(4)),
      paleRatio: Number(paleRatio.toFixed(4)),
      brightRatio: Number(brightRatio.toFixed(4)),
      maxWhiteRunRatio: Number((maxRun / Math.max(1, x2 - x1)).toFixed(4)),
      score: Number(score.toFixed(4)),
      severity: score > 0.32 ? 'high' : score > 0.18 ? 'medium' : score > 0.09 ? 'low' : 'none',
    };
  };

  const edges = [
    sampleRegion('top', inset, inset, width - inset, inset + band),
    sampleRegion('bottom', inset, height - inset - band, width - inset, height - inset),
    sampleRegion('left', inset, inset, inset + band, height - inset),
    sampleRegion('right', width - inset - band, inset, width - inset, height - inset),
  ];
  const overallScore = edges.reduce((max, edge) => Math.max(max, edge.score), 0);
  return {
    edges,
    overallScore: Number(overallScore.toFixed(4)),
    verdict: overallScore > 0.32 ? 'Likely whitening / edge wear' : overallScore > 0.18 ? 'Possible whitening' : overallScore > 0.09 ? 'Minor whitening signal' : 'No obvious whitening signal',
    confidence: 'experimental',
    imageSize: { width, height },
  };
}

function getPokeWalletHeaders() {
  if (!POKEWALLET_API_KEY) {
    throw new Error('Missing POKEWALLET_API_KEY');
  }

  return {
    Accept: 'application/json',
    'X-API-Key': POKEWALLET_API_KEY,
  };
}

function normalizePokeWalletCard(card) {
  const info = card?.card_info ?? {};
  return {
    id: card?.id ?? null,
    name: info.name ?? info.clean_name ?? null,
    set_name: info.set_name ?? null,
    set_code: info.set_code ?? null,
    set_id: info.set_id ?? null,
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    image_url: card?.id ? `/api/pokewallet/images/${encodeURIComponent(card.id)}?size=high` : null,
    tcgplayer: card?.tcgplayer ?? null,
    cardmarket: card?.cardmarket ?? null,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000, label = 'request') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ===============================
// TITLE FILTERING
// ===============================

const BLOCKED_TERMS = [
  // Graded slabs
  'psa', 'bgs', 'cgc', 'sgc', 'rcg', 'hga', 'csg', 'ace', 'beckett',
  'graded', 'gem mint', 'slab',

  // Fakes / unofficial
  'proxy', 'replica', 'reprint', 'remake', 'reproduction',
  'bootleg', 'counterfeit', 'fake',
  'custom card', 'custom ', 'fan art', 'fanart', 'fan-made', 'fan made',

  // Multi-card lots
  'bundle', 'bulk', 'job lot', 'joblot', 'lot of', 'trio', 'pair',
  'collection lot', 'mixed lot',
  ' x2', ' x3', ' x4', ' x5',

  // Sealed product / booster
  'booster pack', 'booster box', 'booster bundle', 'booster',
  'blister pack', 'blister',
  'sealed pack', 'elite trainer', 'etb',
  'empty box', 'display box', 'empty tin',
  'advent calendar',

  // Multi-listing choose-your-own
  'choose your card', 'choose your cards', 'pick your card',
  'you choose', 'choose card', 'choose a card', 'choose individual',
  'singles common', 'common uncommon',
  'select your', 'pick from',

  // Stickers / art products
  'sticker sheet', 'sticker pack', 'sticker set', 'sticker',
  'artbox',

  // Metal / novelty fake cards
  'black metal card', 'metal card', 'solid metal',
  'gold foil card', 'gold metal', 'metal gold',
  '24k gold', '24ct gold', 'gold plated',

  // Other non-card formats
  'oversized', 'jumbo', 'digital', 'code card',
  'mini card', 'mini print',

  // Keychains / wearables / accessories
  'keychain', 'keyring', 'lanyard', 'wristband',
  'fridge magnet', 'magnet',
  'pendant', 'necklace', 'jewellery', 'jewelry', 'bracelet', 'earring',
  'pin badge', 'button badge', 'enamel pin',
  'badge',

  // Toys / figures / plush
  'plush', 'soft toy', 'stuffed',
  'figure', 'figurine', 'statue', 'mini figure',

  // Homeware / clothing
  'mug', 'cup', 'coaster',
  't-shirt', 'hoodie', 'clothing',
  'phone case', 'phone cover',
  'notebook', 'journal',
  'poster', 'art print', 'canvas print', 'canvas',
  'bookmark', 'patch',
  'playmat', 'play mat',
  'tin',
  'tapestry', 'blanket', 'cushion', 'pillow', 'towel',
  'wallet', 'umbrella', 'lamp',

  // Card accessories (not cards)
  'deck box', 'deckbox',
  'sleeve', 'card sleeve',
  'binder', 'portfolio', 'card folder', 'album',
  'acrylic case', 'acrylic stand',

  // Plastic / resin novelties
  'resin', 'plastic card',

  // Display / novelty items
  'for display', 'display only', 'display piece',
  'mystery pack', 'mystery box', 'mystery bag', 'mystery bundle',
  'novelty', 'random card', 'random selection',
  'coin', 'token',
  'complete set', 'complete master', 'master set', 'full set', '100% complete',
  'shadowless',

  // Condition red flags
  'read description',
  'heavily played', 'heavy play', 'moderate play', 'moderately played', 'poor condition', 'damaged',
  'creased', 'crease', 'bent', 'inked', 'marked',
  'written on', 'torn', 'water damaged',
  'whitening', 'scratched', 'scuffed', 'faded',

  // Language/version mismatches. The current app prices English cards by default.
  'japanese', 'japan', 'jpn', 'jp ', 'korean', 'chinese', 'thai', 'indonesian',
  'french', 'german', 'spanish', 'italian', 'portuguese', 'dutch',
  'foreign', 'non english', 'non-english', 'world championship', 'championship deck',
];

function titleLooksBad(title = '') {
  const t = title.toLowerCase();
  return BLOCKED_TERMS.some((term) => t.includes(term));
}

function extractCardNumber(query = '') {
  const match = query.match(/\b(\d+\/\d+)\b/);
  return match ? match[1].toLowerCase() : null;
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normaliseForTitleMatch(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/pok[eÃ©]mon/g, 'pokemon')
    .replace(/[’`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleHasWord(title = '', word = '') {
  const cleaned = normaliseForTitleMatch(title);
  const target = normaliseForTitleMatch(word);
  if (!target) return true;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(target)}([^a-z0-9]|$)`).test(cleaned);
}

function getFullCollectorNumber(number = '', setTotal = '') {
  const rawNumber = String(number || '').trim();
  const rawTotal = String(setTotal || '').trim();
  if (!rawNumber || rawNumber.includes('/')) return rawNumber;
  if (!/^\d+$/.test(rawNumber) || !/^\d+$/.test(rawTotal)) return rawNumber;
  return `${Number(rawNumber)}/${Number(rawTotal)}`;
}

function getCollectorNumberCandidates(number = '') {
  const raw = String(number || '').trim().toLowerCase();
  if (!raw) return [];

  const candidates = new Set([raw]);
  const full = raw.match(/^0*(\d+)\s*\/\s*0*(\d+)$/);
  if (full) {
    candidates.add(`${Number(full[1])}/${Number(full[2])}`);
    candidates.add(`${full[1]}/${full[2]}`);
    candidates.add(`${full[1].padStart(3, '0')}/${full[2].padStart(3, '0')}`);
    candidates.add(`${full[1].padStart(2, '0')}/${full[2].padStart(2, '0')}`);
  } else {
    const single = raw.match(/^0*(\d+)$/);
    if (single) {
      candidates.add(String(Number(single[1])));
      candidates.add(single[1].padStart(2, '0'));
      candidates.add(single[1].padStart(3, '0'));
    } else if (/^[a-z]+\d+$/i.test(raw)) {
      candidates.add(raw.replace(/\s+/g, ''));
    }
  }

  return [...candidates].filter(Boolean);
}

function titleHasCollectorNumber(title = '', number = '') {
  const cleaned = normaliseForTitleMatch(title);
  const candidates = getCollectorNumberCandidates(number);
  if (!candidates.length) return true;

  return candidates.some((candidate) => {
    if (candidate.includes('/')) {
      const [left, right] = candidate.split('/').map((part) => escapeRegExp(part));
      return new RegExp(`(^|[^0-9])0*${left}\\s*/\\s*0*${right}([^0-9]|$)`).test(cleaned);
    }

    if (/^[a-z]+\d+$/i.test(candidate)) {
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(candidate)}([^a-z0-9]|$)`).test(cleaned);
    }

    const numeric = Number(candidate);
    if (!Number.isFinite(numeric)) return false;
    const token = escapeRegExp(String(numeric));
    return new RegExp(`(^|[^0-9])0*${token}([^0-9]|$)`).test(cleaned);
  });
}

function titleHasCardName(title = '', name = '') {
  const nameWords = normaliseForTitleMatch(name)
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !['ex', 'gx', 'v', 'hp'].includes(word));

  if (!nameWords.length) return true;
  const cleaned = normaliseForTitleMatch(title);
  return nameWords.every((word) => titleHasWord(cleaned, word));
}

function titleHasSetName(title = '', setName = '') {
  const set = normaliseForTitleMatch(setName);
  if (!set) return true;

  const cleaned = normaliseForTitleMatch(title);

  // "Base" is the most dangerous one: Base, Base Set 2, and Legendary Collection
  // are often mixed together in listing titles.
  if (set === 'base' || set === 'base set') {
    if (/\bbase\s*(set\s*)?2\b/.test(cleaned)) return false;
    if (cleaned.includes('legendary collection')) return false;
    return /\bbase(\s+set)?\b/.test(cleaned);
  }

  if (set === 'base set 2') {
    return /\bbase\s*(set\s*)?2\b/.test(cleaned);
  }

  const requiredWords = set
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !['the', 'and', 'set'].includes(word));

  return requiredWords.every((word) => titleHasWord(cleaned, word));
}

function getVariantMismatchReasons(title = '', { name = '', rarity = '' } = {}) {
  const cleaned = normaliseForTitleMatch(title);
  const cleanedWithoutName = normaliseForTitleMatch(
    cleaned.replace(new RegExp(escapeRegExp(normaliseForTitleMatch(name)), 'g'), ' ')
  );
  const rarityLower = String(rarity || '').toLowerCase();
  const reasons = [];

  if (!rarityLower.includes('first') && !rarityLower.includes('1st') && /\b(1st|first)\s+edition\b/.test(cleaned)) {
    reasons.push('UNREQUESTED_FIRST_EDITION');
  }

  if (!rarityLower.includes('reverse') && /\breverse\s+(holo|foil|holographic)\b/.test(cleaned)) {
    reasons.push('UNREQUESTED_REVERSE_HOLO');
  }

  if (!rarityLower.includes('shadowless') && cleaned.includes('shadowless')) {
    reasons.push('UNREQUESTED_SHADOWLESS');
  }

  if (!rarityLower.includes('4th') && !rarityLower.includes('1999-2000') && /\b(4th\s+print|fourth\s+print|1999\s*-\s*2000|uk\s+print)\b/.test(cleaned)) {
    reasons.push('UNREQUESTED_BASE_PRINT_VARIANT');
  }

  if ((rarityLower === 'common' || rarityLower === 'uncommon') && /\b(secret\s+rare|ultra\s+rare|rare\s+holo|holo\s+rare|holographic|rare)\b/.test(cleanedWithoutName)) {
    reasons.push('RARITY_MISMATCH');
  }

  return reasons;
}

function getLanguageMismatchReasons(title = '') {
  const cleaned = normaliseForTitleMatch(title);
  const languagePattern = /\b(japanese|japan|jpn|jp|korean|chinese|thai|indonesian|french|german|spanish|italian|portuguese|dutch|foreign|non\s*-?\s*english)\b/;
  return languagePattern.test(cleaned) ? ['NON_ENGLISH_LISTING'] : [];
}

function getGradingMismatchReasons(title = '', { pricingMode = 'raw', gradingCompany = '', grade = '' } = {}) {
  const cleaned = normaliseForTitleMatch(title);
  const reasons = [];
  const hasSlabTerm = /\b(psa|cgc|bgs|beckett|ace grading|ace graded|sgc|graded|slab|slabbed)\b/.test(cleaned);

  if (pricingMode === 'raw') {
    if (hasSlabTerm) reasons.push('UNREQUESTED_GRADED_SLAB');
    return reasons;
  }

  if (pricingMode !== 'graded') return reasons;

  if (!hasSlabTerm) reasons.push('MISSING_GRADED_SLAB');

  const company = normaliseForTitleMatch(gradingCompany);
  if (company) {
    const companyPatterns = {
      psa: /\bpsa\b/,
      cgc: /\bcgc\b/,
      beckett: /\b(bgs|beckett)\b/,
      bgs: /\b(bgs|beckett)\b/,
      ace: /\bace\b/,
      sgc: /\bsgc\b/,
    };
    const pattern = companyPatterns[company] ?? new RegExp(`\\b${escapeRegExp(company)}\\b`);
    if (!pattern.test(cleaned)) reasons.push(`MISSING_GRADING_COMPANY (${gradingCompany})`);
  }

  const gradeText = String(grade || '').trim();
  if (gradeText) {
    const escaped = escapeRegExp(gradeText.replace(/\.0$/, ''));
    const gradePattern = new RegExp(`\\b(${escaped}|${escaped}\\.0)\\b`);
    if (!gradePattern.test(cleaned)) reasons.push(`MISSING_GRADE (${gradeText})`);
  }

  return reasons;
}

function getAllowedConditionTerms(condition = '') {
  const cleaned = normaliseForTitleMatch(condition);
  if (cleaned.includes('damaged')) {
    return ['damaged', 'poor condition', 'creased', 'crease', 'bent', 'inked', 'marked', 'written on', 'torn', 'water damaged'];
  }
  if (cleaned.includes('heavily') || cleaned === 'hp') {
    return ['heavily played', 'heavy play', 'creased', 'crease', 'bent', 'whitening', 'scratched', 'scuffed'];
  }
  if (cleaned.includes('moderately') || cleaned === 'mp') {
    return ['moderate play', 'moderately played', 'whitening', 'scratched', 'scuffed'];
  }
  return [];
}

function getSealedProductSubtype(query = '', explicitSubtype = '') {
  const explicit = normaliseForTitleMatch(explicitSubtype);
  if (explicit && explicit !== 'sealed product' && explicit !== 'sealed_product') {
    return explicit.replace(/\s+/g, '_');
  }

  const cleaned = normaliseForTitleMatch(query);
  if (/\b(elite trainer box|elite trainer|etb)\b/.test(cleaned)) return 'elite_trainer_box';
  if (/\bbooster\s+box\b/.test(cleaned)) return 'booster_box';
  if (/\bsleeved\s+booster\s+pack\b/.test(cleaned)) return 'sleeved_booster_pack';
  if (/\bbooster\s+bundle\b/.test(cleaned)) return 'booster_bundle';
  if (/\bbooster\s+pack\b/.test(cleaned)) return 'booster_pack';
  if (/\b(ultra premium collection|upc)\b/.test(cleaned)) return 'ultra_premium_collection';
  if (/\b(collection|collector|premium collection|box)\b/.test(cleaned)) return 'collection_bundle';
  return '';
}

function getSealedProductMismatchReasons(title = '', query = '', productSubtype = '') {
  const cleaned = normaliseForTitleMatch(title);
  const subtype = getSealedProductSubtype(query, productSubtype);
  const reasons = [];
  if (/\bempty\s+(box|etb|elite trainer box)\b/.test(cleaned)) reasons.push('EMPTY_PRODUCT');
  if (/\b(code|codes|digital|online)\b/.test(cleaned)) reasons.push('DIGITAL_CODE_ONLY');
  if (/\b(single card|singles|individual card)\b/.test(cleaned)) reasons.push('SINGLE_CARD_LISTING');
  if (/\b(case|display case)\b/.test(cleaned) && !/\bbooster\s+box\b/.test(cleaned)) reasons.push('DISPLAY_CASE_ACCESSORY');

  if (/\b(case|sealed case|display case|master case)\b/.test(cleaned)) reasons.push('SEALED_CASE_OR_DISPLAY');
  if (/\b(lot|bundle|joblot|job lot|x\s*\d+|\d+\s*x|pack of|set of)\b/.test(cleaned) && subtype !== 'booster_bundle') reasons.push('MULTI_ITEM_OR_BUNDLE');

  if (subtype === 'elite_trainer_box') {
    if (!/\b(etb|elite trainer box|elite trainer)\b/.test(cleaned)) reasons.push('MISSING_ETB_TERMS');
    if (/\b(ultra premium collection|upc|collection box|poster collection|binder collection|premium collection|booster box|booster bundle|booster pack|display)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_ETB');
  }

  if (subtype === 'booster_box') {
    if (!/\bbooster\s+box\b/.test(cleaned)) reasons.push('MISSING_BOOSTER_BOX_TERMS');
    if (/\b(etb|elite trainer|booster bundle|collection box|upc|ultra premium collection)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_BOOSTER_BOX');
  }

  if (subtype === 'booster_bundle') {
    if (!/\bbooster\s+bundle\b/.test(cleaned)) reasons.push('MISSING_BOOSTER_BUNDLE_TERMS');
    if (/\b(etb|elite trainer|booster box|collection box|upc|ultra premium collection)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_BOOSTER_BUNDLE');
  }

  if (subtype === 'booster_pack') {
    if (!/\bbooster\s+pack\b/.test(cleaned)) reasons.push('MISSING_BOOSTER_PACK_TERMS');
    if (/\b(etb|elite trainer|booster box|booster bundle|sleeved|collection box|upc|ultra premium collection)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_BOOSTER_PACK');
  }

  if (subtype === 'sleeved_booster_pack') {
    if (!/\bsleeved\s+booster\s+pack\b/.test(cleaned)) reasons.push('MISSING_SLEEVED_BOOSTER_PACK_TERMS');
    if (/\b(etb|elite trainer|booster box|booster bundle|collection box|upc|ultra premium collection)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_SLEEVED_PACK');
  }

  if (subtype === 'ultra_premium_collection') {
    if (!/\b(ultra premium collection|upc)\b/.test(cleaned)) reasons.push('MISSING_UPC_TERMS');
    if (/\b(etb|elite trainer|booster box|booster bundle)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_UPC');
  }

  if (subtype === 'collection_bundle') {
    if (!/\b(collection|box|premium collection)\b/.test(cleaned)) reasons.push('MISSING_COLLECTION_TERMS');
    if (/\b(etb|elite trainer|booster box|booster bundle)\b/.test(cleaned)) reasons.push('WRONG_SEALED_PRODUCT_FOR_COLLECTION');
  }

  return reasons;
}

function getStructuredTitleRejectionReasons(title = '', query = '', options = {}) {
  const reasons = [];
  const {
    name = '',
    setName = '',
    number = '',
    setTotal = '',
    rarity = '',
    productType = 'card',
    productSubtype = '',
    pricingMode = 'raw',
    condition = '',
    gradingCompany = '',
    grade = '',
  } = options;
  const collectorNumber = getFullCollectorNumber(number, setTotal);

  if (productType === 'sealed' || productType === 'accessory') {
    if (!titleLooksGoodForQuery(title, query)) {
      reasons.push('MISSING_QUERY_KEYWORDS');
    }
    if (productType === 'sealed') {
      reasons.push(...getSealedProductMismatchReasons(title, query, productSubtype));
    }
    return reasons;
  }

  if (titleLooksBad(title)) {
    const cleaned = title.toLowerCase();
    const allowedConditionTerms = getAllowedConditionTerms(condition);
    const matched = BLOCKED_TERMS.filter((term) => cleaned.includes(term) && !allowedConditionTerms.includes(term));
    if (matched.length) reasons.push(`BLOCKED_TERMS: [${matched.join(', ')}]`);
  }

  if (!titleLooksGoodForQuery(title, query)) {
    reasons.push('MISSING_QUERY_KEYWORDS');
  }

  if (name && !titleHasCardName(title, name)) {
    reasons.push(`MISSING_CARD_NAME (${name})`);
  }

  if (setName && !titleHasSetName(title, setName)) {
    reasons.push(`MISSING_OR_CONFLICTING_SET (${setName})`);
  }

  if (collectorNumber && !titleHasCollectorNumber(title, collectorNumber)) {
    reasons.push(`MISSING_COLLECTOR_NUMBER (${collectorNumber})`);
  }

  reasons.push(...getLanguageMismatchReasons(title));
  reasons.push(...getVariantMismatchReasons(title, { name, rarity }));
  reasons.push(...getGradingMismatchReasons(title, { pricingMode, gradingCompany, grade, condition }));

  return reasons;
}

function getImportantWords(query = '') {
  const stopWords = new Set([
    'pokemon', 'pokémon', 'card', 'cards', 
    'holo', 'foil', 'perfect', 'order', 'set', 'the', 'and', 'for',
    'near', 'mint', 'nm', 'lp', 'mp', 'hp', 'ex', 'nm/m',
    'holographic', 'reverse', '1st', 'first', 'edition',
    'pokemon card', 'tcg', 'pokemontcg',
    'ultra', 'secret', 'rare', 'amazing', 'rare',
    'vmax', 'vstar', 'vunion', 'ex', 'gx', 'prism',
    'star', 'Radiant', 'illustrator', 'special',
  ]);

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'é]/g, ''))
    .filter((w) => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));

  return words;
}

function titleLooksGoodForQuery(title = '', query = '') {
  const t = title.toLowerCase();
  const cardNumber = extractCardNumber(query);
  const importantWords = getImportantWords(query);

  if (importantWords.length > 0) {
    const allWordsPresent = importantWords.every((word) => t.includes(word));
    if (!allWordsPresent) return false;
  }

  if (cardNumber && !t.includes(cardNumber)) return false;

  return true;
}

function numberFromPrice(value) {
  const num = parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

function summarisePrices(prices) {
  if (!prices.length) {
    return { low: null, average: null, high: null, count: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);

  let trimmed;
  if (sorted.length >= 10) {
    const cut = Math.max(1, Math.floor(sorted.length * 0.15));
    trimmed = sorted.slice(cut, sorted.length - cut);
  } else if (sorted.length >= 6) {
    trimmed = sorted.slice(1, -1);
  } else {
    trimmed = sorted;
  }

  // Median of the trimmed set — not pulled up by outliers
  const mid = Math.floor(trimmed.length / 2);
  const median = trimmed.length % 2 !== 0
    ? trimmed[mid]
    : (trimmed[mid - 1] + trimmed[mid]) / 2;

  return {
    low: Number(trimmed[0].toFixed(2)),
    average: Number(median.toFixed(2)),
    high: Number(trimmed[trimmed.length - 1].toFixed(2)),
    count: trimmed.length,
  };
}

function buildCardQuery({ name = '', setName = '', number = '', setTotal = '', rarity = '' }) {
  const parts = [name];

  // Add set name if available
  if (setName) {
    parts.push(setName);
  }

  // Add full collector number when we know the printed set total (e.g. "46/102").
  const collectorNumber = getFullCollectorNumber(number, setTotal);
  if (collectorNumber) {
    parts.push(collectorNumber);
  }

  // Add rarity hints to help distinguish holo vs non-holo
  if (rarity) {
    const rarityLower = rarity.toLowerCase();
    if (rarityLower.includes('holo') || rarityLower === 'ultra rare' || rarityLower === 'secret rare') {
      parts.push('holo');
      parts.push('holographic');
    }
    if (rarityLower.includes('reverse')) {
      parts.push('reverse holo');
    }
    if (rarityLower.includes('first edition') || rarityLower.includes('1st')) {
      parts.push('1st edition');
    }
  }

  parts.push('pokemon card');

  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

// Build better fallback query with set hints when primary fails
function buildFallbackQuery({ name = '', setName = '', number = '', setTotal = '', rarity = '' }) {
  const parts = [name];
  
  // Prioritize set name in fallback to maintain specificity
  if (setName) {
    parts.push(setName);
  }
  
  // Always add collector number if available (critical for uniqueness)
  const collectorNumber = getFullCollectorNumber(number, setTotal);
  if (collectorNumber) {
    parts.push(collectorNumber);
  }
  
  // Add rarity hints for better rare card matching
  if (rarity) {
    const rarityLower = rarity.toLowerCase();
    if (rarityLower.includes('holo') || rarityLower === 'ultra rare' || rarityLower === 'secret rare') {
      parts.push('holo');
      parts.push('holographic');
    }
    if (rarityLower.includes('reverse')) {
      parts.push('reverse holo');
    }
    if (rarityLower.includes('first edition') || rarityLower.includes('1st')) {
      parts.push('1st edition');
    }
  } else if (!setName && !number) {
    // Only add holo hints if nothing else to go on
    parts.push('holo');
    parts.push('holographic');
  }
  
  parts.push('pokemon card');
  
  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

// ===============================
// PRICE RESULT CACHE (2-hour TTL)
// ===============================

const priceCache = new Map();
const PRICE_FILTER_VERSION = 5;
const PRICE_CACHE_TTL = 2 * 60 * 60 * 1000;

// In-flight dedupe so concurrent identical queries share one upstream call
const inflightPriceRequests = new Map();

// Short failure cache to avoid immediate repeat hits after upstream throttling
const failureCache = new Map();
const FAILURE_CACHE_TTL = 60 * 1000;

// Global cooldown after eBay rate limit response
let ebayRateLimitCooldownUntil = 0;
const EBAY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

function getCachedPrice(key) {
  const entry = priceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { priceCache.delete(key); return null; }
  return entry.data;
}

function setCachedPrice(key, data) {
  priceCache.set(key, { data, expiresAt: Date.now() + PRICE_CACHE_TTL });
}

function getCachedFailure(key) {
  const entry = failureCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    failureCache.delete(key);
    return null;
  }
  return entry.error;
}

function setCachedFailure(key, error) {
  failureCache.set(key, { error, expiresAt: Date.now() + FAILURE_CACHE_TTL });
}

function normalizePriceKey({
  query = '',
  name = '',
  setName = '',
  number = '',
  setTotal = '',
  rarity = '',
  productType = 'card',
  pricingMode = 'raw',
  condition = '',
  gradingCompany = '',
  grade = '',
}) {
  return JSON.stringify({
    filterVersion: PRICE_FILTER_VERSION,
    query: String(query || '').trim().toLowerCase(),
    name: String(name || '').trim().toLowerCase(),
    setName: String(setName || '').trim().toLowerCase(),
    number: String(number || '').trim().toLowerCase(),
    setTotal: String(setTotal || '').trim().toLowerCase(),
    rarity: String(rarity || '').trim().toLowerCase(),
    productType: String(productType || 'card').trim().toLowerCase(),
    pricingMode: String(pricingMode || 'raw').trim().toLowerCase(),
    condition: String(condition || '').trim().toLowerCase(),
    gradingCompany: String(gradingCompany || '').trim().toLowerCase(),
    grade: String(grade || '').trim().toLowerCase(),
  });
}

function isEbayRateLimitErrorMessage(message = '') {
  const m = String(message || '').toLowerCase();
  return m.includes('errorid') && m.includes('10001') && m.includes('ratelimiter');
}

// ===============================
// TOKEN CACHE
// ===============================

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('Missing eBay credentials');
  }

  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: EBAY_OAUTH_SCOPES.join(' '),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Token response did not include access_token');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);

  return cachedToken;
}

// ===============================
// CORE EBAY SEARCH (Browse API)
// NOTE: Browse API does not provide exact equivalent of Finding's completed/sold endpoint.
// We approximate market pricing from current listing summaries (buyingOptions FIXED_PRICE/AUCTION).
// ===============================

function getBrowseLimitErrorMessage(status, text) {
  const raw = String(text || '');
  if (status === 429) return `Browse API rate limited (429): ${raw}`;
  if (status === 403) return `Browse API forbidden (403): ${raw}`;
  return `Browse API search failed (${status}): ${raw}`;
}

function parseSoldPriceValue(rawValue) {
  if (rawValue == null) return null;
  const cleaned = String(rawValue).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeSerpApiSoldItems(data) {
  const candidates = [
    ...(Array.isArray(data?.organic_results) ? data.organic_results : []),
    ...(Array.isArray(data?.shopping_results) ? data.shopping_results : []),
    ...(Array.isArray(data?.search_results) ? data.search_results : []),
    ...(Array.isArray(data?.results) ? data.results : []),
    ...(Array.isArray(data?.items) ? data.items : []),
  ];

  return candidates
    .map((item) => {
      const title = String(item?.title || item?.name || '').trim();
      const priceValue =
        parseSoldPriceValue(item?.price?.extracted) ??
        parseSoldPriceValue(item?.price?.from?.extracted) ??
        parseSoldPriceValue(item?.price?.raw) ??
        parseSoldPriceValue(item?.extracted_price) ??
        parseSoldPriceValue(item?.price?.value);

      return {
        title,
        price: { value: priceValue },
      };
    })
    .filter((item) => item.title && item.price.value !== null);
}

async function searchEbaySoldListingsSerpApi(query) {
  if (!SERPAPI_API_KEY) {
    throw new Error('Missing SERPAPI_API_KEY');
  }

  const marketplace = String(EBAY_MARKETPLACE_ID || 'EBAY_GB').toLowerCase();
  const params = new URLSearchParams({
    engine: SERPAPI_ENGINE,
    _nkw: query,
    show_only: 'Sold',
    sacat: '0',
    api_key: SERPAPI_API_KEY,
    ebay_domain: marketplace === 'ebay_us' ? 'ebay.com' : 'ebay.co.uk',
  });
  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  const res = await fetchWithTimeout(
    serpUrl,
    { headers: { Accept: 'application/json' } },
    EBAY_SOLD_SEARCH_TIMEOUT_MS,
    'SerpApi sold search'
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi sold search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log('🔍 SerpApi top-level keys:', Object.keys(data));

  const normalized = normalizeSerpApiSoldItems(data);

  if (!normalized.length) {
    throw new Error('SerpApi returned no sold listings');
  }

  return normalized;
}

async function searchEbayBrowseListings(query) {
  const now = Date.now();
  if (now < ebayRateLimitCooldownUntil) {
    const secs = Math.ceil((ebayRateLimitCooldownUntil - now) / 1000);
    throw new Error(`eBay rate-limit cooldown active (${secs}s remaining)`);
  }

  const token = await getToken();
  const marketplace = EBAY_MARKETPLACE_ID;
  const limit = 50;

  const url =
    'https://api.ebay.com/buy/browse/v1/item_summary/search' +
    `?q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    '&sort=price';

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': marketplace,
      },
    },
    EBAY_BROWSE_SEARCH_TIMEOUT_MS,
    'eBay Browse search'
  );

  if (!res.ok) {
    const text = await res.text();
    const message = getBrowseLimitErrorMessage(res.status, text);
    if (res.status === 429 || message.toLowerCase().includes('ratelimit')) {
      ebayRateLimitCooldownUntil = Date.now() + EBAY_RATE_LIMIT_COOLDOWN_MS;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];

  return items
    .filter((item) => {
      const options = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
      return options.includes('FIXED_PRICE') || options.includes('AUCTION');
    })
    .map((item) => ({
      title: item?.title ?? '',
      price: { value: item?.price?.value ?? item?.currentBidPrice?.value ?? null },
    }));
}

function filterItems(items, query, options = {}) {
  return items.filter((item) => {
    const title = item.title || '';
    const price = numberFromPrice(item.price?.value);

    if (!price) return false;
    if (price < 0.5) return false;
    if (price > 5000) return false;
    if (getStructuredTitleRejectionReasons(title, query, options).length > 0) return false;

    return true;
  });
}

// Extended signature to pass all card details to fallback
async function fetchEbaySummary(query, options = {}) {
  const {
    name = '',
    setName = '',
    number = '',
    setTotal = '',
    rarity = '',
    productType = 'card',
    productSubtype = '',
    pricingMode = 'raw',
    condition = '',
    gradingCompany = '',
    grade = '',
  } = options;
  const cardName = name || query.split(' ')[0];

  const cacheKey = normalizePriceKey({
    query,
    name,
    setName,
    number,
    setTotal,
    rarity,
    productType,
    productSubtype,
    pricingMode,
    condition,
    gradingCompany,
    grade,
  });

  const cached = getCachedPrice(cacheKey);
  if (cached) {
    console.log(`✅ Cache hit for "${query}"`);
    return cached;
  }

  const cachedFailure = getCachedFailure(cacheKey);
  if (cachedFailure) {
    throw new Error(cachedFailure);
  }

  if (inflightPriceRequests.has(cacheKey)) {
    return inflightPriceRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const startedAt = Date.now();
      let rawItems = [];
      let usedSoldProvider = false;
      let soldProviderError = null;

      try {
        rawItems = await searchEbaySoldListingsSerpApi(query);
        usedSoldProvider = true;
      } catch (soldError) {
        soldProviderError = getErrorMessage(soldError);
        console.log(`⚠️ Sold-provider failed for "${query}" (${getErrorMessage(soldError)}). Falling back to Browse listings.`);
        rawItems = await searchEbayBrowseListings(query);
      }
      let cleaned = filterItems(rawItems, query, {
        name,
        setName,
        number,
        setTotal,
        rarity,
        productType,
        productSubtype,
        pricingMode,
        condition,
        gradingCompany,
        grade,
      });

      let usedFallback = false;
      let fallbackQuery = '';
      let acceptedSourceItems = rawItems;

      if (cleaned.length === 0 && cardName && productType === 'card') {
        fallbackQuery = buildFallbackQuery({ name: cardName, setName, number, setTotal, rarity });
        console.log(`⚠️ No results for "${query}" — retrying with "${fallbackQuery}"`);

        let fallbackItems = [];
        try {
          fallbackItems = await searchEbaySoldListingsSerpApi(fallbackQuery);
          usedSoldProvider = true;
        } catch (soldFallbackError) {
          soldProviderError = getErrorMessage(soldFallbackError);
          console.log(`⚠️ Sold-provider fallback failed for "${fallbackQuery}" (${getErrorMessage(soldFallbackError)}). Falling back to Browse listings.`);
          fallbackItems = await searchEbayBrowseListings(fallbackQuery);
        }
        cleaned = filterItems(fallbackItems, fallbackQuery, {
          name: cardName,
          setName,
          number,
          setTotal,
          rarity,
          productType,
          productSubtype,
          pricingMode,
          condition,
          gradingCompany,
          grade,
        });
        acceptedSourceItems = fallbackItems;
        usedFallback = true;
      }

      const prices = cleaned
        .map((item) => numberFromPrice(item.price?.value))
        .filter((p) => p !== null);

      const summary = summarisePrices(prices);

      const result = {
        marketplace: EBAY_MARKETPLACE_ID,
        query: usedFallback ? fallbackQuery : query,
        originalQuery: query,
        usedFallback,
        low: summary.low,
        average: summary.average,
        high: summary.high,
        count: summary.count,
        rawCount: rawItems.length,
        soldDataSource: usedSoldProvider ? 'serpapi' : 'browse',
        soldProviderError,
        elapsedMs: Date.now() - startedAt,
        sampleTitles: rawItems.slice(0, 10).map((item) => ({
          title: item.title,
          price: item.price?.value,
        })),
        acceptedTitles: cleaned.slice(0, 10).map((item) => ({
          title: item.title,
          price: item.price?.value,
        })),
        rejectedTitles: acceptedSourceItems
          .filter((item) => !cleaned.includes(item))
          .slice(0, 10)
          .map((item) => ({
            title: item.title,
            price: item.price?.value,
            reasons: getStructuredTitleRejectionReasons(item.title || '', usedFallback ? fallbackQuery : query, {
              name: cardName,
              setName,
              number,
              setTotal,
              rarity,
              productType,
              productSubtype,
              pricingMode,
              condition,
              gradingCompany,
              grade,
            }),
          })),
      };

      setCachedPrice(cacheKey, result);
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      if (isEbayRateLimitErrorMessage(message) || message.includes('cooldown active')) {
        setCachedFailure(cacheKey, message);
      }
      throw error;
    } finally {
      inflightPriceRequests.delete(cacheKey);
    }
  })();

  inflightPriceRequests.set(cacheKey, promise);
  return promise;
}

// ===============================
// ROUTES
// ===============================

app.get('/debug-serpapi', async (req, res) => {
  const query = String(req.query.q || 'Charizard base set').trim();
  if (!SERPAPI_API_KEY) return res.status(500).json({ error: 'Missing SERPAPI_API_KEY' });

  const marketplace = String(EBAY_MARKETPLACE_ID || 'EBAY_GB').toLowerCase();
  const params = new URLSearchParams({
    engine: SERPAPI_ENGINE,
    _nkw: query,
    show_only: 'Sold',
    sacat: '0',
    no_cache: '1',
    api_key: SERPAPI_API_KEY,
    ebay_domain: marketplace === 'ebay_us' ? 'ebay.com' : 'ebay.co.uk',
  });
  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  const serpRes = await fetch(serpUrl, { headers: { Accept: 'application/json' } });
  const data = await serpRes.json();
  return res.json({ topLevelKeys: Object.keys(data), searchParams: data.search_parameters, ebayUrl: data.search_metadata?.ebay_url, sampleTitles: (data.organic_results || []).slice(0, 5).map(r => ({ title: r.title, price: r.price })) });
});

app.get('/', (req, res) => {
  res.send('Stackr API is running');
});

app.get('/debug-env', (req, res) => {
  res.json({
    ok: true,
    hasEbayClientId: Boolean(EBAY_CLIENT_ID),
    hasEbayClientSecret: Boolean(EBAY_CLIENT_SECRET),
    hasXimilarToken: Boolean(XIMILAR_API_TOKEN),
    hasTcgApiKey: Boolean(POKEMON_TCG_API_KEY),
    hasPokeWalletKey: Boolean(POKEWALLET_API_KEY),
    hasGiblKey: Boolean(process.env.GIBLTCG_API_KEY || process.env.GIBL_API_KEY),
    marketplace: EBAY_MARKETPLACE_ID,
  });
});

app.get('/api/pokewallet/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const page = Math.max(Number(req.query.page || 1), 1);

    if (q.length < 2) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const params = new URLSearchParams({
      q,
      limit: String(limit),
      page: String(page),
    });

    const response = await fetchWithTimeout(
      `${POKEWALLET_API_BASE_URL.replace(/\/$/, '')}/search?${params.toString()}`,
      { headers: getPokeWalletHeaders() },
      6000,
      'PokeWallet search'
    );
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'PokeWallet search failed',
        detail: data?.message ?? data?.error ?? text.slice(0, 240),
      });
    }

    return res.json({
      query: data?.query ?? q,
      results: Array.isArray(data?.results) ? data.results.map(normalizePokeWalletCard) : [],
      pagination: data?.pagination ?? null,
      metadata: data?.metadata ?? null,
      rateLimit: {
        hour: response.headers.get('x-ratelimit-remaining-hour'),
        day: response.headers.get('x-ratelimit-remaining-day'),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'PokeWallet search failed',
      detail: getErrorMessage(error),
    });
  }
});

app.get('/api/pokewallet/images/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const size = String(req.query.size || 'high').trim();
    if (!id) return res.status(400).json({ error: 'Missing card id' });

    const response = await fetchWithTimeout(
      `${POKEWALLET_API_BASE_URL.replace(/\/$/, '')}/images/${encodeURIComponent(id)}?size=${encodeURIComponent(size)}`,
      { headers: getPokeWalletHeaders() },
      7000,
      'PokeWallet image'
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'PokeWallet image failed',
        detail: text.slice(0, 240),
      });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      error: 'PokeWallet image failed',
      detail: getErrorMessage(error),
    });
  }
});

app.get('/ebay-rate-limits', async (_req, res) => {
  try {
    const token = await getToken();
    const response = await fetch('https://api.ebay.com/developer/analytics/v1_beta/rate_limit/', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'eBay rate limit request failed',
        status: response.status,
        detail: data,
      });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/test-ebay-token', async (req, res) => {
  try {
    const token = await getToken();
    return res.json({ ok: true, tokenPreview: `${token.slice(0, 10)}...` });
  } catch (error) {
    return res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

// Simple price endpoint
app.get('/price', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const productType = String(req.query.productType || 'card').trim();
    const productSubtype = String(req.query.productSubtype || '').trim();
    const pricingMode = String(req.query.pricingMode || 'raw').trim();
    const condition = String(req.query.condition || '').trim();
    const gradingCompany = String(req.query.gradingCompany || '').trim();
    const grade = String(req.query.grade || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    // Extract card name from query for fallback
    const cardName = query.split(' ')[0];
    
    // Try to parse additional info from query string for better fallback
    const parts = query.split(' ');
    const setName = parts.length > 1 ? parts.find(p => /^(base|xy|swsh|sv|sm|bw|dp|hgss)/i.test(p)) || '' : '';
    const number = parts.length > 1 ? parts.find(p => /^\d+\/\d+$/.test(p)) || '' : '';
    const setTotal = number.includes('/') ? number.split('/')[1] : '';
    
    const summary = await fetchEbaySummary(query, {
      name: productType === 'sealed' ? '' : cardName,
      setName,
      number,
      setTotal,
      productType,
      productSubtype,
      pricingMode,
      condition,
      gradingCompany,
      grade,
    });
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay price',
      detail: getErrorMessage(error),
    });
  }
});

// Structured price endpoint
app.get('/api/price/ebay', async (req, res) => {
  try {
    const directQuery = String(req.query.q || req.query.query || '').trim();
    const cardId = String(req.query.cardId || '').trim();
    let name = String(req.query.name || '').trim();
    let setName = String(req.query.setName || '').trim();
    let number = String(req.query.number || '').trim();
    let setTotal = String(req.query.setTotal || req.query.printedTotal || '').trim();
    let rarity = String(req.query.rarity || '').trim();
    const productType = String(req.query.productType || (directQuery ? 'sealed' : 'card')).trim();
    const productSubtype = String(req.query.productSubtype || '').trim();
    const pricingMode = String(req.query.pricingMode || 'raw').trim();
    const condition = String(req.query.condition || '').trim();
    const gradingCompany = String(req.query.gradingCompany || '').trim();
    const grade = String(req.query.grade || '').trim();

    if (!name && !directQuery) {
      return res.status(400).json({ error: 'Missing card name' });
    }

    if (directQuery) {
      const summary = await fetchEbaySummary(directQuery, {
        productType,
        productSubtype,
        pricingMode,
        condition,
        gradingCompany,
        grade,
      });

      return res.json({
        query: directQuery,
        productType,
        productSubtype,
        pricingMode,
        condition,
        gradingCompany,
        grade,
        ...summary,
      });
    }

    if (cardId && (!setTotal || !setName || !number || !rarity)) {
      const { data: cardRow, error: cardError } = await supabase
        .from('pokemon_cards')
        .select('name, number, rarity, raw_data')
        .eq('id', cardId)
        .maybeSingle();

      if (cardError) {
        console.log('Price card lookup failed:', cardError.message);
      }

      if (cardRow) {
        name ||= cardRow.name ?? '';
        number ||= cardRow.number ?? '';
        rarity ||= cardRow.rarity ?? '';
        setName ||= cardRow.raw_data?.set?.name ?? '';
        setTotal ||= String(cardRow.raw_data?.set?.printedTotal ?? cardRow.raw_data?.set?.total ?? '');
      }
    }

    // Build primary query with rarity hints for better matching
    const queryParts = [buildCardQuery({ name, setName, number, setTotal, rarity })];
    if (pricingMode === 'graded') {
      if (gradingCompany) queryParts.push(gradingCompany);
      if (grade) queryParts.push(grade);
      queryParts.push('graded slab');
    } else if (condition) {
      queryParts.push(condition);
    }
    const query = queryParts.filter(Boolean).join(' ');
    
    // Pass full card details for better fallback matching
    const summary = await fetchEbaySummary(query, {
      name,
      setName,
      number,
      setTotal,
      rarity,
      productType,
      productSubtype,
      pricingMode,
      condition,
      gradingCompany,
      grade,
    });

    return res.json({
      cardId,
      name,
      setName,
      number,
      setTotal,
      collectorNumber: getFullCollectorNumber(number, setTotal),
      rarity,
      productType,
      pricingMode,
      condition,
      gradingCompany,
      grade,
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay pricing',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// DEBUG: PRICE FILTER INSPECTOR
// ===============================

app.get('/price/debug', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    const setName = String(req.query.set || '').trim();
    const number = String(req.query.number || '').trim();
    const setTotal = String(req.query.setTotal || req.query.printedTotal || '').trim();
    const rarity = String(req.query.rarity || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Missing ?name= param' });
    }

    const primaryQuery = buildCardQuery({ name, setName, number, setTotal, rarity });
    const fallbackQuery = buildFallbackQuery({ name, setName, number, setTotal, rarity });

    const [primaryRaw, fallbackRaw] = await Promise.all([
      searchEbayBrowseListings(primaryQuery),
      searchEbayBrowseListings(fallbackQuery),
    ]);

    function analyseItems(items, query, options = {}) {
      return items.map((item) => {
        const title = item.title || '';
        const price = numberFromPrice(item.price?.value);

        const reasons = [];

        if (!price) reasons.push('NO_PRICE');
        if (price !== null && price < 0.5) reasons.push(`PRICE_TOO_LOW (£${price})`);
        if (price !== null && price > 5000) reasons.push(`PRICE_TOO_HIGH (£${price})`);

        reasons.push(...getStructuredTitleRejectionReasons(title, query, options));

        const accepted = reasons.length === 0;

        return {
          title,
          price: item.price?.value ?? null,
          accepted,
          reasons: accepted ? ['✅ ACCEPTED'] : reasons,
        };
      });
    }

    const primaryAnalysis = analyseItems(primaryRaw, primaryQuery, { name, setName, number, setTotal, rarity });
    const fallbackAnalysis = analyseItems(fallbackRaw, fallbackQuery, { name, setName, number, setTotal, rarity });

    const primaryAccepted = primaryAnalysis.filter((i) => i.accepted);
    const fallbackAccepted = fallbackAnalysis.filter((i) => i.accepted);

    const primaryPrices = primaryAccepted.map((i) => numberFromPrice(i.price)).filter(Boolean);
    const fallbackPrices = fallbackAccepted.map((i) => numberFromPrice(i.price)).filter(Boolean);

    return res.json({
      queries: { primary: primaryQuery, fallback: fallbackQuery },
      parsed: {
        importantWords: getImportantWords(primaryQuery),
        cardNumber: extractCardNumber(primaryQuery) ?? 'none found',
      },
      primary: {
        totalFromEbay: primaryRaw.length,
        accepted: primaryAccepted.length,
        rejected: primaryRaw.length - primaryAccepted.length,
        priceSummary: summarisePrices(primaryPrices),
        items: primaryAnalysis,
      },
      fallback: {
        totalFromEbay: fallbackRaw.length,
        accepted: fallbackAccepted.length,
        rejected: fallbackRaw.length - fallbackAccepted.length,
        priceSummary: summarisePrices(fallbackPrices),
        items: fallbackAnalysis,
      },
      blockedTermsActive: BLOCKED_TERMS,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Debug failed',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// TCG CARD SEARCH
// Used by the scan feature
// ===============================

app.get('/api/search/tcg', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    const number = String(req.query.number || '').trim();
    const setTotal = String(req.query.setTotal || '').trim();
    const setName = String(req.query.setName || '').trim();
    const setId = String(req.query.setId || '').trim();
    const strictSet = String(req.query.strictSet || '').trim() === '1';

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const headers = POKEMON_TCG_API_KEY
      ? { 'X-Api-Key': POKEMON_TCG_API_KEY }
      : {};

    // Build primary query
    let q = `name:"${name}"`;
    if (number) q += ` number:${number}`;
    if (setId) q += ` set.id:${setId}`;
    if (setName) q += ` set.name:"${setName}"`;

    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20&orderBy=-set.releaseDate`;

    console.log(`🔍 Primary query: ${q}`);
    console.log(`🔍 URL: ${url}`);

    const response = await fetch(url, { headers });
    let cards = [];

    if (response.ok) {
      const data = await response.json();
      cards = data.data ?? [];
      console.log(`✅ Primary found: ${cards.length} cards`);
      if (cards.length > 0) {
        console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
      }
    } else {
      console.log(`❌ Primary failed: ${response.status}`);
    }

    // Fallback 1 — drop setId, keep number. Disabled for official binder scans.
    if (cards.length === 0 && !strictSet && (setId || setName) && number) {
      console.log('⚠️ Fallback 1 — name + number only');
      const q2 = `name:"${name}" number:${number}`;
      const res2 = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q2)}&pageSize=20&orderBy=-set.releaseDate`,
        { headers }
      );
      if (res2.ok) {
        const data2 = await res2.json();
        cards = data2.data ?? [];
        console.log(`✅ Fallback 1 found: ${cards.length} cards`);
        if (cards.length > 0) {
          console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
        }
      }
    }

    // Fallback 2 — name only, but keep the selected set locked when requested.
    if (cards.length === 0) {
      console.log('⚠️ Fallback 2 — name only');
      let q3 = `name:"${name}"`;
      if (strictSet && setId) q3 += ` set.id:${setId}`;
      if (strictSet && setName) q3 += ` set.name:"${setName}"`;
      const res3 = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q3)}&pageSize=20&orderBy=-set.releaseDate`,
        { headers }
      );
      if (res3.ok) {
        const data3 = await res3.json();
        cards = data3.data ?? [];
        console.log(`✅ Fallback 2 found: ${cards.length} cards`);
        if (cards.length > 0) {
          console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
        }
      }
    }

    let formatted = cards.map((card) => ({
      id: card.id,
      name: card.name,
      number: card.number,
      set_id: card.set?.id,
      set_name: card.set?.name,
      set_printed_total: card.set?.printedTotal ?? card.set?.total ?? null,
      series: card.set?.series,
      rarity: card.rarity,
      image_small: card.images?.small,
      image_large: card.images?.large,
      release_date: card.set?.releaseDate,
    }));

    if (strictSet && setId) {
      formatted = formatted.filter((card) => card.set_id === setId);
    }

    if (setTotal) {
      const totalNumber = Number(setTotal);
      if (Number.isFinite(totalNumber)) {
        const totalMatches = formatted.filter((card) => Number(card.set_printed_total) === totalNumber);
        if (totalMatches.length > 0) formatted = totalMatches;
      }
    }

    console.log(`📦 Returning ${formatted.length} cards`);

    return res.json({ cards: formatted, total: formatted.length });
  } catch (error) {
    return res.status(500).json({
      error: 'TCG search failed',
      detail: getErrorMessage(error),
    });
  }
});

app.get('/api/tcg/verify', async (req, res) => {
  try {
    const cardId = String(req.query.cardId || '').trim();
    const name = String(req.query.name || '').trim();
    const number = String(req.query.number || '').trim();
    const setId = String(req.query.setId || '').trim();

    if (!cardId && (!name || !number || !setId)) {
      return res.status(400).json({ error: 'Pass cardId, or name + number + setId' });
    }

    const headers = POKEMON_TCG_API_KEY
      ? { 'X-Api-Key': POKEMON_TCG_API_KEY }
      : {};

    const dbQuery = cardId
      ? supabase.from('pokemon_cards').select('id,name,number,set_id,rarity,image_small,raw_data').eq('id', cardId).maybeSingle()
      : supabase
        .from('pokemon_cards')
        .select('id,name,number,set_id,rarity,image_small,raw_data')
        .eq('set_id', setId)
        .eq('number', number)
        .ilike('name', name)
        .maybeSingle();

    const { data: dbCard, error: dbError } = await dbQuery;
    if (dbError) throw dbError;

    const tcgQuery = cardId
      ? `id:${cardId}`
      : `set.id:${setId} number:${number} name:"${name}"`;
    const tcgUrl = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(tcgQuery)}&pageSize=5`;
    const tcgResponse = await fetch(tcgUrl, { headers });
    const tcgJson = tcgResponse.ok ? await tcgResponse.json() : null;
    const liveCard = tcgJson?.data?.[0] ?? null;

    const dbRaw = dbCard?.raw_data ?? {};
    return res.json({
      ok: true,
      query: { cardId, name, number, setId },
      database: {
        found: Boolean(dbCard),
        id: dbCard?.id ?? null,
        name: dbCard?.name ?? null,
        number: dbCard?.number ?? null,
        setId: dbCard?.set_id ?? null,
        setName: dbRaw?.set?.name ?? null,
        printedTotal: dbRaw?.set?.printedTotal ?? dbRaw?.set?.total ?? null,
        hasTcgplayer: Boolean(dbRaw?.tcgplayer?.prices && Object.keys(dbRaw.tcgplayer.prices).length),
        tcgplayerPriceKeys: Object.keys(dbRaw?.tcgplayer?.prices ?? {}),
        hasCardmarket: Boolean(dbRaw?.cardmarket?.prices),
      },
      liveTcgApi: {
        ok: tcgResponse.ok,
        status: tcgResponse.status,
        found: Boolean(liveCard),
        id: liveCard?.id ?? null,
        name: liveCard?.name ?? null,
        number: liveCard?.number ?? null,
        setId: liveCard?.set?.id ?? null,
        setName: liveCard?.set?.name ?? null,
        printedTotal: liveCard?.set?.printedTotal ?? liveCard?.set?.total ?? null,
        hasTcgplayer: Boolean(liveCard?.tcgplayer?.prices && Object.keys(liveCard.tcgplayer.prices).length),
        tcgplayerPriceKeys: Object.keys(liveCard?.tcgplayer?.prices ?? {}),
        hasCardmarket: Boolean(liveCard?.cardmarket?.prices),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'TCG verify failed',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// FINGERPRINT CACHE + PHASH SCAN
// ===============================

let _fpCache = null;
let _fpCacheAt = 0;
let _fpCacheLoading = null;
const _fpSetCache = new Map();
const _fpSetCacheLoading = new Map();
const FP_CACHE_TTL = 60 * 60 * 1000;
const HASH_SIZE = 32;
const DCT_SIZE = 8;
const FINGERPRINT_REGIONS = [
  { key: 'full', x: 0, y: 0, width: 1, height: 1, weight: 0.85 },
  { key: 'art', x: 0, y: 0.12, width: 1, height: 0.46, weight: 1.35 },
  { key: 'name', x: 0, y: 0.02, width: 1, height: 0.16, weight: 0.8 },
  { key: 'lower', x: 0, y: 0.56, width: 1, height: 0.34, weight: 1 },
  { key: 'center', x: 0, y: 0.22, width: 1, height: 0.58, weight: 1.05 },
];

async function getFingerprints() {
  if (_fpCache && Date.now() - _fpCacheAt < FP_CACHE_TTL) return _fpCache;
  if (_fpCacheLoading) return _fpCacheLoading;

  _fpCacheLoading = (async () => {
    try {
      const { data, error } = await supabase
        .from('card_fingerprints')
        .select('*');
      if (error) throw new Error(`Failed to load fingerprints: ${error.message}`);
      _fpCache = data;
      _fpCacheAt = Date.now();
      console.log(`Fingerprint cache loaded: ${data.length} records`);
      return _fpCache;
    } finally {
      _fpCacheLoading = null;
    }
  })();

  return _fpCacheLoading;
}

async function getFingerprintsForSet(setId) {
  if (!setId) return getFingerprints();

  const cached = _fpSetCache.get(setId);
  if (cached && Date.now() - cached.loadedAt < FP_CACHE_TTL) return cached.data;

  const existingLoad = _fpSetCacheLoading.get(setId);
  if (existingLoad) return existingLoad;

  const load = (async () => {
    try {
      const { data, error } = await supabase
        .from('card_fingerprints')
        .select('*')
        .eq('set_id', setId);
      if (error) throw new Error(`Failed to load fingerprints for ${setId}: ${error.message}`);
      _fpSetCache.set(setId, { data, loadedAt: Date.now() });
      console.log(`Fingerprint set cache loaded: ${setId} (${data.length} records)`);
      return data;
    } finally {
      _fpSetCacheLoading.delete(setId);
    }
  })();

  _fpSetCacheLoading.set(setId, load);
  return load;
}

// Must match the algorithm in scripts/card-fingerprinter/fingerprint.js exactly
function dct1D(signal) {
  const N = signal.length;
  const out = new Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    }
    out[k] = sum;
  }
  return out;
}

function dct2D(pixels, N) {
  const temp = new Array(N * N);
  for (let row = 0; row < N; row++) {
    const r = dct1D(pixels.slice(row * N, (row + 1) * N));
    for (let col = 0; col < N; col++) temp[row * N + col] = r[col];
  }
  const result = new Array(N * N);
  for (let col = 0; col < N; col++) {
    const c = [];
    for (let row = 0; row < N; row++) c.push(temp[row * N + col]);
    const dc = dct1D(c);
    for (let row = 0; row < N; row++) result[row * N + col] = dc[row];
  }
  return result;
}

function cropRegion(image, region) {
  const { width, height } = image.bitmap;
  const x = Math.max(0, Math.floor(width * region.x));
  const y = Math.max(0, Math.floor(height * region.y));
  const cropWidth = Math.max(1, Math.min(width - x, Math.floor(width * region.width)));
  const cropHeight = Math.max(1, Math.min(height - y, Math.floor(height * region.height)));
  return image.clone().crop(x, y, cropWidth, cropHeight);
}

function hashPreparedImage(image) {
  image.resize(HASH_SIZE, HASH_SIZE).greyscale();

  const pixels = [];
  image.scan(0, 0, HASH_SIZE, HASH_SIZE, (_x, _y, idx) => {
    pixels.push(image.bitmap.data[idx]);
  });

  const min = Math.min(...pixels);
  const max = Math.max(...pixels);
  const range = max - min || 1;
  const normalized = pixels.map(p => (p - min) / range);

  const dct = dct2D(normalized, HASH_SIZE);

  const coeffs = [];
  for (let row = 0; row < DCT_SIZE; row++) {
    for (let col = 0; col < DCT_SIZE; col++) {
      if (row === 0 && col === 0) continue;
      coeffs.push(dct[row * HASH_SIZE + col]);
    }
  }

  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return coeffs.map(c => (c > median ? '1' : '0')).join('');
}

async function generateFingerprints(imageBuffer) {
  const image = await Jimp.read(imageBuffer);
  const fingerprints = {};
  for (const region of FINGERPRINT_REGIONS) {
    fingerprints[region.key] = hashPreparedImage(cropRegion(image, region));
  }
  return fingerprints;
}

function hammingDistance(a, b) {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

function normalizeFingerprintMap(fp) {
  const map = fp?.fingerprints && typeof fp.fingerprints === 'object'
    ? fp.fingerprints
    : { art: fp?.phash };

  return Object.fromEntries(
    Object.entries(map).filter(([, hash]) => typeof hash === 'string' && hash.length > 0)
  );
}

function scoreFingerprintCandidate(reference, queryHashes) {
  const referenceHashes = normalizeFingerprintMap(reference);
  const regionScores = [];
  let weightedConfidence = 0;
  let totalWeight = 0;

  for (const region of FINGERPRINT_REGIONS) {
    const queryHash = queryHashes[region.key];
    const referenceHash = referenceHashes[region.key];
    if (!queryHash || !referenceHash || queryHash.length !== referenceHash.length) continue;

    const distance = hammingDistance(queryHash, referenceHash);
    const confidence = Math.round((1 - distance / queryHash.length) * 100);
    weightedConfidence += confidence * region.weight;
    totalWeight += region.weight;
    regionScores.push({
      region: region.key,
      distance,
      confidence,
    });
  }

  if (!regionScores.length || totalWeight === 0) return null;

  const coverageBonus = Math.min(regionScores.length - 1, 4) * 1.25;
  const score = Math.min(100, Math.round((weightedConfidence / totalWeight) + coverageBonus));
  const bestRegion = [...regionScores].sort((a, b) => b.confidence - a.confidence)[0];

  return {
    card_id: reference.card_id,
    card_name: reference.card_name,
    set_id: reference.set_id,
    distance: bestRegion.distance,
    confidence: score,
    regions_matched: regionScores.length,
    region_scores: regionScores,
  };
}

app.post('/api/fingerprints/reload', (_req, res) => {
  _fpCache = null;
  _fpCacheAt = 0;
  _fpCacheLoading = null;
  _fpSetCache.clear();
  _fpSetCacheLoading.clear();
  res.json({ ok: true, message: 'Fingerprint cache cleared — will reload on next scan' });
});

app.post('/api/scan/fingerprint', async (req, res) => {
  try {
    const { base64Image, setId } = req.body;
    const expectedSetId = typeof setId === 'string' && setId.trim() ? setId.trim() : null;
    if (!base64Image) return res.status(400).json({ error: 'Missing base64Image' });

    const imageBuffer = Buffer.from(base64Image, 'base64');
    const queryHashes = await generateFingerprints(imageBuffer);

    const fingerprints = await getFingerprintsForSet(expectedSetId);
    if (!fingerprints?.length) return res.status(503).json({ error: 'Fingerprint database not available' });

    const TOP_N = 5;
    const scoredCandidates = [];

    for (const fp of fingerprints) {
      const scored = scoreFingerprintCandidate(fp, queryHashes);
      if (!scored) continue;
      if (expectedSetId) {
        scored.set_bonus = true;
      }
      scoredCandidates.push(scored);
    }

    const candidatesToRank = scoredCandidates.filter((candidate) => !expectedSetId || candidate.confidence >= 55);

    const best = [];
    for (const scored of candidatesToRank) {
      if (best.length < TOP_N || scored.confidence > best[best.length - 1].confidence) {
        best.push(scored);
        best.sort((a, b) => b.confidence - a.confidence);
        if (best.length > TOP_N) best.pop();
      }
    }

    if (!best.length) return res.status(404).json({ error: 'No matches found' });

    const toCandidate = (fp) => ({
      card_id: fp.card_id,
      card_name: fp.card_name,
      set_id: fp.set_id,
      distance: fp.distance,
      confidence: fp.confidence,
      regions_matched: fp.regions_matched,
      region_scores: fp.region_scores,
      set_bonus: Boolean(fp.set_bonus),
    });

    return res.json({
      match: toCandidate(best[0]),
      candidates: best.map(toCandidate),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Fingerprint scan failed', detail: getErrorMessage(err) });
  }
});

// ===============================
// SCAN (Ximilar — scaffolded)
// ===============================

async function scanWithXimilar(imageUrl) {
  if (!XIMILAR_API_TOKEN) throw new Error('Missing XIMILAR_API_TOKEN');

  const ximilarRes = await fetch('https://api.ximilar.com/collectibles/v2/tcg_id', {
    method: 'POST',
    headers: {
      Authorization: `Token ${XIMILAR_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ _url: imageUrl }] }),
  });

  const data = await ximilarRes.json();

  return {
    ok: ximilarRes.ok,
    status: ximilarRes.status,
    data,
  };
}

function normalizeXimilarTcgCard(card) {
  const rawNumber = card?.card_number ?? card?.number ?? card?.collector_number ?? card?.info?.card_number;
  const fullNumber = String(rawNumber ?? '').trim();
  const [number, total] = fullNumber.includes('/') ? fullNumber.split('/') : [fullNumber, null];
  return {
    provider: 'ximilar',
    name: card?.name ?? card?.full_name ?? card?.info?.name ?? null,
    setName: card?.set ?? card?.set_name ?? card?.info?.set ?? null,
    setCode: card?.set_code ?? card?.setCode ?? card?.info?.set_code ?? null,
    number: number ? number.replace(/^0+/, '') : null,
    printedTotal: total ? Number(String(total).replace(/\D/g, '')) || null : null,
    rarity: card?.rarity ?? card?.info?.rarity ?? null,
    confidence: typeof card?._score === 'number' ? card._score : typeof card?.score === 'number' ? card.score : null,
    imageUrl: card?._img_url ?? card?.image_url ?? null,
    raw: card,
  };
}

function pickXimilarTcgCard(data) {
  const records = Array.isArray(data?.records) ? data.records : [];
  const cards = records.flatMap((record) => {
    if (Array.isArray(record?._objects)) return record._objects;
    if (Array.isArray(record?.cards)) return record.cards;
    if (Array.isArray(record?._matches)) return record._matches;
    if (record?._identification) return [record._identification];
    if (record?.name || record?.full_name) return [record];
    return [];
  });
  return cards[0] ? normalizeXimilarTcgCard(cards[0]) : null;
}

async function scanTcgWithXimilarBase64(base64Image, options = {}) {
  if (!XIMILAR_API_TOKEN) throw new Error('Missing XIMILAR_API_TOKEN');

  const ximilarRes = await fetch('https://api.ximilar.com/collectibles/v2/tcg_id', {
    method: 'POST',
    headers: {
      Authorization: `Token ${XIMILAR_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [{ _base64: stripBase64ImagePrefix(base64Image) }],
      rotate: true,
      pricing: false,
      price_stats: false,
      magic_ai: Boolean(options.magicAi),
    }),
  });

  const data = await ximilarRes.json().catch(() => null);
  return {
    ok: ximilarRes.ok,
    status: ximilarRes.status,
    data,
    match: pickXimilarTcgCard(data),
  };
}

app.post('/scan', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });

    const result = await scanWithXimilar(imageUrl);
    if (!result.ok) {
      return res.status(result.status).json({ error: 'Ximilar request failed', detail: result.data });
    }

    return res.json(result.data);
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed', detail: getErrorMessage(error) });
  }
});

app.post('/api/scan/tcg', async (req, res) => {
  try {
    const { imageUrl, base64Image, magicAi } = req.body;
    if (!imageUrl && !base64Image) return res.status(400).json({ error: 'Missing imageUrl or base64Image' });

    const result = base64Image
      ? await scanTcgWithXimilarBase64(base64Image, { magicAi })
      : await scanWithXimilar(imageUrl);
    if (!result.ok) {
      return res.status(result.status).json({ error: 'Ximilar request failed', detail: result.data });
    }

    return res.json({
      provider: 'ximilar',
      match: result.match ?? null,
      raw: result.data,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to scan card', detail: getErrorMessage(error) });
  }
});

app.post('/api/grade/ximilar', async (req, res) => {
  try {
    if (!XIMILAR_API_TOKEN) return res.status(500).json({ error: 'Missing XIMILAR_API_TOKEN' });

    const submittedImages = Array.isArray(req.body.images)
      ? req.body.images
      : Array.isArray(req.body.base64Images)
        ? req.body.base64Images.map((image) => ({ base64: image }))
        : [req.body.base64Image].filter(Boolean).map((image) => ({ base64: image }));

    if (!submittedImages.length || submittedImages.some((image) => typeof image?.base64 !== 'string')) {
      return res.status(400).json({ error: 'Missing images' });
    }

    const images = submittedImages.slice(0, 2);
    if (submittedImages.length > 2) {
      console.log(`Ximilar grade request received ${submittedImages.length} images; sending first 2 only.`);
    }
    const preprocessedImages = await Promise.all(
      images.map((image) => preprocessGradeImage(image.base64))
    );
    const whiteningAnalyses = await Promise.all(
      preprocessedImages.map((image) => analyzeEdgeWhitening(image.base64).catch((error) => ({
        error: getErrorMessage(error),
      })))
    );

    const ximilarRes = await fetch('https://api.ximilar.com/card-grader/v2/grade', {
      method: 'POST',
      headers: {
        Authorization: `Token ${XIMILAR_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: images.map((image, index) => ({
          _base64: preprocessedImages[index].base64,
          ...(image.side === 'Front' || image.side === 'Back' ? { Side: image.side } : {}),
        })),
      }),
    });

    const data = await ximilarRes.json().catch(() => null);
    if (!ximilarRes.ok) {
      return res.status(ximilarRes.status).json({
        error: 'Ximilar grading failed',
        message: getApiErrorMessage(data),
        detail: data,
      });
    }

    if (Array.isArray(data?.records)) {
      data.records = data.records.map((record, index) => ({
        ...record,
        _pocketvault_preprocessed_base64: preprocessedImages[index]?.base64 ?? null,
        _pocketvault_preprocess: preprocessedImages[index]?.debug ?? null,
        _pocketvault_edge_whitening: whiteningAnalyses[index] ?? null,
      }));
    }
    data.pocketvaultPreprocess = preprocessedImages.map((image) => image.debug);
    data.pocketvaultEdgeWhitening = whiteningAnalyses;

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Ximilar grading failed', detail: getErrorMessage(error) });
  }
});

app.post('/api/grade/cardmatrix', async (req, res) => {
  try {
    if (!CARDMATRIX_API_KEY) return res.status(500).json({ error: 'Missing CARDMATRIX_API_KEY' });

    const submittedImages = Array.isArray(req.body.images)
      ? req.body.images
      : Array.isArray(req.body.base64Images)
        ? req.body.base64Images.map((image, index) => ({ base64: image, side: index === 0 ? 'Front' : 'Back' }))
        : [req.body.base64Image].filter(Boolean).map((image) => ({ base64: image, side: 'Front' }));

    if (!submittedImages.length || submittedImages.some((image) => typeof image?.base64 !== 'string')) {
      return res.status(400).json({ error: 'Missing images' });
    }

    const images = submittedImages.slice(0, 2);
    const preprocessedImages = await Promise.all(
      images.map((image) => preprocessGradeImage(image.base64))
    );

    const form = new FormData();
    preprocessedImages.forEach((image, index) => {
      const side = images[index]?.side === 'Back' ? 'back' : 'front';
      form.append(side, Buffer.from(image.base64, 'base64'), {
        filename: `${side}.jpg`,
        contentType: 'image/jpeg',
      });
    });
    if (req.body.card_id || req.body.cardId) {
      form.append('card_id', String(req.body.card_id ?? req.body.cardId));
    }
    form.append('photo_gate_bypass', String(req.body.photo_gate_bypass ?? req.body.photoGateBypass ?? 'false'));

    const cardMatrixRes = await fetch('https://api.cardmatrix.io/api/analyze-quality', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CARDMATRIX_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const raw = await cardMatrixRes.json().catch(() => null);
    if (!cardMatrixRes.ok) {
      return res.status(cardMatrixRes.status).json({
        error: 'CardMatrix grading failed',
        message: getApiErrorMessage(raw),
        detail: raw,
      });
    }

    const scores = raw?.scores ?? {};
    return res.json({
      provider: 'cardmatrix',
      records: [{
        grades: {
          centering: scores.centering_front ?? scores.centering ?? null,
          corners: scores.corners ?? null,
          edges: scores.edges ?? null,
          surface: scores.surface ?? null,
          final: scores.overall ?? null,
          condition: raw?.condition ?? raw?.grade ?? null,
        },
        card: {
          centering: {
            grade: scores.centering_front ?? scores.centering ?? null,
          },
        },
        _pocketvault_preprocessed_base64: preprocessedImages[0]?.base64 ?? null,
        _pocketvault_preprocess: preprocessedImages[0]?.debug ?? null,
        _pocketvault_cardmatrix_raw: raw,
        _tags: {
          Confidence: [{
            name: raw?.verification?.confidence_badge ?? 'Unknown',
            prob: typeof raw?.confidence === 'number' ? raw.confidence : null,
          }],
        },
      }],
      raw,
      pocketvaultPreprocess: preprocessedImages.map((image) => image.debug),
    });
  } catch (error) {
    return res.status(500).json({ error: 'CardMatrix grading failed', detail: getErrorMessage(error) });
  }
});

app.get('/api/pokemon-price-tracker/card', async (req, res) => {
  try {
    if (!POKEMON_PRICE_TRACKER_API_KEY) {
      return res.status(500).json({ error: 'Missing POKEMON_PRICE_TRACKER_API_KEY' });
    }

    const identifier = String(req.query.identifier ?? '').trim();
    const tcgPlayerId = String(req.query.tcgPlayerId ?? '').trim();
    const setName = String(req.query.setName ?? '').trim();
    if (!identifier && !tcgPlayerId) {
      return res.status(400).json({ error: 'Missing identifier' });
    }

    const params = new URLSearchParams({ includeEbay: 'true' });
    if (tcgPlayerId || /^\d+$/.test(identifier)) {
      params.set('tcgPlayerId', tcgPlayerId || identifier);
    } else {
      params.set('search', identifier);
      if (setName) params.set('set', setName);
    }

    const pptRes = await fetch(`https://www.pokemonpricetracker.com/api/v2/cards?${params.toString()}`, {
      headers: { Authorization: `Bearer ${POKEMON_PRICE_TRACKER_API_KEY}` },
    });

    const data = await pptRes.json().catch(() => null);
    if (!pptRes.ok) {
      return res.status(pptRes.status).json({ error: 'Pokemon Price Tracker failed', detail: data });
    }

    return res.json({ card: data?.data?.[0] ?? null, raw: data });
  } catch (error) {
    return res.status(500).json({ error: 'Pokemon Price Tracker failed', detail: getErrorMessage(error) });
  }
});

app.get('/debug-ximilar', async (req, res) => {
  try {
    if (!XIMILAR_API_TOKEN) return res.status(500).json({ ok: false, error: 'Missing token' });

    const testRes = await fetch('https://api.ximilar.com/account/v2/details/', {
      method: 'GET',
      headers: { Authorization: `Token ${XIMILAR_API_TOKEN}` },
    });

    const text = await testRes.text();
    return res.status(testRes.status).send(text);
  } catch (error) {
    return res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

// ===============================
// TRADE: MARK AS SENT
// ===============================

app.post('/api/trade/sent', async (req, res) => {
  const { trade_id, user_id } = req.body;

  const { data: trade } = await supabase
    .from('trades')
    .select('*')
    .eq('id', trade_id)
    .single();

  if (!trade) return res.status(400).json({ error: 'Trade not found' });

  const updateField = trade.seller_id === user_id ? 'seller_sent' : 'buyer_sent';

  const { error } = await supabase
    .from('trades')
    .update({ [updateField]: true })
    .eq('id', trade_id);

  if (error) return res.status(400).json({ error });

  res.json({ success: true });
});

// ===============================
// TRADE: MARK AS RECEIVED
// ===============================

app.post('/api/trade/received', async (req, res) => {
  const { trade_id, user_id } = req.body;

  const { data: trade } = await supabase
    .from('trades')
    .select('*')
    .eq('id', trade_id)
    .single();

  if (!trade) return res.status(400).json({ error: 'Trade not found' });

  const updateField = trade.seller_id === user_id ? 'seller_received' : 'buyer_received';

  const updated = await supabase
    .from('trades')
    .update({ [updateField]: true })
    .eq('id', trade_id)
    .select()
    .single();

  const t = updated.data;

  if (t?.buyer_received && t?.seller_received) {
    await supabase
      .from('trades')
      .update({ status: 'completed' })
      .eq('id', trade_id);
  }

  res.json(updated.data);
});

// ===============================
// PUSH NOTIFICATIONS
// ===============================

async function sendPushNotification(token, title, body, data = {}) {
  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data,
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(message),
  });

  const json = await res.json();
  return json;
}

async function getUserPushToken(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .maybeSingle();
  return data?.expo_push_token ?? null;
}

// Send notification to a single user
app.post('/api/notify', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'Missing userId, title, or body' });
    }

    const token = await getUserPushToken(userId);

    if (!token) {
      return res.json({ ok: false, reason: 'No push token for user' });
    }

    const result = await sendPushNotification(token, title, body, data ?? {});
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Notification failed', detail: getErrorMessage(error) });
  }
});

// New trade offer notification
app.post('/api/notify/trade-offer', async (req, res) => {
  try {
    const { recipientUserId, senderUsername, cardName } = req.body;

    if (!recipientUserId) {
      return res.status(400).json({ error: 'Missing recipientUserId' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const result = await sendPushNotification(
      token,
      '📬 New Trade Offer',
      `${senderUsername ?? 'Someone'} wants to trade${cardName ? ` for your ${cardName}` : ''}`,
      { type: 'trade_offer', screen: 'offers' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send trade offer notification', detail: getErrorMessage(error) });
  }
});

// Trade status update notification (accepted, declined, sent, received)
app.post('/api/notify/trade-status', async (req, res) => {
  try {
    const { recipientUserId, status, cardName } = req.body;

    if (!recipientUserId || !status) {
      return res.status(400).json({ error: 'Missing recipientUserId or status' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const messages = {
      accepted: { title: '✅ Trade Accepted', body: `Your trade offer${cardName ? ` for ${cardName}` : ''} was accepted!` },
      declined: { title: '❌ Trade Declined', body: `Your trade offer${cardName ? ` for ${cardName}` : ''} was declined.` },
      sent: { title: '📦 Card Sent', body: `The other trader has marked${cardName ? ` ${cardName}` : ' their card'} as sent.` },
      received: { title: '📬 Card Received', body: `The other trader has confirmed they received${cardName ? ` ${cardName}` : ' their card'}.` },
      completed: { title: '🎉 Trade Complete', body: `Your trade${cardName ? ` for ${cardName}` : ''} is complete!` },
    };

    const msg = messages[status];
    if (!msg) return res.status(400).json({ error: `Unknown status: ${status}` });

    const result = await sendPushNotification(token, msg.title, msg.body, { type: 'trade_status', status, screen: 'offers' });

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send trade status notification', detail: getErrorMessage(error) });
  }
});

// Wishlist alert — someone listed a card the user has on their watchlist
app.post('/api/notify/wishlist-match', async (req, res) => {
  try {
    const { recipientUserId, listerUsername, cardName } = req.body;

    if (!recipientUserId || !cardName) {
      return res.status(400).json({ error: 'Missing recipientUserId or cardName' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const result = await sendPushNotification(
      token,
      '⭐ Wishlist Card Available',
      `${listerUsername ?? 'Someone'} just listed ${cardName} for trade — it's on your wishlist!`,
      { type: 'wishlist_match', screen: 'trade' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send wishlist notification', detail: getErrorMessage(error) });
  }
});

// Price alert — card hit target price
app.post('/api/notify/price-alert', async (req, res) => {
  try {
    const { recipientUserId, cardName, currentPrice, targetPrice, direction } = req.body;

    if (!recipientUserId || !cardName) {
      return res.status(400).json({ error: 'Missing recipientUserId or cardName' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const directionText = direction === 'below' ? 'dropped below' : 'risen above';

    const result = await sendPushNotification(
      token,
      '💰 Price Alert',
      `${cardName} has ${directionText} your target of £${targetPrice?.toFixed(2)}. Current price: £${currentPrice?.toFixed(2)}`,
      { type: 'price_alert', screen: 'market' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send price alert', detail: getErrorMessage(error) });
  }
});

// ... all the notification endpoints ...

// ===============================
// SYNC SET
// ===============================

app.get('/api/sync/set', async (req, res) => {
  try {
    const setId = String(req.query.setId || req.body.setId || '').trim();
    if (!setId) return res.status(400).json({ error: 'Missing setId' });

    const headers = POKEMON_TCG_API_KEY
      ? { 'X-Api-Key': POKEMON_TCG_API_KEY }
      : {};

    let page = 1;
    let totalUpserted = 0;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&page=${page}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        return res.status(500).json({ error: `TCG API failed: ${response.status}` });
      }

      const data = await response.json();
      const cards = data.data ?? [];

      if (!cards.length) {
        hasMore = false;
        break;
      }

      const rows = cards.map((card) => ({
        id: card.id,
        name: card.name,
        set_id: card.set?.id ?? setId,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        image_small: card.images?.small ?? null,
        image_large: card.images?.large ?? null,
        raw_data: card,
      }));

      const { error } = await supabase
        .from('pokemon_cards')
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.log('Upsert error:', error);
        return res.status(500).json({ error: error.message });
      }

      totalUpserted += rows.length;
      console.log(`✅ Synced page ${page} — ${rows.length} cards`);

      if (cards.length < 250) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return res.json({ ok: true, setId, totalUpserted });
   } catch (error) {
    return res.status(500).json({
      error: 'Sync failed',
      detail: getErrorMessage(error),
    });
  }
});

app.post('/api/scan/identify', async (req, res) => {
  console.log('📸 /api/scan/identify hit');
  console.log('📸 Body keys:', Object.keys(req.body));
  try {
    const { base64Image } = req.body;
if (!base64Image) return res.status(400).json({ error: 'Missing base64Image' });

// Resize to under 1MB before sending to Claude
const imageBuffer = Buffer.from(base64Image, 'base64');
const resizedBuffer = await sharp(imageBuffer)
  .resize({ width: 600, withoutEnlargement: true })
  .jpeg({ quality: 60 })
  .toBuffer();
const processedBase64 = resizedBuffer.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: processedBase64 },
              },
              {
                type: 'text',
                text: 'This is a Pokémon TCG card. Identify the following: 1) The Pokémon name printed at the top of the card. 2) The set name printed near the bottom or on the set symbol. 3) The collector card number printed at the bottom in the format XX/XXX (e.g. 4/102 or 25/198). Respond with ONLY raw JSON, no markdown, no code fences, no extra text. Exact format: {"name": "pokemon name", "set": "set name", "number": "XX/XXX"}. If you genuinely cannot read any part of the card respond with {"error": "could not identify"}.',
              },
            ],
          },
        ],
      }),
    });

    console.log('📡 Anthropic status:', response.status);
    const data = await response.json();
    console.log('📡 Anthropic full response:', JSON.stringify(data));
    const text = data?.content?.[0]?.text ?? '';
    console.log('🔍 Claude raw response:', text);
    
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(422).json({ error: 'Could not parse card identity' });
    }

    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Scan identify failed', detail: err.message });
  }
});

// ===============================
// DISCORD ROUTES
// ===============================

app.use('/api/discord', discordRoutes);

// ===============================
// START
// ===============================

app.listen(PORT, () => {
  console.log(`Stackr backend listening on port ${PORT}`);
});
