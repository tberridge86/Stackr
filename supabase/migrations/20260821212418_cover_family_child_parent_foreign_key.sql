-- Cover the composite child/parent foreign key used by family purchase requests.

drop index if exists public.family_purchase_requests_child_idx;

create index family_purchase_requests_child_parent_idx
  on public.family_purchase_requests (child_profile_id, parent_user_id);
