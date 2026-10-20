/** Only reviewed false Simplified Chinese duplicates; never a general language fallback. */
export const CHINESE_DUPLICATE_SET_CORRECTIONS: Readonly<Record<string, string>> = Object.freeze({
  '1dbfe92e-8914-49b2-974c-47683cf51d4d': '4f84057b-edcf-4523-967c-5997ae696987',
  '4719ccc9-35c0-406a-b2c2-989af15d77b0': 'e044ea13-4498-4aa8-b46c-71bcc203bc89',
  '66d9e865-7d40-4b2e-8ef0-ae24fca87673': '05597373-2080-4842-bb67-c314e884f856',
  'a16f8d4c-d648-4bee-a219-9abc2aae49a6': 'd53eee17-75b8-48a8-bde5-50ac129a3558',
  'b67bee5b-da76-4575-a263-ab9cb69d4d7b': 'cd44897f-ea2e-4f63-b662-e4ddce1ac7e7',
});

export function correctedChineseSetContext(reference: string, language?: string | null) {
  const raw = reference.trim();
  const key = raw.toLowerCase().replace(/^zh-cn:/, '');
  const target = CHINESE_DUPLICATE_SET_CORRECTIONS[key];
  const normalizedLanguage = String(language ?? '').trim().toLowerCase().replace(/_/g, '-');
  const supportedHints = ['', 'all', 'zh-cn', 'zh-hans', 'zhcn', 'cn', 'chinese-simplified', 'simplified-chinese',
    'zh', 'zh-tw', 'zh-hant', 'zhtw', 'tw', 'chinese', 'traditional-chinese'];
  if (!target || !supportedHints.includes(normalizedLanguage)) return { reference, language };
  return { reference: target, language: 'zh-tw' as const };
}
