/* eslint-env node */
import { createPokemonTcgApiClient } from './pokemonTcgApi.js';
import { fetchJsonWithPolicy } from './upstreamJson.js';

const SUPPORTED_TCGDEX_LANGUAGES = new Set(['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normaliseLanguage(value = 'en') {
  const language = String(value || 'en').trim().toLowerCase().replace(/_/g, '-');
  if (!SUPPORTED_TCGDEX_LANGUAGES.has(language)) {
    const error = new Error(`Unsupported StackR catalogue language: ${language}`);
    error.status = 400;
    throw error;
  }
  return language;
}

async function tcgdexHealth(language, dependencies = {}) {
  const baseUrl = String(
    dependencies.tcgdexBaseUrl
      ?? process.env.TCGDEX_API_BASE_URL
      ?? 'https://api.tcgdex.net/v2',
  ).replace(/\/$/, '');
  const startedAt = Date.now();
  try {
    const result = await fetchJsonWithPolicy(`${baseUrl}/${language}/sets`, {
      provider: 'tcgdex',
      headers: { Accept: 'application/json' },
      timeoutMs: Number(process.env.TCGDEX_REQUEST_TIMEOUT_MS || 20_000),
      maxAttempts: Number(process.env.TCGDEX_MAX_ATTEMPTS || 3),
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.sleepImpl ? { sleepImpl: dependencies.sleepImpl } : {}),
      ...(dependencies.random ? { random: dependencies.random } : {}),
    });
    const rows = Array.isArray(result.value) ? result.value : [];
    return {
      provider: 'tcgdex',
      language,
      ok: true,
      status: result.status,
      attempts: result.attempts,
      responseTimeMs: Date.now() - startedAt,
      sampleCount: rows.length,
      mirrorRole: 'primary_multilingual_catalogue',
    };
  } catch (error) {
    return {
      provider: 'tcgdex',
      language,
      ok: false,
      status: Number(error?.status ?? 0) || null,
      responseTimeMs: Date.now() - startedAt,
      error: clean(error?.code) ?? 'tcgdex_unavailable',
      mirrorRole: 'primary_multilingual_catalogue',
    };
  }
}

async function pokemonTcgHealth(dependencies = {}) {
  const startedAt = Date.now();
  const client = createPokemonTcgApiClient({
    ...(dependencies.pokemonBaseUrl ? { baseUrl: dependencies.pokemonBaseUrl } : {}),
    ...(Object.hasOwn(dependencies, 'pokemonApiKey') ? { apiKey: dependencies.pokemonApiKey } : {}),
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.sleepImpl ? { sleepImpl: dependencies.sleepImpl } : {}),
    ...(dependencies.random ? { random: dependencies.random } : {}),
  });
  try {
    const result = await client.fetchPage('sets', { page: 1, pageSize: 1, select: 'id,name' });
    return {
      provider: 'pokemon-tcg-api',
      language: 'en',
      ok: true,
      status: Number(result.metadata.status ?? 200),
      attempts: Number(result.metadata.attempts ?? 1),
      responseTimeMs: Date.now() - startedAt,
      sampleCount: result.count,
      totalCount: result.totalCount,
      authenticated: Boolean(process.env.POKEMON_TCG_API_KEY),
      mirrorRole: 'english_reconciliation_fallback',
    };
  } catch (error) {
    return {
      provider: 'pokemon-tcg-api',
      language: 'en',
      ok: false,
      status: Number(error?.status ?? 0) || null,
      responseTimeMs: Date.now() - startedAt,
      error: clean(error?.code) ?? 'pokemon_tcg_api_unavailable',
      authenticated: Boolean(process.env.POKEMON_TCG_API_KEY),
      mirrorRole: 'english_reconciliation_fallback',
    };
  }
}

export async function getCatalogueProviderHealth({ language = 'en' } = {}, dependencies = {}) {
  const normalisedLanguage = normaliseLanguage(language);
  const [tcgdex, pokemonTcgApi] = await Promise.all([
    tcgdexHealth(normalisedLanguage, dependencies),
    pokemonTcgHealth(dependencies),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    language: normalisedLanguage,
    providers: [tcgdex, pokemonTcgApi],
    ok: tcgdex.ok && (normalisedLanguage !== 'en' || pokemonTcgApi.ok),
  };
}

export const catalogueProviderHealthInternals = {
  normaliseLanguage,
  pokemonTcgHealth,
  tcgdexHealth,
};
