-- migrate:up

-- Setup that tells the truth and doesn't undo your choices.
--  * Every top-level workspace can add clients (not only label services); a client workspace
--    can't have clients of its own. Label services still become a licensee during setup.
--  * label_settings.default_autonomy: the level chosen in setup. Re-running setup changes only
--    the departments still on the old default; the ones you set yourself keep their level.
--  * label_settings.publishing_mode: who owns or administers the songs (the songwriting step),
--    which decides what a filing may claim (rule PUB-02). Each writer can override it.
ALTER TABLE label_settings
  ADD COLUMN default_autonomy autonomy_level,
  ADD COLUMN publishing_mode text CHECK (publishing_mode IN ('self', 'publisher', 'we_publish', 'we_administer', 'writers_own'));
ALTER TABLE parties
  ADD COLUMN publishing_mode text CHECK (publishing_mode IN ('self', 'publisher', 'we_publish', 'we_administer', 'writers_own'));

CREATE OR REPLACE FUNCTION app_create_client(name_ text, kind_ text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE parent tenants; t uuid;
BEGIN
  SELECT * INTO parent FROM tenants WHERE id = app_current_tenant();
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = parent.id AND m.role = 'owner') THEN
    RAISE EXCEPTION 'only the workspace''s owners add clients' USING ERRCODE = '42501';
  END IF;
  IF parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'a client workspace can''t have clients of its own' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(name_, ''))) = 0 THEN RAISE EXCEPTION 'a client needs a name' USING ERRCODE = '22023'; END IF;
  IF kind_ NOT IN ('artist', 'label') THEN RAISE EXCEPTION 'a client is an artist or a label' USING ERRCODE = '22023'; END IF;
  INSERT INTO tenants (slug, name, kind, parent_id, country)
    VALUES (left(regexp_replace(lower(btrim(name_)), '[^a-z0-9]+', '-', 'g'), 40) || '-' || substr(md5(random()::text), 1, 6), btrim(name_), kind_::tenant_kind, parent.id, parent.country)
    RETURNING id INTO t;
  PERFORM app_workspace_defaults(t, CASE kind_ WHEN 'artist' THEN 'Client artist' ELSE 'Client label' END);
  INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (parent.id, 'AUD-CLI-' || upper(substr(md5(random()::text), 1, 8)), app_user(), 'client.created', btrim(name_), jsonb_build_object('kind', kind_));
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION app_clients() RETURNS TABLE (id uuid, name text, kind text, created_at timestamptz, artists integer, people integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.kind::text, c.created_at,
         (SELECT count(*)::int FROM roster_members r WHERE r.tenant_id = c.id),
         (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = c.id) + (SELECT count(*)::int FROM allowlist a WHERE a.tenant_id = c.id
            AND NOT EXISTS (SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = a.email AND m.tenant_id = c.id))
  FROM tenants c
  WHERE c.parent_id = app_current_tenant()
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = c.parent_id AND m.role = 'owner')
  ORDER BY c.created_at, c.name
$$;

GRANT UPDATE (default_autonomy, publishing_mode) ON label_settings TO br_app;
GRANT INSERT (default_autonomy, publishing_mode) ON label_settings TO br_app;

REVOKE EXECUTE ON FUNCTION app_create_client(text, text), app_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_client(text, text), app_clients() TO br_app;

-- migrate:down
CREATE OR REPLACE FUNCTION app_clients() RETURNS TABLE (id uuid, name text, kind text, created_at timestamptz, artists integer, people integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.kind::text, c.created_at,
         (SELECT count(*)::int FROM roster_members r WHERE r.tenant_id = c.id),
         (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = c.id) + (SELECT count(*)::int FROM allowlist a WHERE a.tenant_id = c.id
            AND NOT EXISTS (SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = a.email AND m.tenant_id = c.id))
  FROM tenants c
  WHERE c.parent_id = app_current_tenant()
    AND EXISTS (SELECT 1 FROM tenants p WHERE p.id = c.parent_id AND p.kind = 'licensee')
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = c.parent_id AND m.role = 'owner')
  ORDER BY c.created_at, c.name
$$;
ALTER TABLE parties DROP COLUMN IF EXISTS publishing_mode;
ALTER TABLE label_settings DROP COLUMN IF EXISTS publishing_mode, DROP COLUMN IF EXISTS default_autonomy;
