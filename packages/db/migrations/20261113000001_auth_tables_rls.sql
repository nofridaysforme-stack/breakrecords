-- migrate:up

-- The four Auth.js tables (users, accounts, sessions, verification_tokens) are used by the
-- sign-in adapter before any tenant is set, and hold no tenant data. They were left without
-- row-level security. Supabase now turns RLS on for every new table by itself, which left
-- them with RLS and no policy, so br_app could not write a sign-in token.
-- Make it explicit, the same everywhere: RLS on, and one policy letting br_app (and only
-- br_app) use them as before. Supabase's API roles have no grants on them (lockdown).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'accounts', 'sessions', 'verification_tokens'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_adapter', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO br_app USING (true) WITH CHECK (true)', t || '_adapter', t);
  END LOOP;
END $$;

-- migrate:down
DROP POLICY IF EXISTS users_adapter ON users;
DROP POLICY IF EXISTS accounts_adapter ON accounts;
DROP POLICY IF EXISTS sessions_adapter ON sessions;
DROP POLICY IF EXISTS verification_tokens_adapter ON verification_tokens;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens DISABLE ROW LEVEL SECURITY;
