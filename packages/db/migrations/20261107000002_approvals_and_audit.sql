-- migrate:up

-- Approvals (flows.md): anything that moves money, signs, files or speaks publicly.
-- Agent-prepared items and in-app proposals share one table; `origin` tells them apart.
-- `detail` freezes what the person was shown (evidence and body) when it was prepared.
CREATE TYPE approval_type AS ENUM ('money', 'signature', 'filing', 'public', 'plan');
CREATE TYPE approval_risk AS ENUM ('low', 'dueSoon', 'needsEyes', 'blocked');
CREATE TYPE approval_origin AS ENUM ('agent', 'user');
CREATE TYPE decision_status AS ENUM ('approved', 'rejected');

CREATE TABLE approvals (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id          text NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
  origin      approval_origin NOT NULL,
  type        approval_type NOT NULL,
  title       text NOT NULL,
  agent       text NOT NULL,
  due         text NOT NULL,          -- v1 display ("Nov 10"); due_on is the real date
  due_on      date,
  impact      text NOT NULL,
  risk        approval_risk NOT NULL,
  context     text,
  risk_label  text,
  href        text CHECK (href LIKE '/%'),
  release_id  text,
  new_date    date,
  artists     text[],
  releases    text[],
  dept        text,
  detail      jsonb,
  executed_at timestamptz,            -- set by the tool that carries it out; ends undo
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE approval_decisions (
  tenant_id   uuid NOT NULL,
  approval_id text NOT NULL,
  status      decision_status NOT NULL,
  reason      text CHECK (status = 'approved' OR length(btrim(reason)) > 0),
  decided_by  uuid REFERENCES users(id),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  audit_id    text NOT NULL,
  PRIMARY KEY (tenant_id, approval_id),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id) ON DELETE CASCADE
);

-- Append-only record of every decision, undo and proposal (strategy: audit log).
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  audit_id    text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       uuid REFERENCES users(id),
  kind        text NOT NULL,
  ref         text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_events_tenant_at ON audit_events (tenant_id, at DESC);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY approvals_tenant ON approvals FOR ALL TO br_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
-- Payees never see or decide the label's approvals.
CREATE POLICY decisions_tenant ON approval_decisions FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team') AND decided_by = app_user());
CREATE POLICY audit_read ON audit_events FOR SELECT TO br_app USING (tenant_id = app_current_tenant());
CREATE POLICY audit_write ON audit_events FOR INSERT TO br_app
  WITH CHECK (tenant_id = app_current_tenant() AND actor = app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON approvals, approval_decisions TO br_app;
GRANT SELECT, INSERT ON audit_events TO br_app;          -- no UPDATE or DELETE: append-only
GRANT USAGE ON SEQUENCE audit_events_id_seq TO br_app;

-- migrate:down
DROP TABLE IF EXISTS audit_events, approval_decisions, approvals;
DROP TYPE IF EXISTS decision_status, approval_origin, approval_risk, approval_type;
