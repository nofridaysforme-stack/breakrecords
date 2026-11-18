-- migrate:up

-- Agents (Stage 4, rules first). Each run looks at the label's own data and records what it finds.
--  * agent_findings: one row per thing an agent noticed, by a stable key, so a daily run never
--    reports the same thing twice. Open until the run no longer sees it (resolved) or a person
--    dismisses it. Never deleted.
--  * agent_runs: when the agents ran, who or what started it, and what changed.
--  * Agents report their department's state and this week's count.
-- Only the label's owner and team see any of it.

CREATE TYPE finding_status AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE run_trigger AS ENUM ('schedule', 'manual');

CREATE TABLE agent_findings (
  tenant_id    uuid NOT NULL,
  key          text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9:_.-]{2,199}$'),
  dept         text NOT NULL,
  rule         text NOT NULL CHECK (rule ~ '^[A-Z]{3}-[0-9]{2}$'),
  status       finding_status NOT NULL DEFAULT 'open',
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  detail       text NOT NULL DEFAULT '',
  href         text CHECK (href LIKE '/%'),
  approval_id  text,                  -- the card it put in Approvals, if any
  fixed        boolean NOT NULL DEFAULT false,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  dismiss_note text CHECK (dismiss_note IS NULL OR length(btrim(dismiss_note)) BETWEEN 1 AND 300),
  PRIMARY KEY (tenant_id, key),
  FOREIGN KEY (tenant_id, dept) REFERENCES departments(tenant_id, slug) ON DELETE CASCADE,
  CHECK ((status = 'open') = (closed_at IS NULL)),
  CHECK (status <> 'dismissed' OR dismiss_note IS NOT NULL)
);
CREATE INDEX agent_findings_open ON agent_findings (tenant_id, dept) WHERE status = 'open';

CREATE TABLE agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger      run_trigger NOT NULL,
  started_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  found        integer NOT NULL DEFAULT 0 CHECK (found >= 0),
  closed       integer NOT NULL DEFAULT 0 CHECK (closed >= 0),
  proposed     integer NOT NULL DEFAULT 0 CHECK (proposed >= 0),
  fixed        integer NOT NULL DEFAULT 0 CHECK (fixed >= 0),
  error        text
);
CREATE INDEX agent_runs_recent ON agent_runs (tenant_id, started_at DESC);

-- A finding that was closed stays closed: only an open one changes (and a dismissed one can't reopen).
CREATE FUNCTION agent_finding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'dismissed' AND NEW.status <> 'dismissed' THEN RAISE EXCEPTION 'a dismissed finding stays dismissed'; END IF;
  IF (NEW.key, NEW.dept, NEW.rule, NEW.first_seen) IS DISTINCT FROM (OLD.key, OLD.dept, OLD.rule, OLD.first_seen) THEN
    RAISE EXCEPTION 'a finding''s key, department, rule and first sighting never change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_finding_guard BEFORE UPDATE ON agent_findings FOR EACH ROW EXECUTE FUNCTION agent_finding_guard();

ALTER TABLE agent_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_findings_team ON agent_findings FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY agent_runs_team ON agent_runs FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT, UPDATE ON agent_findings, agent_runs TO br_app;   -- no DELETE: history stays
GRANT UPDATE (state, tasks_this_week) ON departments TO br_app;

-- Workspaces made before these agents had departments get the two that were missing.
INSERT INTO departments (tenant_id, slug, name, agent, phase, autonomy, can_act, act_note, spend_cap_cents, state, tasks_this_week, position)
SELECT t.id, d.slug, d.name, d.agent, 1, d.autonomy::autonomy_level, d.can_act, d.note, 0, 'idle', 0, d.pos
FROM tenants t
JOIN (VALUES
  ('audit', 'Audit', 'Audit Agent', 'observe', true, 'it can open and close its own checks. It never holds money on its own.', 9),
  ('artist-relations', 'Artist relations', 'Roster Agent', 'suggest', true, 'it can send routine reminders to artists on its own.', 9)
) AS d(slug, name, agent, autonomy, can_act, note, pos) ON true
WHERE EXISTS (SELECT 1 FROM departments x WHERE x.tenant_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM departments x WHERE x.tenant_id = t.id AND x.slug = d.slug);

-- The scheduled run: every workspace with departments, with an owner the run acts for (row-level
-- security needs one). Returns ids and the workspace's name. Only the app's server role may call it.
CREATE FUNCTION app_agent_tenants() RETURNS TABLE (tenant_id uuid, user_id uuid, name text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (t.id) t.id, m.user_id, t.name, t.kind::text
  FROM tenants t JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
  WHERE EXISTS (SELECT 1 FROM departments d WHERE d.tenant_id = t.id)
  ORDER BY t.id, m.created_at
$$;
REVOKE ALL ON FUNCTION app_agent_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_agent_tenants() TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_agent_tenants();
REVOKE UPDATE (state, tasks_this_week) ON departments FROM br_app;
DROP TABLE IF EXISTS agent_runs, agent_findings;
DROP FUNCTION IF EXISTS agent_finding_guard();
DROP TYPE IF EXISTS run_trigger, finding_status;
