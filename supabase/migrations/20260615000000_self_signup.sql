-- ============================================================================
-- Data Science SFE — Student self-signup, email verification, rate limiting
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add email column to profiles (for display and login lookup)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text;

-- Create index for email lookups
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- 2. Rate limiting table (for signup, login, verify, resend)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  identifier   text not null,  -- IP or email
  action       text not null,  -- 'signup', 'login', 'verify', 'resend'
  attempts     int not null default 1,
  window_start timestamptz not null default now(),
  unique (identifier, action)
);

create index if not exists rate_limits_identifier_action_idx
  on public.rate_limits (identifier, action);

alter table public.rate_limits enable row level security;

-- Only service role can read/write rate limits
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- 3. Add teacher role to user_role enum (if not exists)
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.user_role add value if not exists 'teacher';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. Email is already stored in auth.users, no need for custom confirmation table
--    Supabase handles email confirmation natively with OTP.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Update RLS policies for profiles to allow students to update email
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Students can update: full_name, display_name, opted_out_of_leaderboard, email
-- Role and student_code are protected by column grants
revoke update on public.profiles from anon, authenticated;
grant update (full_name, display_name, opted_out_of_leaderboard, email) on public.profiles to authenticated;
grant update on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- 5. Notify PostgREST to reload schema
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';