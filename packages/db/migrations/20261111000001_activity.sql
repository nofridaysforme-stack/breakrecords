-- migrate:up

-- Departments (5f) and the activity log (5g).
--  * departments: each one's agent, how much it may do alone (autonomy), its monthly spend
--    cap and the person it's handed to. Whether "Act within limits" is allowed at all is a
--    platform rule (`can_act`): departments whose work is money, signatures or filings never
--    act alone, and the database refuses it. The app may change only autonomy and person.
--    State and this week's task count are reported by the agents (Stage 4).
--  * agent events: what agents did (runs, flags, errors, tool calls), with their inputs,
--    reasoning and output. Append-only. The activity log is these plus the audit log of what
--    people did in the app.
--  * a team member's title ("Rights lead") on their membership.
-- Only the label's owner and team see any of it.

CREATE TYPE dept_state AS ENUM ('idle', 'working', 'waitingOnYou', 'blocked', 'done', 'later');
CREATE TYPE autonomy_level AS ENUM ('observe', 'suggest', 'draft_and_wait', 'act_within_limits');
CREATE TYPE activity_kind AS ENUM ('Agent run', 'Flag', 'Error', 'Approval', 'Tool call', 'Edit');

ALTER TABLE memberships ADD COLUMN title text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 60);

CREATE TABLE departments (
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug             text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name             text NOT NULL,
  agent            text,                -- null until the department is active
  phase            smallint NOT NULL CHECK (phase IN (1, 2)),
  autonomy         autonomy_level,
  can_act          boolean NOT NULL DEFAULT false,
  act_note         text NOT NULL DEFAULT '',
  spend_cap_cents  bigint CHECK (spend_cap_cents >= 0),
  person_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  state            dept_state NOT NULL DEFAULT 'idle',
  tasks_this_week  integer CHECK (tasks_this_week >= 0),
  position         smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, slug),
  CHECK (autonomy IS DISTINCT FROM 'act_within_limits' OR can_act),
  CHECK ((phase = 2) = (autonomy IS NULL)),
  CHECK (phase = 1 OR state = 'later')
);

-- A department can only be handed to someone on the label's team.
CREATE FUNCTION department_person_on_team() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = NEW.person_id AND m.tenant_id = NEW.tenant_id AND m.role IN ('owner', 'team')
  ) THEN
    RAISE EXCEPTION 'that person isn''t on this label''s team' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER departments_person_on_team BEFORE INSERT OR UPDATE OF person_id ON departments FOR EACH ROW EXECUTE FUNCTION department_person_on_team();

CREATE TABLE agent_events (
  id           text NOT NULL CHECK (id ~ '^[A-Z]+-[0-9A-Z-]+$'),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  occurred_at  timestamptz NOT NULL,
  kind         activity_kind NOT NULL,
  text         text NOT NULL,
  who          text NOT NULL,          -- the agent, or a person for history brought over
  dept         text NOT NULL,
  inputs       text[] NOT NULL DEFAULT '{}',
  reasoning    text NOT NULL DEFAULT '',
  output       text NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX agent_events_recent ON agent_events (tenant_id, occurred_at DESC);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_team ON departments FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY agent_events_team ON agent_events FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, UPDATE (autonomy, person_id) ON departments TO br_app;
GRANT SELECT, INSERT ON agent_events TO br_app;

-- The team list: a member sees the other members of the tenant they're working in.
CREATE FUNCTION app_team() RETURNS TABLE (user_id uuid, name text, email text, role member_role, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, u.name, u.email, m.role, m.title FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = app_current_tenant() AND m.role IN ('owner', 'team') AND app_role() IN ('owner', 'team')
  ORDER BY (m.role = 'owner') DESC, m.created_at, u.email
$$;
GRANT EXECUTE ON FUNCTION app_team() TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_team();
DROP TABLE IF EXISTS agent_events, departments;
DROP FUNCTION IF EXISTS department_person_on_team();
ALTER TABLE memberships DROP COLUMN IF EXISTS title;
DROP TYPE IF EXISTS activity_kind, autonomy_level, dept_state;
