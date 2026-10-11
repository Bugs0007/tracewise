-- Tracewise leaderboard (opt-in). A player who turns on "Show my level on the leaderboard" in Settings gets one row here.
-- Privacy: the table can only be read by its owner. Everyone else sees the board ONLY through the function
-- below, which returns a rank and a level and nothing else: no name, email, id or XP.
create table if not exists public.tracewise_leaderboard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  level integer not null default 1,
  xp integer not null default 0,
  week_start date not null,
  week_xp integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.tracewise_leaderboard enable row level security;

drop policy if exists "tracewise board own select" on public.tracewise_leaderboard;
drop policy if exists "tracewise board own insert" on public.tracewise_leaderboard;
drop policy if exists "tracewise board own update" on public.tracewise_leaderboard;
drop policy if exists "tracewise board own delete" on public.tracewise_leaderboard;

create policy "tracewise board own select" on public.tracewise_leaderboard for select using (auth.uid() = user_id);
create policy "tracewise board own insert" on public.tracewise_leaderboard for insert with check (auth.uid() = user_id);
create policy "tracewise board own update" on public.tracewise_leaderboard for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tracewise board own delete" on public.tracewise_leaderboard for delete using (auth.uid() = user_id);

-- scope: 'all' (all time, ranked by total XP) or 'week' (this week, ranked by XP earned since Monday UTC).
-- Returns at most `lim` rows (never more than 100): rank, level, and whether the row is the caller's own.
create or replace function public.tracewise_leaderboard(scope text, lim integer default 50)
returns table (rank integer, level integer, is_me boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    (rank() over (order by case when scope = 'week' then t.week_xp else t.xp end desc))::integer as rank,
    t.level,
    (t.user_id = auth.uid()) as is_me
  from public.tracewise_leaderboard t
  where scope = 'all'
     or (scope = 'week' and t.week_start = (date_trunc('week', timezone('utc', now())))::date and t.week_xp > 0)
  order by 1, t.level desc
  limit least(greatest(coalesce(lim, 50), 1), 100);
$$;

revoke all on function public.tracewise_leaderboard(text, integer) from public;
grant execute on function public.tracewise_leaderboard(text, integer) to anon, authenticated;
