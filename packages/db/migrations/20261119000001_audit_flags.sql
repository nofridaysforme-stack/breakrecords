-- migrate:up

-- Audit flags: something the Audit Agent (or a person) raised about a recording, such as an
-- unusual stream spike. While a flag is open, the approval checks keep that recording's income
-- out of payouts (rule ROY-07). Resolving a flag is recorded, never deleted.
CREATE TABLE audit_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recording_id  uuid NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('stream_spike', 'other')),
  note          text NOT NULL CHECK (length(btrim(note)) > 0),
  event_id      text,                                  -- the agent event that raised it
  opened_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES users(id),
  resolution    text CHECK (resolution IS NULL OR length(btrim(resolution)) > 0),
  CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);
CREATE INDEX audit_flags_open ON audit_flags (tenant_id, recording_id) WHERE resolved_at IS NULL;

ALTER TABLE audit_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_flags_team ON audit_flags FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT ON audit_flags TO br_app;
GRANT UPDATE (resolved_at, resolved_by, resolution) ON audit_flags TO br_app;

-- migrate:down
DROP TABLE IF EXISTS audit_flags;
