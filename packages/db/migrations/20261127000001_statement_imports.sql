-- migrate:up

-- Statement imports (Build List P1 #2): a distributor's or society's export, read in the app.
-- A file is imported once (its SHA-256 per workspace); a file covering several months becomes
-- one income statement per month, each reconciling to the cent like any other. Lines whose
-- ISRC is in the catalog are matched on import; the rest wait in the unmatched queue and are
-- never paid until matched.
ALTER TABLE income_statements
  ADD COLUMN provider    text CHECK (provider IS NULL OR length(btrim(provider)) BETWEEN 1 AND 60),
  ADD COLUMN file_name   text CHECK (file_name IS NULL OR length(btrim(file_name)) BETWEEN 1 AND 255),
  ADD COLUMN file_sha256 text CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN imported_by uuid REFERENCES users(id);
-- The same file once per workspace, however many months it covers.
CREATE TABLE statement_files (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_name   text NOT NULL,
  provider    text NOT NULL,
  imported_by uuid REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, file_sha256)
);
ALTER TABLE statement_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_files_team ON statement_files FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT ON statement_files TO br_app;

-- migrate:down
DROP TABLE IF EXISTS statement_files;
ALTER TABLE income_statements DROP COLUMN IF EXISTS imported_by, DROP COLUMN IF EXISTS file_sha256, DROP COLUMN IF EXISTS file_name, DROP COLUMN IF EXISTS provider;
