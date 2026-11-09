-- migrate:up

-- Label services and bands.
--  * Every new workspace starts with the same defaults (departments, approval routing,
--    integrations, settings): app_workspace_defaults, shared by sign-up and client workspaces.
--  * Label services: finishing onboarding as "Label services" makes the workspace a licensee
--    (a parent of other workspaces). Its owners add clients: each client is its own workspace
--    under it (an artist or a label), separate from every other client. The services team's
--    owners act as owners inside each client (app_role, since licensee_owners); the client's
--    own people are invited into it the usual way.

CREATE OR REPLACE FUNCTION app_workspace_defaults(t uuid, profile_ text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents) VALUES (t, 'US', profile_, 'Quarterly', 0);
  INSERT INTO approval_routes (tenant_id, type, label, rule, approver, cap_cents, position) VALUES
    (t, 'money', 'Money', 'Payouts, refunds, spend over cap', 'Owner', 0, 0),
    (t, 'signature', 'Signature', 'Any agreement. Never bulk-approved.', 'Owner', NULL, 1),
    (t, 'filing', 'Filing', 'PRO, MLC, SoundExchange, copyright', 'Owner', NULL, 2),
    (t, 'public', 'Public', 'Posts, pitches, press (Phase 2)', 'Owner', NULL, 3),
    (t, 'plan', 'Plan', 'New goals and budget changes', 'Owner', 25000, 4);
  INSERT INTO integrations (tenant_id, slug, name, abbr, state, status, arrives_with, position) VALUES
    (t, 'distributor', 'Distributor', 'DS', 'off', 'Not connected', 'Stage 1', 0),
    (t, 'pro', 'PRO', 'PRO', 'off', 'Not connected', 'Stage 1', 1),
    (t, 'soundexchange', 'SoundExchange', 'SX', 'off', 'Not connected', 'Stage 1', 2),
    (t, 'payouts', 'Payouts', '$', 'off', 'Not connected', 'Stage 3 (Trolley)', 3),
    (t, 'esign', 'E-signature', 'SIG', 'off', 'Not connected', 'Stage 2 (Dropbox Sign)', 4);
  INSERT INTO departments (tenant_id, slug, name, agent, phase, autonomy, can_act, act_note, spend_cap_cents, state, tasks_this_week, position) VALUES
    (t, 'release', 'Release', 'Release Agent', 1, 'draft_and_wait', true, 'it can book routine runbook tasks and chase missing assets on its own. Spend still comes to you.', 0, 'idle', 0, 0),
    (t, 'distribution', 'Distribution', 'Distribution Agent', 1, 'draft_and_wait', true, 'it can fix store metadata and re-deliver rejected files on its own.', 0, 'idle', 0, 1),
    (t, 'metadata', 'Metadata', 'Metadata Agent', 1, 'draft_and_wait', true, 'it can complete credits and fix metadata typos on its own.', 0, 'idle', 0, 2),
    (t, 'legal', 'Legal', 'Legal Agent', 1, 'draft_and_wait', false, 'Legal work is signatures, so it always waits for you.', 0, 'idle', 0, 3),
    (t, 'royalties', 'Royalties', 'Royalties Agent', 1, 'draft_and_wait', true, 'it can match statement lines and fix metadata typos on its own. Payouts still come to you.', 0, 'idle', 0, 4),
    (t, 'finance', 'Finance', 'Finance Agent', 1, 'suggest', false, 'Finance moves money, so it always waits for you.', 0, 'idle', 0, 5),
    (t, 'publishing', 'Publishing', 'Publishing Agent', 1, 'draft_and_wait', false, 'Publishing work is filings, so it always waits for you.', 0, 'idle', 0, 6),
    (t, 'rights', 'Rights', 'Rights Agent', 1, 'draft_and_wait', false, 'Rights work is filings, so it always waits for you.', 0, 'idle', 0, 7),
    (t, 'funding', 'Funding', 'Funding Scout', 1, 'draft_and_wait', true, 'it can research and dismiss poor-fit grants on its own. Applications still come to you.', 0, 'idle', 0, 8),
    (t, 'marketing', 'Marketing', NULL, 2, NULL, false, '', NULL, 'later', NULL, 9),
    (t, 'press', 'Press and radio', NULL, 2, NULL, false, '', NULL, 'later', NULL, 10),
    (t, 'content', 'Content studio', NULL, 2, NULL, false, '', NULL, 'later', NULL, 11);
END $$;

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

/** Finishing onboarding names the workspace and sets its kind (owners only). */
CREATE OR REPLACE FUNCTION app_apply_onboarding(name_ text, profile_ text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_current_tenant() IS NULL OR app_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the workspace''s owners finish its setup' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET
    name = CASE WHEN length(btrim(coalesce(name_, ''))) > 0 THEN btrim(name_) ELSE name END,
    -- Label services run other people's workspaces, so they become a parent (licensee). A
    -- client workspace (one with a parent) can't become a parent itself.
    kind = CASE
      WHEN kind = 'licensee' THEN kind
      WHEN profile_ = 'services' THEN CASE WHEN parent_id IS NULL THEN 'licensee'::tenant_kind ELSE kind END
      WHEN profile_ IN ('solo', 'band') THEN 'artist'::tenant_kind
      ELSE 'label'::tenant_kind END
  WHERE id = app_current_tenant();
END $$;

/** A services workspace's owners add a client: its own workspace under theirs. */
CREATE FUNCTION app_create_client(name_ text, kind_ text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE parent tenants; t uuid;
BEGIN
  SELECT * INTO parent FROM tenants WHERE id = app_current_tenant();
  IF NOT FOUND OR parent.kind <> 'licensee'
     OR NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app_user() AND m.tenant_id = parent.id AND m.role = 'owner') THEN
    RAISE EXCEPTION 'only the owners of a label services workspace add clients' USING ERRCODE = '42501';
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

/** The current services workspace's clients, for its owners. */
CREATE FUNCTION app_clients() RETURNS TABLE (id uuid, name text, kind text, created_at timestamptz, artists integer, people integer)
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

REVOKE EXECUTE ON FUNCTION app_workspace_defaults(uuid, text), app_create_client(text, text), app_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_client(text, text), app_clients() TO br_app;
-- app_workspace_defaults is only called from the functions above (as their owner), never by the app.
REVOKE EXECUTE ON FUNCTION app_workspace_defaults(uuid, text) FROM br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_clients(), app_create_client(text, text);
CREATE OR REPLACE FUNCTION app_apply_onboarding(name_ text, profile_ text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_current_tenant() IS NULL OR app_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the workspace''s owners finish its setup' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET
    name = CASE WHEN length(btrim(coalesce(name_, ''))) > 0 THEN btrim(name_) ELSE name END,
    kind = CASE WHEN kind = 'licensee' THEN kind WHEN profile_ IN ('solo', 'band') THEN 'artist'::tenant_kind ELSE 'label'::tenant_kind END
  WHERE id = app_current_tenant();
END $$;
-- app_create_workspace keeps calling app_workspace_defaults, so the defaults function stays.
