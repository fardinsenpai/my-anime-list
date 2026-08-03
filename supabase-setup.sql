-- ============================================================
-- Token-less admin commits — Supabase setup (run once)
-- Open Supabase Dashboard -> SQL Editor and run this.
-- This table lets the browser *queue* commit requests with the
-- public anon key (RLS-restricted), while the real GitHub PAT
-- stays only in GitHub Actions Secrets.
-- ============================================================

create table if not exists public.commit_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  path text not null,
  content text not null,          -- base64 of full file content
  message text not null,
  pin text,                       -- admin PIN check (validated server-side)
  status text not null default 'pending',  -- pending | done | failed
  error text
);

-- helper index
create index if not exists commit_queue_status_idx on public.commit_queue (status);

-- ============================================================
-- Row Level Security: anon (browser) may only INSERT and SELECT.
-- Only the service-role key (GitHub Actions) can UPDATE/process.
-- ============================================================
alter table public.commit_queue enable row level security;

drop policy if exists "anon insert commit" on public.commit_queue;
create policy "anon insert commit"
  on public.commit_queue for insert
  to anon
  with check (true);

drop policy if exists "anon select commit" on public.commit_queue;
create policy "anon select commit"
  on public.commit_queue for select
  to anon
  using (true);

-- service role can do everything (including status UPDATE)
drop policy if exists "service all commit" on public.commit_queue;
create policy "service all commit"
  on public.commit_queue for all
  to service_role
  using (true)
  with check (true);

-- Keep table size bounded (delete old done rows)
delete from public.commit_queue where status = 'done' and created_at < now() - interval '7 days';
