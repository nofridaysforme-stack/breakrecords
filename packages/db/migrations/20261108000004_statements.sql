-- migrate:up

-- Statements (4b, 4c, portal 4g and 4h). Two kinds of record:
--  * income: what a source (distributor, SoundExchange, MLC, PRO, sync, Bandcamp) reported
--    for a period, one row per statement and one per line. A statement's lines must add up
--    to the total printed on it, to the cent, or the import doesn't commit.
--  * payee statements: what one payee earned in a period, as issued. An issued statement is
--    never edited; a correction is a new statement. Its net must equal the last balance of
--    its waterfall.
-- Owners and team read and match income. A payee reads only their own payee statements.

CREATE TYPE income_source AS ENUM ('distributor', 'soundexchange', 'mlc', 'pro', 'sync', 'bandcamp');

CREATE TABLE income_statements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ref          text NOT NULL CHECK (ref ~ '^[A-Z0-9-]+$'),       -- "DS-1026"
  source       income_source NOT NULL,
  period       date NOT NULL CHECK (extract(day FROM period) = 1),  -- the month it covers
  received_on  date,
  currency     char(3) NOT NULL DEFAULT 'USD',
  total_cents  bigint NOT NULL,                                     -- as printed on the statement
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, ref)
);

-- One reported line. `isrc` and `title` are what the source sent, typos and all. A line is
-- matched when it points at a recording or a song; matching never changes the money.
CREATE TABLE income_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_id  uuid NOT NULL REFERENCES income_statements(id) ON DELETE CASCADE,
  line_no       integer NOT NULL CHECK (line_no > 0),
  title         text NOT NULL,
  isrc          text,
  store         text,
  territory     char(2),
  units         bigint CHECK (units >= 0),
  amount_cents  bigint NOT NULL,
  recording_id  uuid REFERENCES recordings(id) ON DELETE SET NULL,
  work_id       uuid REFERENCES works(id) ON DELETE SET NULL,
  matched_by    uuid REFERENCES users(id),
  matched_at    timestamptz,
  UNIQUE (statement_id, line_no),
  CHECK (num_nonnulls(recording_id, work_id) <= 1)
);
CREATE INDEX income_lines_statement ON income_lines (statement_id);
CREATE INDEX income_lines_unmatched ON income_lines (tenant_id, isrc) WHERE recording_id IS NULL AND work_id IS NULL;

-- Reconciliation to the cent, checked when the transaction commits (an import inserts the
-- statement, then its lines).
CREATE FUNCTION income_reconciles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; want bigint; got bigint; ref text;
BEGIN
  IF TG_TABLE_NAME = 'income_statements' THEN sid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN sid := OLD.statement_id;
  ELSE sid := NEW.statement_id;
  END IF;
  SELECT s.total_cents, s.ref INTO want, ref FROM income_statements s WHERE s.id = sid;
  IF NOT FOUND THEN RETURN NULL; END IF;  -- the statement itself was deleted
  SELECT coalesce(sum(amount_cents), 0) INTO got FROM income_lines WHERE statement_id = sid;
  IF got <> want THEN
    RAISE EXCEPTION 'statement % does not reconcile: lines total % cents, statement says % cents', ref, got, want
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER income_lines_reconcile AFTER INSERT OR UPDATE OR DELETE ON income_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION income_reconciles();
CREATE CONSTRAINT TRIGGER income_statements_reconcile AFTER INSERT OR UPDATE ON income_statements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION income_reconciles();

-- Matching sets what a line points at, and nothing else.
CREATE FUNCTION income_line_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.statement_id, NEW.line_no, NEW.title, NEW.isrc, NEW.store, NEW.territory, NEW.units, NEW.amount_cents)
     IS DISTINCT FROM (OLD.statement_id, OLD.line_no, OLD.title, OLD.isrc, OLD.store, OLD.territory, OLD.units, OLD.amount_cents) THEN
    RAISE EXCEPTION 'an income line is what the source reported; only its match can change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER income_lines_frozen BEFORE UPDATE ON income_lines FOR EACH ROW EXECUTE FUNCTION income_line_frozen();

-- A payee's statement for one period, as issued. `rows` is the waterfall (the contract's
-- WaterfallRow list, integer cents); `simple` the short version the portal shows.
CREATE TABLE payee_statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ref         text NOT NULL CHECK (ref ~ '^ST-\d{4}-\d{2}-[A-Z0-9]+$'),
  party_id    uuid NOT NULL REFERENCES parties(id),
  release_id  uuid REFERENCES releases(id),
  version_id  uuid REFERENCES split_versions(id),
  period      date NOT NULL CHECK (extract(day FROM period) = 1),
  pays_on     date NOT NULL,
  pay_run     text,                           -- "quarterly artist run"
  rows        jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array' AND jsonb_array_length(rows) > 0),
  net_cents   bigint NOT NULL,
  simple      jsonb NOT NULL CHECK (jsonb_typeof(simple) = 'array'),
  qa          jsonb CHECK (qa IS NULL OR jsonb_typeof(qa) = 'array'),
  audit_ref   text NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, ref),
  CHECK (net_cents = (rows -> -1 ->> 'balance')::bigint)
);

-- The cross-tenant guard also covers income lines' statements.
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id', 'statement_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
        UNION ALL SELECT tenant_id FROM split_nodes WHERE id = r.value::uuid AND r.key IN ('node_id', 'parent_id')
        UNION ALL SELECT tenant_id FROM split_versions WHERE id = r.value::uuid AND r.key = 'version_id'
        UNION ALL SELECT tenant_id FROM income_statements WHERE id = r.value::uuid AND r.key = 'statement_id'
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER income_lines_same_tenant BEFORE INSERT OR UPDATE ON income_lines FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();
CREATE TRIGGER payee_statements_same_tenant BEFORE INSERT ON payee_statements FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();

ALTER TABLE income_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payee_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_statements_team ON income_statements FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY income_lines_team ON income_lines FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY payee_statements_team ON payee_statements FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY payee_statements_own ON payee_statements FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND party_id = app_party());

-- Income is imported and matched; never edited or deleted from the app. Issued statements are
-- never changed.
GRANT SELECT, INSERT ON income_statements, payee_statements TO br_app;
GRANT SELECT, INSERT, UPDATE ON income_lines TO br_app;

-- A payee can read their own party, and the releases their statements are for.
CREATE POLICY parties_payee_self ON parties FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND id = app_party());
CREATE POLICY releases_payee_statements ON releases FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND EXISTS (
    SELECT 1 FROM payee_statements s WHERE s.release_id = releases.id AND s.party_id = app_party()));

-- migrate:down
DROP POLICY IF EXISTS releases_payee_statements ON releases;
DROP POLICY IF EXISTS parties_payee_self ON parties;
-- Put back the guard without the income branch (it would point at a dropped table).
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
        UNION ALL SELECT tenant_id FROM split_nodes WHERE id = r.value::uuid AND r.key IN ('node_id', 'parent_id')
        UNION ALL SELECT tenant_id FROM split_versions WHERE id = r.value::uuid AND r.key = 'version_id'
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TABLE IF EXISTS payee_statements, income_lines, income_statements;
DROP FUNCTION IF EXISTS income_line_frozen(), income_reconciles();
DROP TYPE IF EXISTS income_source;
