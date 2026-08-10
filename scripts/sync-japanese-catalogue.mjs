#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  getCatalogueHealth,
  repairTcgdexCatalogue,
  syncTcgdexCatalogue,
} from '../backend/lib/tcgdexCatalogue.js';

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function boolAny(names, defaultValue = false) {
  for (const name of names) {
    if (hasFlag(name)) return true;
    const value = readArg(name);
    if (value != null && value !== '') return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
  }
  return defaultValue;
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const options = {
  language: 'ja',
  setId: readArg('set') || readArg('setId') || null,
  allCards: boolAny(['all-cards', 'allCards']),
  resolveImages: boolAny(['resolve-images', 'resolveImages'], true),
  refreshPrices: boolAny(['refresh-prices', 'refreshPrices'], true),
  forceImages: boolAny(['force-images', 'forceImages']),
  forcePrices: boolAny(['force-prices', 'forcePrices']),
  limit: readArg('limit') || null,
};

console.log('Starting canonical Japanese TCGdex catalogue sync', {
  setId: options.setId,
  allCards: options.allCards,
  resolveImages: options.resolveImages,
  refreshPrices: options.refreshPrices,
});

const result = hasFlag('repair')
  ? await repairTcgdexCatalogue(supabase, options)
  : await syncTcgdexCatalogue(supabase, options);

const health = await getCatalogueHealth(supabase, { language: 'ja' });

console.log(JSON.stringify({
  ok: true,
  source: 'tcgdex',
  language: 'ja',
  region: 'japan',
  result,
  health,
}, null, 2));
