-- ================================================================
--  ADMIN LOCKDOWN
--  1) only the owner may delete a take
--  2) the written parts of a take (comment, name, avatar, pinned)
--     can only be changed by its owner or by an admin device - votes
--     and replies stay open, otherwise nobody could like a take
--  3) site_config is no longer world-writable (the admin panel
--     writes it through the admin panel instead)
-- ================================================================

-- 1) the admin devices (the owner's own browsers) ---------------------
create table if not exists public.site_admins (
  device_id  text primary key,
  note       text,
  added_at   timestamptz not null default now()
);
alter table public.site_admins enable row level security;

-- 2) hot_takes: the delete policy checks the owner ---------------------
drop policy if exists "ht delete" on public.hot_takes;
create policy "ht delete" on public.hot_takes
  for delete to public
  using (
    split_part(coalesce("_userId", ''), '|', 1)
      = coalesce(current_setting('request.headers', true)::json ->> 'x-device-id', '')
  );

-- 3) hot_takes: the content of a take is protected ---------------------
create or replace function public.ht_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dev text := coalesce(current_setting('request.headers', true)::json ->> 'x-device-id', '');
begin
  -- the service role (the admin panel, the functions) may do anything
  if auth.role() = 'service_role' then
    return new;
  end if;
  -- the owner of the take may change anything on it
  if split_part(coalesce(old."_userId", ''), '|', 1) = dev then
    return new;
  end if;
  -- an admin device may change anything (the panel can restyle a take)
  if exists (select 1 from public.site_admins where device_id = dev) then
    return new;
  end if;
  -- everybody else: votes and replies only
  if new."_userId" is distinct from old."_userId"
     or new."comment"  is distinct from old."comment"
     or new."userName" is distinct from old."userName"
     or new."avatar"   is distinct from old."avatar"
     or new."createdAt" is distinct from old."createdAt"
     or new."pinned"   is distinct from old."pinned" then
    raise exception 'you can only change your own take';
  end if;
  return new;
end;
$$;

drop trigger if exists ht_guard_update on public.hot_takes;
create trigger ht_guard_update
  before update on public.hot_takes
  for each row execute function public.ht_guard_update();

-- 4) site_config: read stays public, writing moves to the server -------
drop policy if exists "public update" on public.site_config;
drop policy if exists "public write" on public.site_config;
drop policy if exists "public insert" on public.site_config;

-- 5) the GitHub token the admin panel uses lives here, not in the browser.
--    RLS is on and there is no policy, so nobody can read it over the API -
--    only the Edge Function (service role) can.
create table if not exists public.panel_tokens (
  name       text primary key,
  token      text        not null,
  owner      text,
  updated_at timestamptz not null default now()
);
alter table public.panel_tokens enable row level security;
