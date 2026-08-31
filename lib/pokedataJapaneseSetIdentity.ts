export const POKEDATA_JAPANESE_FROZEN_SET_CODE_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  '3858': 'M5',
});

export type PokeDataJapaneseSetCodePolicy =
  | 'provider_reported_code'
  | 'frozen_provider_id_override'
  | 'code_missing';

export type PokeDataJapaneseSetCodeResolution = Readonly<{
  providerSetId: string;
  reportedCode: string | null;
  effectiveCode: string | null;
  identityPolicy: PokeDataJapaneseSetCodePolicy;
}>;

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function resolvePokeDataJapaneseSetCode(
  providerSetIdValue: unknown,
  reportedCodeValue: unknown,
): PokeDataJapaneseSetCodeResolution {
  const providerSetId = clean(providerSetIdValue) ?? '';
  const reportedCode = clean(reportedCodeValue);
  const frozenCode = POKEDATA_JAPANESE_FROZEN_SET_CODE_OVERRIDES[providerSetId] ?? null;
  if (reportedCode) {
    if (frozenCode && reportedCode.toLocaleLowerCase('en-US') !== frozenCode.toLocaleLowerCase('en-US')) {
      throw new Error(
        `PokeData Japanese frozen set identity drifted for provider set ${providerSetId}: expected ${frozenCode}, received ${reportedCode}.`,
      );
    }
    return Object.freeze({
      providerSetId,
      reportedCode,
      effectiveCode: reportedCode,
      identityPolicy: 'provider_reported_code',
    });
  }
  if (frozenCode) {
    return Object.freeze({
      providerSetId,
      reportedCode: null,
      effectiveCode: frozenCode,
      identityPolicy: 'frozen_provider_id_override',
    });
  }
  return Object.freeze({
    providerSetId,
    reportedCode: null,
    effectiveCode: null,
    identityPolicy: 'code_missing',
  });
}
