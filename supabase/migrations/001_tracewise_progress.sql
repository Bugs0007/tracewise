-- Tracewise cloud sync: one row per signed-in user holding their save as JSON.
-- Safe to run in a Supabase project that already hosts other apps (own table name).
create table if not exists public.tracewise_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  schema integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.tracewise_progress enable row level security;

drop policy if exists "tracewise own select" on public.tracewise_progress;
drop policy if exists "tracewise own insert" on public.tracewise_progress;
drop policy if exists "tracewise own update" on public.tracewise_progress;
drop policy if exists "tracewise own delete" on public.tracewise_progress;

create policy "tracewise own select" on public.tracewise_progress for select using (auth.uid() = user_id);
create policy "tracewise own insert" on public.tracewise_progress for insert with check (auth.uid() = user_id);
create policy "tracewise own update" on public.tracewise_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tracewise own delete" on public.tracewise_progress for delete using (auth.uid() = user_id);
