-- Make signup resilient when an auth user has been manually deleted but the
-- matching public profile row still exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = new.id) then
    update public.profiles
    set email = coalesce(public.profiles.email, new.email)
    where id = new.id;

    return new;
  end if;

  if new.email is not null and exists (select 1 from public.profiles where email = new.email) then
    update public.profiles
    set id = new.id,
        email = new.email
    where email = new.email;

    return new;
  end if;

  insert into public.profiles (id, email)
  values (new.id, new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
