-- migrate:up

-- Onboarding answers, saved as the person goes so they survive reloads and other devices.
-- Finishing sets the label up from them (profile, country, and how much agents may do, never
-- more than each department allows). Only the label's owner and team see them.
CREATE TABLE onboarding (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  answers       jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES users(id),
  completed_at  timestamptz,
  completed_by  uuid REFERENCES users(id)
);
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_team ON onboarding FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT, UPDATE ON onboarding TO br_app;
-- Finishing onboarding sets the label's profile and country.
GRANT INSERT, UPDATE (country, profile) ON label_settings TO br_app;
GRANT INSERT (tenant_id, statement_period, spend_cap_cents) ON label_settings TO br_app;

-- migrate:down
REVOKE INSERT, UPDATE ON label_settings FROM br_app;
DROP TABLE IF EXISTS onboarding;
