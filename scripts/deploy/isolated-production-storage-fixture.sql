-- Schema-only production baselines omit Storage configuration rows.
-- Seed the pre-containment bucket state so the replay proves that the
-- production security migration makes it private and constrains uploads.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'card-scans',
  'card-scans',
  true,
  null,
  null
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
