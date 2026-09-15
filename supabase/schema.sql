-- NEETPG2027 Supabase schema
-- Safe for a public GitHub Pages client: only use the anon/publishable key in the browser.
-- Never expose the Supabase service_role key.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  target_exam text not null default 'NEET-PG 2027',
  daily_goal integer not null default 50 check (daily_goal between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.question_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  qid text not null,
  attempts integer not null default 0,
  correct integer not null default 0,
  incorrect integer not null default 0,
  last_correct boolean,
  bookmarked boolean not null default false,
  flagged boolean not null default false,
  note text not null default '',
  due_at timestamptz,
  interval_days double precision not null default 0,
  ease double precision not null default 2.5,
  streak integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, qid)
);

create table if not exists public.attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_key text not null,
  qid text not null,
  correct boolean not null,
  selected text,
  confidence integer check (confidence between 1 and 5),
  mistake text not null default '',
  note text not null default '',
  skipped boolean not null default false,
  happened_at timestamptz not null,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  session_id text not null default '',
  subject text,
  difficulty integer,
  primary key (user_id, client_key)
);

create index if not exists attempts_user_happened_idx
  on public.attempts(user_id, happened_at desc);
create index if not exists attempts_user_qid_idx
  on public.attempts(user_id, qid);

create table if not exists public.study_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  question_count integer not null default 0,
  correct_count integer not null default 0,
  accuracy integer not null default 0 check (accuracy between 0 and 100),
  mode text,
  feedback text,
  subjects text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists sessions_user_started_idx
  on public.study_sessions(user_id, started_at desc);

create table if not exists public.active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Create a profile automatically for new Auth users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Row Level Security. Every authenticated user can access only their own rows.
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.question_state enable row level security;
alter table public.attempts enable row level security;
alter table public.study_sessions enable row level security;
alter table public.active_sessions enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- user_settings
create policy "settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings_update_own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings_delete_own" on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

-- question_state
create policy "qstate_select_own" on public.question_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "qstate_insert_own" on public.question_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "qstate_update_own" on public.question_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "qstate_delete_own" on public.question_state for delete to authenticated using ((select auth.uid()) = user_id);

-- attempts
create policy "attempts_select_own" on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "attempts_insert_own" on public.attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "attempts_update_own" on public.attempts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "attempts_delete_own" on public.attempts for delete to authenticated using ((select auth.uid()) = user_id);

-- sessions
create policy "sessions_select_own" on public.study_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions_insert_own" on public.study_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions_update_own" on public.study_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions_delete_own" on public.study_sessions for delete to authenticated using ((select auth.uid()) = user_id);

-- active session
create policy "active_select_own" on public.active_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "active_insert_own" on public.active_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "active_update_own" on public.active_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "active_delete_own" on public.active_sessions for delete to authenticated using ((select auth.uid()) = user_id);
