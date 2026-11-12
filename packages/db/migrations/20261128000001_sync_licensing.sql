-- migrate:up

-- Sync licensing (Build List P1 #6). A brief is a request from a music supervisor or brand.
-- A quote offers one recording for it: one fee covering the master and the song, split by a
-- share. Sending a quote and the client accepting it are recorded; the license itself is a
-- signature, so it only exists once its approval card is approved. When the fee arrives it is
-- recorded as sync income: the master's part on the recording, the song's part on its song,
-- so it reaches payees through the splits like any other income.
CREATE TYPE sync_media AS ENUM ('film', 'tv', 'ad', 'game', 'trailer', 'online', 'other');

CREATE TABLE sync_briefs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  client        text NOT NULL CHECK (length(btrim(client)) BETWEEN 1 AND 200),
  media         sync_media NOT NULL,
  territory     text NOT NULL DEFAULT 'Worldwide' CHECK (length(btrim(territory)) BETWEEN 1 AND 120),
  term          text NOT NULL DEFAULT 'In perpetuity' CHECK (length(btrim(term)) BETWEEN 1 AND 120),
  budget_cents  bigint CHECK (budget_cents >= 0),
  due_on        date,
  notes         text CHECK (notes IS NULL OR length(notes) <= 2000),
  closed_at     timestamptz,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE sync_quotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brief_id      uuid NOT NULL REFERENCES sync_briefs(id) ON DELETE CASCADE,
  recording_id  uuid NOT NULL REFERENCES recordings(id),
  fee_cents     bigint NOT NULL CHECK (fee_cents > 0),
  -- The master's share of the fee; the song gets the rest.
  master_bp     integer NOT NULL DEFAULT 5000 CHECK (master_bp BETWEEN 0 AND 10000),
  use_desc      text NOT NULL CHECK (length(btrim(use_desc)) BETWEEN 1 AND 500),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  approval_id   text,
  statement_id  uuid REFERENCES income_statements(id),
  sent_at       timestamptz,
  decided_at    timestamptz,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (brief_id, recording_id),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  CHECK ((status = 'accepted') = (approval_id IS NOT NULL)),
  CHECK (statement_id IS NULL OR status = 'accepted')
);

-- The terms of a quote change only while it's a draft; payment is recorded only on a signed
-- license, and recording it means the license was carried out (its approval can't be undone).
CREATE FUNCTION sync_quote_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.fee_cents, NEW.master_bp, NEW.use_desc, NEW.recording_id) IS DISTINCT FROM (OLD.fee_cents, OLD.master_bp, OLD.use_desc, OLD.recording_id) THEN
    RAISE EXCEPTION 'a quote that was sent can’t change; make a new one';
  END IF;
  IF OLD.status IN ('accepted', 'declined') AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'this quote was already decided'; END IF;
  IF OLD.statement_id IS NOT NULL AND NEW.statement_id IS DISTINCT FROM OLD.statement_id THEN RAISE EXCEPTION 'this license was already paid'; END IF;
  IF NEW.statement_id IS NOT NULL AND OLD.statement_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = NEW.tenant_id AND d.approval_id = NEW.approval_id AND d.status = 'approved') THEN
      RAISE EXCEPTION 'this license hasn’t been signed (approved) yet';
    END IF;
    UPDATE approvals SET executed_at = coalesce(executed_at, now()) WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_quotes_guard BEFORE UPDATE ON sync_quotes FOR EACH ROW EXECUTE FUNCTION sync_quote_guard();
-- Its brief, recording and income statement all belong to the same workspace.
CREATE FUNCTION sync_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sync_briefs WHERE id = NEW.brief_id AND tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM recordings WHERE id = NEW.recording_id AND tenant_id = NEW.tenant_id)
     OR (NEW.statement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM income_statements WHERE id = NEW.statement_id AND tenant_id = NEW.tenant_id)) THEN
    RAISE EXCEPTION 'cross-tenant reference on sync quote %', NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_quotes_same_tenant BEFORE INSERT OR UPDATE ON sync_quotes FOR EACH ROW EXECUTE FUNCTION sync_same_tenant();

ALTER TABLE sync_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_briefs_team ON sync_briefs FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY sync_quotes_team ON sync_quotes FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT ON sync_briefs, sync_quotes TO br_app;
GRANT UPDATE (closed_at, notes) ON sync_briefs TO br_app;
GRANT UPDATE (fee_cents, master_bp, use_desc, status, approval_id, statement_id, sent_at, decided_at) ON sync_quotes TO br_app;

-- migrate:down
DROP TABLE IF EXISTS sync_quotes;
DROP TABLE IF EXISTS sync_briefs;
DROP FUNCTION IF EXISTS sync_quote_guard();
DROP FUNCTION IF EXISTS sync_same_tenant();
DROP TYPE IF EXISTS sync_media;
