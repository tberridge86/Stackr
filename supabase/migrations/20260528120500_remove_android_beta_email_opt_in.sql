alter table public.profiles
  drop column if exists android_beta_email,
  drop column if exists android_beta_email_consent,
  drop column if exists android_beta_email_consented_at;
