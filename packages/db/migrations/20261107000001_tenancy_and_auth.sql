-- migrate:up

-- Break Records runs as one multi-tenant platform. A tenant is a licensee (white label),
-- a label, or an artist workspace; a licensee's sub-tenants have parent_id set to it.
-- Tenant isolation is enforced here with row-level security, never only in the app.
--
-- Roles: migrations run as the database owner. The web app connects as br_app, which owns
-- nothing, so every policy below applies to it. Give br_app a password out of band
-- (ALTER ROLE br_app LOGIN PASSWORD '...'); never in a migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'br_app') THEN
    CREATE ROLE br_app NOLOGIN;
  END IF;
END $$;

CREATE TYPE tenant_kind AS ENUM ('licensee', 'label', 'artist');
CREATE TYPE member_role AS ENUM ('owner', 'team', 'payee');

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  kind        tenant_kind NOT NULL,
  parent_id   uuid REFERENCES tenants(id),
  country     char(2) NOT NULL DEFAULT 'US',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Auth.js tables (same shape as the Trading Platform; the Drizzle adapter reads them).
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  name            text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  email_verified  timestamptz,
  image           text
);

CREATE TABLE accounts (
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                text NOT NULL,
  provider            text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token       text,
  access_token        text,
  expires_at          integer,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE sessions (
  session_token text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       timestamptz NOT NULL
);

CREATE TABLE verification_tokens (
  identifier  text NOT NULL,
  token       text NOT NULL,
  expires     timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Who may sign in, and into which tenant with which role. Invite only.
CREATE TABLE allowlist (
  email       text NOT NULL CHECK (email = lower(email)),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        member_role NOT NULL,
  added_by    uuid REFERENCES users(id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, tenant_id)
);

CREATE TABLE memberships (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        member_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

-- ---------- request context ----------
-- Every app request runs in a transaction that sets app.user_id and app.tenant_id
-- (packages/db/src/client.ts, withTenant). Unset means no access.

CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- A user can act in a tenant if they belong to it, or own its licensee (parent).
-- SECURITY DEFINER so it can read memberships without exposing them.
CREATE FUNCTION app_can_access(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = t
  ) OR EXISTS (
    SELECT 1 FROM tenants c JOIN memberships m ON m.tenant_id = c.parent_id
    WHERE c.id = t AND m.user_id = app_user() AND m.role = 'owner'
  )
$$;

-- The current tenant, only when the current user may act in it. Policies use this.
CREATE FUNCTION app_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT CASE WHEN app_can_access(app_tenant()) THEN app_tenant() END $$;

CREATE FUNCTION app_role() RETURNS member_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS
  $$ SELECT role FROM memberships WHERE user_id = app_user() AND tenant_id = app_tenant() $$;

-- ---------- policies ----------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_visible ON tenants FOR SELECT TO br_app USING (app_can_access(id));

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_own ON memberships FOR SELECT TO br_app USING (user_id = app_user());

ALTER TABLE allowlist ENABLE ROW LEVEL SECURITY;
-- Sign-in checks the allowlist before anyone is signed in, through app_may_sign_in() below.
CREATE POLICY allowlist_owners ON allowlist FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'owner')
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() = 'owner');

CREATE FUNCTION app_may_sign_in(e text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM allowlist WHERE email = lower(e))
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = lower(e) AND NOT active)
$$;

-- On first sign-in, turn allowlist entries into memberships.
CREATE FUNCTION app_claim_invites(u uuid) RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO memberships (user_id, tenant_id, role)
    SELECT u, a.tenant_id, a.role FROM allowlist a JOIN users usr ON usr.email = a.email
    WHERE usr.id = u
    ON CONFLICT DO NOTHING RETURNING 1
  ) SELECT count(*)::int FROM ins
$$;

-- Auth tables are read by the adapter before any tenant is set; they hold no tenant data.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, accounts, sessions, verification_tokens TO br_app;
GRANT SELECT ON tenants, memberships TO br_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON allowlist TO br_app;
GRANT EXECUTE ON FUNCTION app_user(), app_tenant(), app_can_access(uuid), app_current_tenant(), app_role(), app_may_sign_in(text), app_claim_invites(uuid) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_claim_invites(uuid), app_may_sign_in(text), app_role(), app_current_tenant(), app_can_access(uuid), app_tenant(), app_user();
DROP TABLE IF EXISTS memberships, allowlist, verification_tokens, sessions, accounts, users, tenants;
DROP TYPE IF EXISTS member_role, tenant_kind;
