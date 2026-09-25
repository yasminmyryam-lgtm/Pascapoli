-- ============================================================================
-- 0003_wallets
--
-- Server-authoritative diamond balance used for paid revives (4+). Clients
-- cannot UPDATE this column — only the game server with the service-role key
-- may change diamonds. A one-time seed copies the local save on first contact.
-- ============================================================================

alter table public.profiles
  add column if not exists diamonds integer not null default 0,
  add column if not exists wallet_seeded boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_diamonds_nonneg;

alter table public.profiles
  add constraint profiles_diamonds_nonneg check (diamonds >= 0);

notify pgrst, 'reload schema';
