-- migrate:up

-- Settings (5h) and white label (5i).
--  * label settings: country, profile, statement period and the monthly agent spend cap. The
--    minimum payout lives with payouts (payout_policies), so there is one number.
--  * approval routing: who approves each type of item, and over what amount.
--  * integrations and their state. Connecting one needs that partner's account (Stage 1 to 5),
--    so the app records state but never flips it on by itself.
--  * the white-label theme. It belongs to the licensee (Harbor Sound): its labels read it to
--    re-skin the app, and only the licensee's owners may publish it. The database refuses a
--    theme that isn't five valid colors; the server checks every text pair against WCAG AA.

CREATE TYPE integration_state AS ENUM ('ok', 'off', 'err');

CREATE TABLE label_settings (
  tenant_id         uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  country           char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  profile           text NOT NULL,
  statement_period  text NOT NULL,
  spend_cap_cents   bigint NOT NULL CHECK (spend_cap_cents >= 0)
);

CREATE TABLE approval_routes (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       approval_type NOT NULL,
  label      text NOT NULL,
  rule       text NOT NULL,
  approver   text NOT NULL,
  cap_cents  bigint CHECK (cap_cents >= 0),   -- null: every item, whatever the amount
  position   smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, type),
  CHECK (type NOT IN ('signature', 'filing', 'public') OR cap_cents IS NULL)   -- these always need a person
);

CREATE TABLE integrations (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  abbr          text NOT NULL,
  state         integration_state NOT NULL DEFAULT 'off',
  status        text NOT NULL,
  arrives_with  text,                 -- the stage that brings the real connection
  position      smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, slug)
);

CREATE FUNCTION theme_ok(t jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(t) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(t)) = 5
     AND t ?& ARRAY['background', 'surface', 'brand', 'primary', 'text']
     AND (SELECT bool_and(value ~ '^#[0-9a-f]{6}$') FROM jsonb_each_text(t))
$$;

CREATE TABLE white_label (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,   -- the licensee
  domain        text NOT NULL,
  email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+$'),
  dns_status    text NOT NULL,
  theme         jsonb NOT NULL CHECK (theme_ok(theme)),
  published_at  timestamptz,
  published_by  uuid REFERENCES users(id)
);

-- The licensee the current tenant belongs to (itself, if it is one).
CREATE FUNCTION app_licensee() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN t.kind = 'licensee' THEN t.id ELSE t.parent_id END FROM tenants t WHERE t.id = app_current_tenant()
$$;
-- Whether the signed-in user owns that licensee.
CREATE FUNCTION app_owns_licensee() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = app_licensee() AND m.role = 'owner')
$$;
-- The licensee's name (its labels can't read the licensee's tenant row itself).
CREATE FUNCTION app_licensee_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT name FROM tenants WHERE id = app_licensee()
$$;
-- The licensee's labels and how many artists each has on its roster.
CREATE FUNCTION app_sub_tenants() RETURNS TABLE (name text, artists integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, (SELECT count(*)::int FROM roster_members r WHERE r.tenant_id = t.id)
  FROM tenants t WHERE t.parent_id = app_licensee() AND app_role() IN ('owner', 'team') ORDER BY t.created_at, t.name
$$;
GRANT EXECUTE ON FUNCTION app_licensee(), app_licensee_name(), app_owns_licensee(), app_sub_tenants() TO br_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['label_settings', 'approval_routes', 'integrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_team', t);
  END LOOP;
END $$;
GRANT SELECT ON label_settings, approval_routes, integrations TO br_app;

ALTER TABLE white_label ENABLE ROW LEVEL SECURITY;
-- Anyone working in the licensee or one of its labels reads it (it skins their app).
CREATE POLICY white_label_read ON white_label FOR SELECT TO br_app USING (tenant_id = app_licensee());
-- Only the licensee's owners publish.
CREATE POLICY white_label_publish ON white_label FOR UPDATE TO br_app
  USING (tenant_id = app_licensee() AND app_owns_licensee())
  WITH CHECK (tenant_id = app_licensee() AND app_owns_licensee() AND published_by = app_user());
GRANT SELECT, UPDATE (theme, published_at, published_by) ON white_label TO br_app;

-- migrate:down
DROP TABLE IF EXISTS white_label, integrations, approval_routes, label_settings;
DROP FUNCTION IF EXISTS app_sub_tenants(), app_owns_licensee(), app_licensee_name(), app_licensee(), theme_ok(jsonb);
DROP TYPE IF EXISTS integration_state;
