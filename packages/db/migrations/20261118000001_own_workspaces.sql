-- migrate:up

-- Everyone runs their own workspace.
--  * Someone invited only to be paid (an artist, a writer, a producer) gets their own
--    workspace on their first sign-in, as someone who signed up with a code does. They set it
--    up (artist, band, label or label services) and own it, with every tool. The label that
--    invited them stays a connection: in that label they are still a payee and see only what
--    their deal covers (their statements, splits, payouts and tax form), never its catalog.
--  * Co-owners and team members join the inviter's workspace. Anyone signed in can start a
--    workspace of their own (app_start_workspace).
--  * The inviting label never sees inside the new workspace.

/** Makes a workspace owned by `u`, with the defaults every workspace starts with. Internal. */
CREATE FUNCTION app_open_workspace(u uuid, data_ jsonb) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid; em text;
BEGIN
  SELECT email INTO em FROM users WHERE id = u;
  IF em IS NULL THEN RAISE EXCEPTION 'no such user' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO tenants (slug, name, kind, signup)
    VALUES (left(regexp_replace(lower(split_part(em, '@', 1)), '[^a-z0-9]+', '-', 'g'), 40) || '-' || substr(md5(random()::text), 1, 6), 'My workspace', 'artist', true)
    RETURNING id INTO t;
  INSERT INTO memberships (user_id, tenant_id, role) VALUES (u, t, 'owner');
  PERFORM app_workspace_defaults(t, 'Not set');
  INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (t, 'AUD-SGN-' || upper(substr(md5(random()::text), 1, 8)), u, 'workspace.created', em, data_);
  RETURN t;
END $$;

/**
 * On every sign-in, after invitations are claimed: the person's own workspace, made once, if
 * they signed up with a code or were invited only as a payee. Returns it, or null.
 */
CREATE OR REPLACE FUNCTION app_create_workspace(u uuid) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE s signups; t uuid; em text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('workspace:' || u::text));
  SELECT email INTO em FROM users WHERE id = u;
  SELECT * INTO s FROM signups WHERE email = em FOR UPDATE;
  IF FOUND THEN
    IF s.tenant_id IS NOT NULL THEN RETURN s.tenant_id; END IF;
    t := app_open_workspace(u, jsonb_build_object('code', (SELECT hint FROM invite_codes WHERE id = s.code_id)));
    UPDATE signups SET tenant_id = t WHERE email = em;
    RETURN t;
  END IF;
  IF EXISTS (SELECT 1 FROM memberships WHERE user_id = u AND role IN ('owner', 'team')) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = u AND role = 'payee') THEN RETURN NULL; END IF;
  RETURN app_open_workspace(u, jsonb_build_object('via', 'invitation'));
END $$;

/** Anyone signed in starts a workspace of their own (up to 10 they started). */
CREATE FUNCTION app_start_workspace() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_user() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('workspace:' || app_user()::text));
  IF (SELECT count(*) FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = app_user() AND m.role = 'owner' AND t.signup) >= 10 THEN
    RAISE EXCEPTION 'you already run 10 workspaces you started' USING ERRCODE = '22023';
  END IF;
  RETURN app_open_workspace(app_user(), jsonb_build_object('via', 'started'));
END $$;

REVOKE EXECUTE ON FUNCTION app_open_workspace(uuid, jsonb) FROM PUBLIC, br_app;
REVOKE EXECUTE ON FUNCTION app_start_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_start_workspace() TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_start_workspace();
CREATE OR REPLACE FUNCTION app_create_workspace(u uuid) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE s signups; t uuid; em text;
BEGIN
  SELECT email INTO em FROM users WHERE id = u;
  SELECT * INTO s FROM signups WHERE email = em FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.tenant_id IS NOT NULL THEN RETURN s.tenant_id; END IF;
  INSERT INTO tenants (slug, name, kind, signup)
    VALUES (left(regexp_replace(lower(split_part(em, '@', 1)), '[^a-z0-9]+', '-', 'g'), 40) || '-' || substr(md5(random()::text), 1, 6), 'My workspace', 'artist', true)
    RETURNING id INTO t;
  INSERT INTO memberships (user_id, tenant_id, role) VALUES (u, t, 'owner');
  PERFORM app_workspace_defaults(t, 'Not set');
  UPDATE signups SET tenant_id = t WHERE email = em;
  INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (t, 'AUD-SGN-' || upper(substr(md5(random()::text), 1, 8)), u, 'workspace.created', em, jsonb_build_object('code', (SELECT hint FROM invite_codes WHERE id = s.code_id)));
  RETURN t;
END $$;
DROP FUNCTION IF EXISTS app_open_workspace(uuid, jsonb);
