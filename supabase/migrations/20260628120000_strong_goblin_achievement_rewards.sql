insert into public.achievement_coin_rewards (achievement_id, coin_reward, metadata)
values
  ('G020', 100, '{"tier":"gold","sourceTier":"Goblin Mode","category":"Goblin"}'::jsonb),
  ('M001', 150, '{"tier":"gold","sourceTier":"Strong Player","category":"Strong"}'::jsonb)
on conflict (achievement_id) do update
set
  coin_reward = excluded.coin_reward,
  metadata = excluded.metadata,
  updated_at = now();
