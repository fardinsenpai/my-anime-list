-- ================================================================
--  EMAIL OTP AUTH  (Supabase + Resend + Cloudflare Turnstile)
--  All free tiers. Run this once in the Supabase SQL editor.
-- ================================================================

-- 1) the one-time codes -------------------------------------------------
-- Only the service role (the Edge Function) may touch this table:
-- RLS is ON and no policy is added for anon/authenticated, so the
-- REST API cannot read or write it.
create table if not exists public.email_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,
  code_hash   text        not null,        -- sha256(pepper:email:code), never the code itself
  expires_at  timestamptz not null,
  attempts    int         not null default 0,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists email_codes_email_idx   on public.email_codes (email);
create index if not exists email_codes_expires_idx on public.email_codes (expires_at);

alter table public.email_codes enable row level security;

-- 2) who has proved they own their address ------------------------------
create table if not exists public.verified_users (
  email        text primary key,
  method       text        not null default 'otp',   -- otp | google | github | manual
  verified_at  timestamptz not null default now()
);

alter table public.verified_users enable row level security;

-- 3) the only way the outside world may ask about a user ----------------
-- A boolean, never the list of addresses: nobody can harvest your users'
-- emails from the browser.
create or replace function public.is_email_verified(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.verified_users where lower(email) = lower(coalesce(p_email, ''))
  );
$$;

grant execute on function public.is_email_verified(text) to anon, authenticated;

-- 4) tidy up: codes that were never used stop being useful after 10 min
--    (this is also called from the Edge Function on every request)
--    NB: this is a SQL function, so the body is one query - the delete runs
--    inside a data-modifying CTE and the count comes back from it.
create or replace function public.purge_expired_codes()
returns int
language sql
volatile
security definer
set search_path = public
as $$
  with gone as (
    delete from public.email_codes where expires_at < now() returning 1
  )
  select count(*)::int from gone;
$$;

grant execute on function public.purge_expired_codes() to service_role;
