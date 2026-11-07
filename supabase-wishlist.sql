-- ════════════════════════════════════════════════════════════════════════
--  💖 WISH LIST — run this once in Supabase → SQL Editor → New query
--  Project: ldzlefdklcgvqcbqibtt
--  After it runs, the heart on every card saves to the cloud, and
--  "Fardin's List" becomes visible to every visitor.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── table ───────────────────────────────────────────────────────────────
create table if not exists public.wishlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  owner_kind   text not null default 'user'
               check (owner_kind in ('user', 'admin')),
  owner_name   text default '',
  owner_avatar text default '',
  anime_num    text not null,                       -- the card's NO. number
  title        text not null default '',
  poster       text default '',
  status       text not null default 'available'
               check (status in ('available', 'ongoing', 'pending', 'rewatch')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint wishlist_one_per_user unique (user_id, anime_num)
);

create index if not exists wishlist_owner_kind_idx on public.wishlist (owner_kind);
create index if not exists wishlist_user_idx       on public.wishlist (user_id);

-- ── updated_at trigger ──────────────────────────────────────────────────
create or replace function public.wishlist_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wishlist_touch_trg on public.wishlist;
create trigger wishlist_touch_trg
  before update on public.wishlist
  for each row execute function public.wishlist_touch();

-- ── row level security ──────────────────────────────────────────────────
alter table public.wishlist enable row level security;

-- 1) everyone (even signed out) can read Fardin's public list
drop policy if exists "wishlist read public admin" on public.wishlist;
create policy "wishlist read public admin"
  on public.wishlist
  for select
  using (owner_kind = 'admin');

-- 2) a signed-in person can read their own rows
drop policy if exists "wishlist read own" on public.wishlist;
create policy "wishlist read own"
  on public.wishlist
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3) insert only as yourself. owner_kind = 'admin' is allowed only for
--    the GitHub login below (change it if your handle changes).
drop policy if exists "wishlist insert own" on public.wishlist;
create policy "wishlist insert own"
  on public.wishlist
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      owner_kind = 'user'
      or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', '')) = 'fardinsenpai'
      or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'preferred_username', '')) = 'fardinsenpai'
      -- If you also sign in with an email account, add it here:
      -- or lower(coalesce(auth.jwt() ->> 'email', '')) = 'your@email.com'
    )
  );

-- 4) update / delete only your own rows (and never grant yourself admin)
drop policy if exists "wishlist update own" on public.wishlist;
create policy "wishlist update own"
  on public.wishlist
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      owner_kind = 'user'
      or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', '')) = 'fardinsenpai'
      or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'preferred_username', '')) = 'fardinsenpai'
    )
  );

drop policy if exists "wishlist delete own" on public.wishlist;
create policy "wishlist delete own"
  on public.wishlist
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ── grants ──────────────────────────────────────────────────────────────
grant select on public.wishlist to anon, authenticated;
grant insert, update, delete on public.wishlist to authenticated;

-- ── done ────────────────────────────────────────────────────────────────
-- Quick check after running:
--   select * from public.wishlist;
-- It will be empty until you tap a heart while signed in.
