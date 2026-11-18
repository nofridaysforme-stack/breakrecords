-- migrate:up

-- Label Head plans: a goal in plain words, the steps it was built from (the agents' open findings
-- when it was drafted), and the approval that accepted it. A step is done when its finding is no
-- longer open. Kept as approved, never edited or deleted; asking again makes a new plan.
CREATE TABLE plans (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id           text NOT NULL CHECK (id ~ '^plan_[a-z0-9_-]{1,80}$'),
  goal         text NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 200),
  area         text NOT NULL CHECK (area IN ('registrations', 'money', 'release', 'payees', 'catalog', 'everything')),
  title        text NOT NULL,
  steps        jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 15),
  approval_id  text NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_team ON plans FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT ON plans TO br_app;   -- no UPDATE or DELETE: a plan is kept as approved

-- migrate:down
DROP TABLE IF EXISTS plans;
