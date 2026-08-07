-- Reconcile the canonical catalogue seed with the reviewed UTF-8 source and
-- the current finish taxonomy. Promo remains a stable finish code for existing
-- references, while its first-class classification lives in variant_group.
-- This is forward-only and idempotent so that
-- environments created from either historical Stage 2 variant converge.

update catalog.languages
set native_name = case code
    when 'ja' then '日本語'
    when 'zh-Hans' then '简体中文'
    when 'zh-Hant' then '繁體中文'
    when 'ko' then '한국어'
    else native_name
  end,
  updated_at = now()
where code in ('ja', 'zh-Hans', 'zh-Hant', 'ko')
  and native_name is distinct from case code
    when 'ja' then '日本語'
    when 'zh-Hans' then '简体中文'
    when 'zh-Hant' then '繁體中文'
    when 'ko' then '한국어'
    else native_name
  end;

update catalog.finishes
set finish_group = 'other',
  description = 'Promotional distribution marker retained for compatibility.',
  updated_at = now()
where code = 'promo'
  and (finish_group is distinct from 'other'
    or description is distinct from 'Promotional distribution marker retained for compatibility.');

alter table catalog.finishes
  drop constraint if exists finishes_finish_group_check;

alter table catalog.finishes
  add constraint finishes_finish_group_check
  check (finish_group in ('standard', 'foil', 'parallel', 'edition', 'stamp', 'regional', 'other'));
