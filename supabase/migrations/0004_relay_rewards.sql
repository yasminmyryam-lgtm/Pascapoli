-- ============================================================================
-- 0004_relay_rewards
--
-- A finished Relay Run credits the original player. The friend posts one row;
-- the sender claims it on their next sign-in. No client policies: only the
-- game server (service role) can insert or mark rows claimed.
-- ============================================================================

create table if not exists public.relay_rewards (
  id         uuid primary key,
  sender_id  uuid not null,
  coins      integer not null default 0,
  diamonds   integer not null default 0,
  chests     integer not null default 0,
  score      integer not null default 0,
  claimed    boolean not null default false,
  created_at timestamptz not null default now(),

  constraint relay_rewards_coins_bounds check (coins >= 0 and coins <= 200000),
  constraint relay_rewards_diamonds_bounds check (diamonds >= 0 and diamonds <= 10000),
  constraint relay_rewards_chests_bounds check (chests >= 0 and chests <= 50),
  constraint relay_rewards_score_bounds check (score >= 0 and score <= 99999)
);

alter table public.relay_rewards enable row level security;

notify pgrst, 'reload schema';
