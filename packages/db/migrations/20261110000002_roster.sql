-- migrate:up

-- Roster: who the label works with as artists and producers, and in what role. Everything else
-- on a roster card (genre, releases, contract, income, what's open) is read from the catalog,
-- contracts, statements, payouts and releases. Only the label's owner and team see it.

CREATE TABLE roster_members (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id   uuid PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (length(btrim(role)) BETWEEN 1 AND 60),   -- "Solo artist", "Producer and writer"
  position   smallint NOT NULL DEFAULT 0,
  joined_on  date
);

ALTER TABLE roster_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY roster_members_team ON roster_members FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE TRIGGER roster_members_same_tenant BEFORE INSERT OR UPDATE ON roster_members FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();
GRANT SELECT, INSERT, UPDATE, DELETE ON roster_members TO br_app;

-- migrate:down
DROP TABLE IF EXISTS roster_members;
