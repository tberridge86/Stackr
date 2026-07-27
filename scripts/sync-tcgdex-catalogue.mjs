#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  repairTcgdexCatalogue,
  repairSetAssetUrls,
  resolveMissingImages,
  refreshCardPrices,
  syncCardsForSet,
  syncTcgdexCatalogue,
} from '../backend/lib/tcgdexCatalogue.js';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const equalsIndex = token.indexOf('=');
    if (equalsIndex > 2) {
      args[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function boolArg(value, defaultValue = false) {
  if (value == null) return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function firstArg(...names) {
  for (const name of names) {
    const value = args[name];
    if (value != null && value !== '') return value;
  }
  return null;
}

function boolAny(names, defaultValue = false) {
  for (const name of names) {
    if (args[name] != null) return boolArg(args[name], defaultValue);
  }
  return defaultValue;
}

const args = parseArgs(process.argv);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const language = String(firstArg('language', 'lang') || 'en').trim();
const setId = firstArg('set', 'setId');
const shared = {
  language,
  setId,
  allCards: boolAny(['allCards', 'all-cards']),
  resolveImages: boolAny(['resolveImages', 'resolve-images'], true),
  refreshPrices: boolAny(['refreshPrices', 'refresh-prices'], true),
  forceImages: boolAny(['forceImages', 'force-images']),
  forcePrices: boolAny(['forcePrices', 'force-prices']),
  limit: firstArg('limit'),
};

let result;
if (args.repair) {
  result = await repairTcgdexCatalogue(supabase, shared);
} else if (args.images) {
  result = await resolveMissingImages(supabase, shared);
} else if (args.prices) {
  result = await refreshCardPrices(supabase, shared);
} else if (boolAny(['setAssets', 'set-assets'])) {
  result = await repairSetAssetUrls(supabase, shared);
} else if (setId && boolAny(['cards'])) {
  result = await syncCardsForSet(supabase, shared);
} else {
  result = await syncTcgdexCatalogue(supabase, shared);
}

console.log(JSON.stringify(result, null, 2));
