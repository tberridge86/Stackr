-- Pin function name resolution so callers cannot influence object lookup.

alter function public.accept_trade_offer(uuid)
  set search_path = pg_catalog, public, pg_temp;
alter function public.enforce_wanted_card_limit()
  set search_path = pg_catalog, public, pg_temp;
alter function public.recalculate_binder_values(uuid)
  set search_path = pg_catalog, public, pg_temp;
alter function public.set_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.touch_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.trigger_recalculate_binder_values()
  set search_path = pg_catalog, public, pg_temp;
alter function public.update_binder_card_prices()
  set search_path = pg_catalog, public, pg_temp;
alter function public.touch_scan_lab_capture_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.touch_recognition_feedback_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.touch_recognition_shadow_mode_updated_at()
  set search_path = pg_catalog, public, pg_temp;

-- Public buckets serve known object URLs without a broad SELECT policy. The
-- policy allowed unauthenticated clients to enumerate every catalogue object.
drop policy if exists "Stackr catalogue public assets are readable" on storage.objects;

-- Trigger functions are invoked by their owning triggers, not through RPC.
revoke all on function public.award_achievement_unlock_coins() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_user_feedback_review_field_changes() from public, anon, authenticated;
revoke all on function public.queue_scanner_feedback_review() from public, anon, authenticated;

grant execute on function public.award_achievement_unlock_coins() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.prevent_user_feedback_review_field_changes() to service_role;
grant execute on function public.queue_scanner_feedback_review() to service_role;

-- These functions are intentional authenticated RPCs or RLS helpers. Remove
-- anonymous execution while preserving their signed-in and backend callers.
revoke all on function public.accept_trade_offer(uuid) from public, anon;
revoke all on function public.admin_binder_directory() from public, anon;
revoke all on function public.is_recognition_feedback_reviewer() from public, anon;
revoke all on function public.is_scan_lab_admin() from public, anon;
revoke all on function public.purchase_cosmetic(text) from public, anon;

grant execute on function public.accept_trade_offer(uuid) to authenticated, service_role;
grant execute on function public.admin_binder_directory() to authenticated, service_role;
grant execute on function public.is_recognition_feedback_reviewer() to authenticated, service_role;
grant execute on function public.is_scan_lab_admin() to authenticated, service_role;
grant execute on function public.purchase_cosmetic(text) to authenticated, service_role;
