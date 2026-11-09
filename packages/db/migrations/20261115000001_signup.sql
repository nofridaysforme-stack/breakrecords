-- migrate:up

-- Sign-up with invite codes. Anyone with a valid code signs up at the app's address with
-- their email; their first sign-in creates their own workspace (they are its owner) and
-- sends them through onboarding, which names it and picks its profile.
--  * platform_admins: who makes invite codes (Indie SRVCS staff), by email.
--  * invite_codes: stored as a hash; the code itself is shown once, when it's made. Each has
--    a number of uses, an optional expiry, and can be revoked.
--  * signups: an email that redeemed a code, and the workspace it led to.
-- None of these tables is readable by the app role; everything goes through the functions
-- below, which check who is asking.

ALTER TABLE tenants ADD COLUMN signup boolean NOT NULL DEFAULT false;   -- made by self sign-up

CREATE TABLE platform_admins (
  email       text PRIMARY KEY CHECK (email = lower(email)),
  added_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invite_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   text UNIQUE NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  hint        text NOT NULL,                       -- the code's last 4 characters, to tell codes apart
  note        text NOT NULL CHECK (length(btrim(note)) > 0),
  max_uses    integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000),
  uses        integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE signups (
  email       text PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
  code_id     uuid NOT NULL REFERENCES invite_codes(id),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;
-- No policies and no grants: only the SECURITY DEFINER functions below touch them.

CREATE FUNCTION app_is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins a JOIN users u ON u.email = a.email WHERE u.id = app_user())
$$;

/** Staff make a code. The app hashes it; the code is never stored. */
CREATE FUNCTION app_create_invite_code(h text, hint_ text, note_ text, max_uses_ integer, expires timestamptz) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE id_ uuid;
BEGIN
  IF NOT app_is_platform_admin() THEN RAISE EXCEPTION 'only Indie SRVCS staff make invite codes' USING ERRCODE = '42501'; END IF;
  INSERT INTO invite_codes (code_hash, hint, note, max_uses, expires_at, created_by) VALUES (h, hint_, note_, max_uses_, expires, app_user()) RETURNING id INTO id_;
  RETURN id_;
END $$;

CREATE FUNCTION app_invite_codes() RETURNS TABLE (id uuid, hint text, note text, max_uses integer, uses integer, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz, signed_up text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.hint, c.note, c.max_uses, c.uses, c.expires_at, c.revoked_at, c.created_at,
         coalesce((SELECT array_agg(s.email ORDER BY s.created_at) FROM signups s WHERE s.code_id = c.id), '{}')
  FROM invite_codes c WHERE app_is_platform_admin() ORDER BY c.created_at DESC
$$;

CREATE FUNCTION app_revoke_invite_code(id_ uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_platform_admin() THEN RAISE EXCEPTION 'only Indie SRVCS staff revoke invite codes' USING ERRCODE = '42501'; END IF;
  UPDATE invite_codes SET revoked_at = coalesce(revoked_at, now()) WHERE id = id_;
  RETURN FOUND;
END $$;

/**
 * Someone signing up with a code (before they're signed in). Returns 'ok', 'invalid',
 * 'expired', 'used_up' or 'already' (the email can already sign in). One use per email.
 */
CREATE FUNCTION app_redeem_invite(h text, e text) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE c invite_codes; em text := lower(btrim(e));
BEGIN
  IF EXISTS (SELECT 1 FROM signups WHERE email = em) OR EXISTS (SELECT 1 FROM allowlist WHERE email = em)
     OR EXISTS (SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = em) THEN
    RETURN 'already';
  END IF;
  SELECT * INTO c FROM invite_codes WHERE code_hash = h FOR UPDATE;
  IF NOT FOUND OR c.revoked_at IS NOT NULL THEN RETURN 'invalid'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RETURN 'expired'; END IF;
  IF c.uses >= c.max_uses THEN RETURN 'used_up'; END IF;
  UPDATE invite_codes SET uses = uses + 1 WHERE id = c.id;
  INSERT INTO signups (email, code_id) VALUES (em, c.id);
  RETURN 'ok';
END $$;

-- An email may sign in if it's on a label's allowlist (as before) or has signed up with a code.
CREATE OR REPLACE FUNCTION app_may_sign_in(e text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT (EXISTS (SELECT 1 FROM allowlist WHERE email = lower(e)) OR EXISTS (SELECT 1 FROM signups WHERE email = lower(e)))
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = lower(e) AND NOT active)
$$;

/**
 * On a signed-up person's first sign-in: their own workspace, with them as owner and the
 * defaults every workspace starts with. Does nothing if it already exists. Returns its id.
 */
CREATE FUNCTION app_create_workspace(u uuid) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents) VALUES (t, 'US', 'Not set', 'Quarterly', 0);
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
  UPDATE signups SET tenant_id = t WHERE email = em;
  INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (t, 'AUD-SGN-' || upper(substr(md5(random()::text), 1, 8)), u, 'workspace.created', em, jsonb_build_object('code', (SELECT hint FROM invite_codes WHERE id = s.code_id)));
  RETURN t;
END $$;

/** Finishing onboarding names the workspace and sets what kind it is (owners only). */
CREATE FUNCTION app_apply_onboarding(name_ text, profile_ text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_current_tenant() IS NULL OR app_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the workspace''s owners finish its setup' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET
    name = CASE WHEN length(btrim(coalesce(name_, ''))) > 0 THEN btrim(name_) ELSE name END,
    -- A licensee stays one; anyone else is an artist workspace (solo, band) or a label.
    kind = CASE WHEN kind = 'licensee' THEN kind WHEN profile_ IN ('solo', 'band') THEN 'artist'::tenant_kind ELSE 'label'::tenant_kind END
  WHERE id = app_current_tenant();
END $$;

/** Whether this workspace was made by sign-up and hasn't finished onboarding yet. */
CREATE FUNCTION app_needs_onboarding() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM tenants t WHERE t.id = app_current_tenant() AND t.signup)
     AND NOT EXISTS (SELECT 1 FROM onboarding o WHERE o.tenant_id = app_current_tenant() AND o.completed_at IS NOT NULL)
$$;

REVOKE EXECUTE ON FUNCTION app_is_platform_admin(), app_create_invite_code(text, text, text, integer, timestamptz), app_invite_codes(),
  app_revoke_invite_code(uuid), app_redeem_invite(text, text), app_create_workspace(uuid), app_apply_onboarding(text, text), app_needs_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_platform_admin(), app_create_invite_code(text, text, text, integer, timestamptz), app_invite_codes(),
  app_revoke_invite_code(uuid), app_redeem_invite(text, text), app_create_workspace(uuid), app_apply_onboarding(text, text), app_needs_onboarding() TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_needs_onboarding(), app_apply_onboarding(text, text), app_create_workspace(uuid), app_redeem_invite(text, text),
  app_revoke_invite_code(uuid), app_invite_codes(), app_create_invite_code(text, text, text, integer, timestamptz), app_is_platform_admin();
CREATE OR REPLACE FUNCTION app_may_sign_in(e text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM allowlist WHERE email = lower(e))
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = lower(e) AND NOT active)
$$;
DROP TABLE IF EXISTS signups, invite_codes, platform_admins;
ALTER TABLE tenants DROP COLUMN IF EXISTS signup;
