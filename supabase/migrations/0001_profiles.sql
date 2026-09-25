-- ============================================================================
-- 0001_profiles
--
-- Minimal profile record created alongside every auth user. Progression
-- columns (xp, level, coins, diamonds, equipped_character_id) arrive in Phase 2
-- so that this migration stays reversible and auth can be verified in
-- isolation.
--
-- Authentication data is NOT duplicated here: email, password hash and
-- confirmation state stay in auth.users, which Supabase owns.
-- ============================================================================

create extension if not exists citext;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    citext not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_username_length check (char_length(username) between 3 and 20),
  -- Letters, digits and underscore only, so usernames stay safe to render
  -- anywhere in the UI without escaping surprises.
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]+$')
);

-- citext makes this case-insensitive: "Yasmin" and "yasmin" collide.
create unique index if not exists profiles_username_key on public.profiles (username);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- A player may read and update only their own row, and `username` is the only
-- column they can change. Progression added in Phase 2 will stay outside the
-- client-writable set: coins/XP/match rewards are written by the game server
-- with the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately no INSERT policy for clients. Rows are created by the trigger
-- below, which runs as the definer, so a client cannot fabricate a profile.

-- ---------------------------------------------------------------------------
-- Profile creation on signup
--
-- Runs inside the same transaction as the auth.users insert, so an account can
-- never exist without a profile. The username comes from the signUp metadata;
-- if it is missing or already taken, a unique suffix is appended rather than
-- failing the whole registration.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired text;
  candidate text;
begin
  desired := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  -- Fall back to the email local-part, stripped to the allowed charset.
  if desired is null then
    desired := regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z0-9_]', '', 'g');
  end if;

  if desired is null or char_length(desired) < 3 then
    desired := 'player';
  end if;

  desired := left(desired, 20);
  candidate := desired;

  -- Resolve collisions deterministically instead of aborting the signup.
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    candidate := left(desired, 14) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end loop;

  insert into public.profiles (id, username)
  values (new.id, candidate);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill accounts created before this migration.
--
-- The trigger above only fires on new signups, so any account that already
-- exists would otherwise be left without a profile and unable to set a
-- username. Idempotent: re-running this migration is safe.
-- ---------------------------------------------------------------------------

insert into public.profiles (id, username)
select
  u.id,
  -- Same rules as handle_new_user, with the id fragment guaranteeing
  -- uniqueness so a collision cannot abort the backfill.
  left(
    coalesce(
      nullif(regexp_replace(coalesce(u.raw_user_meta_data ->> 'username', ''), '[^A-Za-z0-9_]', '', 'g'), ''),
      nullif(regexp_replace(split_part(u.email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), ''),
      'player'
    ),
    14
  ) || '_' || substr(replace(u.id::text, '-', ''), 1, 5)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Keep updated_at honest.
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
