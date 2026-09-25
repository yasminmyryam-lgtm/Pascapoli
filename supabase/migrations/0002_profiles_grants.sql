-- ============================================================================
-- 0002_profiles_grants
--
-- Newer Supabase projects do not automatically grant table privileges to the
-- API roles, and Postgres checks privileges *before* Row Level Security. With
-- no grant, every request fails with 42501 "permission denied for table
-- profiles" regardless of the RLS policies from 0001.
--
-- Only signed-in players get access. `anon` is deliberately left out: nothing
-- in the app reads profiles before login.
--
-- UPDATE is granted on the `username` column only, so the database itself —
-- not just the UI — guarantees players cannot write any other column. That
-- matters in Phase 2, when coins and XP join this table.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

-- Make PostgREST pick up the new privileges immediately.
notify pgrst, 'reload schema';
