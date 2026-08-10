-- Emergency rollback for 20260730145958. This intentionally restores the
-- previous broad function grants and catalogue-bucket listing policy.

alter function public.accept_trade_offer(uuid) reset search_path;
alter function public.enforce_wanted_card_limit() reset search_path;
alter function public.recalculate_binder_values(uuid) reset search_path;
alter function public.set_updated_at() reset search_path;
alter function public.touch_updated_at() reset search_path;
alter function public.trigger_recalculate_binder_values() reset search_path;
alter function public.update_binder_card_prices() reset search_path;
alter function public.touch_scan_lab_capture_updated_at() reset search_path;
alter function public.touch_recognition_feedback_updated_at() reset search_path;
alter function public.touch_recognition_shadow_mode_updated_at() reset search_path;

drop policy if exists "Stackr catalogue public assets are readable" on storage.objects;
create policy "Stackr catalogue public assets are readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'stackr-catalogue-public');

grant execute on function public.award_achievement_unlock_coins() to public, anon, authenticated;
grant execute on function public.handle_new_user() to public, anon, authenticated;
grant execute on function public.prevent_user_feedback_review_field_changes() to public, anon, authenticated;
grant execute on function public.queue_scanner_feedback_review() to public, anon, authenticated;
grant execute on function public.accept_trade_offer(uuid) to public, anon, authenticated;
grant execute on function public.admin_binder_directory() to public, anon, authenticated;
grant execute on function public.is_recognition_feedback_reviewer() to public, anon, authenticated;
grant execute on function public.is_scan_lab_admin() to public, anon, authenticated;
grant execute on function public.purchase_cosmetic(text) to public, anon, authenticated;
