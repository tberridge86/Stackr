import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import { TcgdexSourceAdapter, tcgdexAdapterInternals } from './catalogue-ingestion/tcgdexAdapter';
import type { FetchScope, ProviderRecord, SourceAdapter } from './catalogue-ingestion/sourceAdapter';

const STAGING_REF = 'lmwfhvexfcoyeuoyrlco';
const TARGET_IDS = ['sv03-016', 'sv03-017'] as const;
const HISTORIC_CONFLICT_IDS = [
  'ee9f37ab-5fb3-422c-9313-3cfb7cdb88e3',
  '0b27bb73-dd33-454e-9dc3-9c7085cc94d9',
] as const;

function requiredEnv(name: string) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const baseUrl = String(process.env.TCGDEX_BASE_URL || 'http://127.0.0.1:3300/v2').replace(/\/$/, '');
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!supabaseUrl.includes(STAGING_REF) || !supabaseKey) {
    throw new Error('Refusing variant repair outside canonical staging Supabase.');
  }

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const delegate = new TcgdexSourceAdapter({
    language: 'en',
    baseUrl,
    licenceStatus: 'approved',
    assetLicenceStatus: 'under_review',
  });

  async function exactCardRecord(id: string): Promise<ProviderRecord> {
    const endpoint = `${baseUrl}/en/cards/${encodeURIComponent(id)}`;
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`TCGdex exact repair fetch failed (${response.status}) for ${id}: ${text.slice(0, 240)}`);
    }
    const card = JSON.parse(text) as Record<string, unknown>;
    const candidates = tcgdexAdapterInternals.variantCandidates(card);
    const imageVariant = tcgdexAdapterInternals.imageVariantCandidate(card);
    if (!['normal', 'holo', 'reverse_holo'].every((variant) => candidates.includes(variant))) {
      throw new Error(`Unexpected TCGdex variants for ${id}: ${JSON.stringify(candidates)}`);
    }
    if (imageVariant !== 'normal') {
      throw new Error(`Expected ${id} displayed image variant to be normal; received ${String(imageVariant)}.`);
    }
    return {
      provider: 'tcgdex',
      providerRecordId: id,
      recordType: 'card',
      languageCode: 'en',
      sourceUrl: endpoint,
      sourceEndpoint: endpoint,
      providerUpdatedAt: String(card.updatedAt ?? card.updated_at ?? '').trim() || null,
      licenceStatus: 'approved',
      attributionText: 'TCGdex',
      httpMetadata: {
        status: response.status,
        endpoint,
        source: 'pinned_immutable_provider_container',
        imageDigest: process.env.TCGDEX_IMAGE,
      },
      payload: {
        ...card,
        variant: imageVariant ?? candidates[0],
        image_variant: imageVariant,
      },
    };
  }

  let cardCache: Promise<ProviderRecord[]> | null = null;
  const exactCards = () => {
    cardCache ??= Promise.all(TARGET_IDS.map((id) => exactCardRecord(id)));
    return cardCache;
  };

  const adapter: SourceAdapter = {
    identifySource: () => delegate.identifySource(),
    healthCheck: (scope?: FetchScope) => delegate.healthCheck(scope),
    fetchSets: async () => [],
    fetchCards: async () => exactCards(),
    fetchVariants: async () => {
      const cards = await exactCards();
      return cards.flatMap((card) => {
        const baseVariant = String(card.payload.image_variant ?? card.payload.variant ?? 'normal');
        return tcgdexAdapterInternals.variantCandidates(card.payload)
          .filter((variant) => variant !== baseVariant)
          .map((variant) => ({
            ...card,
            providerRecordId: `${card.providerRecordId}:${variant}`,
            recordType: 'variant' as const,
            payload: {
              ...card.payload,
              variant,
              parent_card_id: card.providerRecordId,
            },
          }));
      });
    },
    fetchAssets: async () => [],
    normaliseRecord: (record) => delegate.normaliseRecord(record),
    validateRecord: (record) => delegate.validateRecord(record),
  };

  const { data: conflictsBefore, error: beforeError } = await db
    .schema('ingest')
    .from('data_conflicts')
    .select('*')
    .in('id', [...HISTORIC_CONFLICT_IDS])
    .order('created_at', { ascending: true });
  if (beforeError) throw beforeError;
  if ((conflictsBefore ?? []).length !== HISTORIC_CONFLICT_IDS.length) {
    throw new Error(`Expected ${HISTORIC_CONFLICT_IDS.length} historic conflicts; found ${(conflictsBefore ?? []).length}.`);
  }
  if ((conflictsBefore ?? []).some((row) => row.conflict_type !== 'identity_collision')) {
    throw new Error('Historic repair target contains an unexpected conflict type.');
  }

  const runner = new CatalogueIngestionRunner(db, adapter);
  const result = await runner.run({
    command: 'run_source',
    importType: 'repair',
    language: 'en',
    providerRecordId: TARGET_IDS.join(','),
    runKey: `tcgdex-primary-variant-policy-repair-2026-08-19-v2-${process.env.GITHUB_RUN_ID || 'manual'}`,
    requestId: `github:${process.env.GITHUB_RUN_ID || 'manual'}:tcgdex-primary-variant-policy-repair`,
    allowImageAssets: false,
    approvedOnlyAssets: true,
    writeConcurrency: 2,
  });
  if (!result.ok || !result.importRunId) {
    throw new Error(`Targeted catalogue repair did not complete: ${JSON.stringify(result)}`);
  }
  if (result.stats.recordsConflicted !== 0 || result.stats.recordsRetrieved !== 6) {
    throw new Error(`Unexpected targeted repair stats: ${JSON.stringify(result.stats)}`);
  }

  const { data: repairConflicts, error: repairConflictError } = await db
    .schema('ingest')
    .from('data_conflicts')
    .select('id,conflict_type,severity,status,canonical_key,internal_notes')
    .eq('import_run_id', result.importRunId)
    .in('status', ['open', 'in_review']);
  if (repairConflictError) throw repairConflictError;
  if ((repairConflicts ?? []).length) {
    throw new Error(`Repair run retained unresolved conflicts: ${JSON.stringify(repairConflicts)}`);
  }

  const expectedExternalIds = TARGET_IDS.flatMap((id) => [id, `${id}:holo`, `${id}:reverse_holo`]);
  const { data: sourceRows, error: sourceError } = await db
    .schema('ingest')
    .from('sources')
    .select('id,code')
    .eq('code', 'tcgdex')
    .limit(1);
  if (sourceError) throw sourceError;
  const sourceId = sourceRows?.[0]?.id;
  if (!sourceId) throw new Error('TCGdex ingest source row is missing.');

  const { data: identifiers, error: identifierError } = await db
    .schema('ingest')
    .from('external_identifiers')
    .select('id,external_id,language_code,variant_id,is_current,deprecated_at')
    .eq('source_id', sourceId)
    .eq('source_entity_type', 'card')
    .eq('language_code', 'en')
    .in('external_id', expectedExternalIds)
    .eq('is_current', true)
    .is('deprecated_at', null)
    .order('external_id', { ascending: true });
  if (identifierError) throw identifierError;
  const currentIdentifiers = identifiers ?? [];
  const byExternalId = new Map(currentIdentifiers.map((row) => [row.external_id, row]));
  const missingIdentifiers = expectedExternalIds.filter((id) => !byExternalId.has(id));
  if (missingIdentifiers.length || currentIdentifiers.length !== expectedExternalIds.length) {
    throw new Error(`Identifier verification failed: missing ${missingIdentifiers.join(', ') || 'none'}; rows ${currentIdentifiers.length}.`);
  }

  const variantIds = [...new Set(currentIdentifiers.map((row) => row.variant_id).filter(Boolean))];
  const { data: variants, error: variantError } = await db
    .schema('catalog')
    .from('card_variants')
    .select('id,printing_id,variant_code,finish_code,canonical_key,is_default,deprecated_at')
    .in('id', variantIds)
    .is('deprecated_at', null);
  if (variantError) throw variantError;
  const variantById = new Map((variants ?? []).map((row) => [row.id, row]));

  const verifiedCards = TARGET_IDS.map((id) => {
    const expected = new Map([
      [id, 'normal'],
      [`${id}:holo`, 'holo'],
      [`${id}:reverse_holo`, 'reverse_holo'],
    ]);
    const rows = [...expected.entries()].map(([externalId, expectedVariant]) => {
      const identifier = byExternalId.get(externalId);
      const variant = identifier ? variantById.get(identifier.variant_id) : null;
      if (!identifier || !variant) throw new Error(`Missing linked variant for ${externalId}.`);
      if (variant.variant_code !== expectedVariant || variant.finish_code !== expectedVariant) {
        throw new Error(`${externalId} points to ${variant.variant_code}/${variant.finish_code}; expected ${expectedVariant}.`);
      }
      return {
        externalId,
        identifierId: identifier.id,
        variantId: variant.id,
        printingId: variant.printing_id,
        variantCode: variant.variant_code,
        finishCode: variant.finish_code,
        canonicalKey: variant.canonical_key,
        isDefault: variant.is_default,
      };
    });
    if (new Set(rows.map((row) => row.printingId)).size !== 1) {
      throw new Error(`${id} variants do not share one canonical printing.`);
    }
    if (rows.find((row) => row.externalId === id)?.isDefault !== true) {
      throw new Error(`${id} normal base variant is not the default variant.`);
    }
    return { providerRecordId: id, variants: rows };
  });

  const resolvedAt = new Date().toISOString();
  const resolutionNotes = [
    'Resolved by exact TCGdex primary-variant policy repair.',
    'Pinned provider payload declares normal, holo and reverse finishes while image_variant is normal.',
    'Base IDs were verified against normal; explicit :holo and :reverse_holo aliases were verified against their own variants.',
    `Repair import run ${result.importRunId}.`,
    `Source commit ${process.env.REPAIR_SOURCE_SHA}.`,
  ].join(' ');
  const resolutionPatch = {
    status: 'resolved',
    resolved_at: resolvedAt,
    resolution_notes: resolutionNotes,
    resolved_by: 'stackr_tcgdex_primary_variant_policy_repair',
  };
  const { data: resolvedRows, error: resolveError } = await db
    .schema('ingest')
    .from('data_conflicts')
    .update(resolutionPatch)
    .in('id', [...HISTORIC_CONFLICT_IDS])
    .in('status', ['open', 'in_review'])
    .select('*');
  if (resolveError) throw resolveError;
  if ((resolvedRows ?? []).length !== HISTORIC_CONFLICT_IDS.length) {
    throw new Error(`Expected to resolve ${HISTORIC_CONFLICT_IDS.length} conflicts; updated ${(resolvedRows ?? []).length}.`);
  }

  const { data: conflictsAfter, error: afterError } = await db
    .schema('ingest')
    .from('data_conflicts')
    .select('id,status,resolved_at,resolution_notes,resolved_by,conflict_type,severity,canonical_key')
    .in('id', [...HISTORIC_CONFLICT_IDS])
    .order('id', { ascending: true });
  if (afterError) throw afterError;
  if ((conflictsAfter ?? []).some((row) => row.status !== 'resolved' || !row.resolved_at || !row.resolution_notes)) {
    throw new Error(`Historic conflict resolution verification failed: ${JSON.stringify(conflictsAfter)}`);
  }

  const evidence = {
    schemaVersion: 'stackr-tcgdex-primary-variant-repair-v2.0.0',
    repairedAt: resolvedAt,
    projectRef: STAGING_REF,
    productionTouched: false,
    sourceCommit: process.env.REPAIR_SOURCE_SHA,
    providerImage: process.env.TCGDEX_IMAGE,
    importRunId: result.importRunId,
    importStats: result.stats,
    targetProviderRecordIds: TARGET_IDS,
    verifiedCards,
    conflictsBefore: (conflictsBefore ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      conflictType: row.conflict_type,
      severity: row.severity,
      canonicalKey: row.canonical_key,
      internalNotes: row.internal_notes,
    })),
    conflictsAfter,
    ok: true,
  };
  await writeFile('reports/catalogue/tcgdex-primary-variant-repair.json', `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    importRunId: result.importRunId,
    stats: result.stats,
    resolvedConflictIds: conflictsAfter?.map((row) => row.id),
    verifiedCards,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: 'stackr-tcgdex-primary-variant-conflict-repair',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
