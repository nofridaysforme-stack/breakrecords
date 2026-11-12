-- migrate:up

-- Reserves (Build List P1 #4, rules ROY-07 and AUD-02).
--  * Opening an audit flag on a recording opens a reserve: that recording's income in periods
--    not yet paid out is held, and each payout line paid from its release holds its share.
--  * The flag is resolved one of two ways. Real listeners: the money is released, but only
--    through an approval card (releasing held money moves money). Artificial streams: the
--    income is forfeited and never paid.
--  * What is held, released or forfeited is worked out from these rows and the release card's
--    decision, like an approved plan moving a release date. Nothing is deleted.
CREATE TABLE reserves (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_id             uuid NOT NULL UNIQUE REFERENCES audit_flags(id) ON DELETE CASCADE,
  recording_id        uuid NOT NULL REFERENCES recordings(id),
  amount_cents        bigint NOT NULL CHECK (amount_cents >= 0),
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome             text CHECK (outcome IN ('release', 'forfeit')),
  outcome_note        text CHECK (outcome_note IS NULL OR length(btrim(outcome_note)) > 0),
  decided_by          uuid REFERENCES users(id),
  decided_at          timestamptz,
  release_approval_id text,
  -- Released before the platform (imported history); the app never sets it.
  released_at         timestamptz,
  FOREIGN KEY (tenant_id, release_approval_id) REFERENCES approvals(tenant_id, id),
  CHECK ((outcome IS NULL) = (decided_at IS NULL) AND (outcome IS NULL) = (outcome_note IS NULL)),
  CHECK (outcome IS DISTINCT FROM 'release' OR release_approval_id IS NOT NULL OR released_at IS NOT NULL),
  CHECK (outcome IS DISTINCT FROM 'forfeit' OR release_approval_id IS NULL)
);
CREATE INDEX reserves_recording ON reserves (tenant_id, recording_id);

-- Where a payout line's money comes from, so a reserve on one recording holds only its share.
ALTER TABLE payout_lines ADD COLUMN source_release_id uuid REFERENCES releases(id);

-- Once decided, a reserve's outcome never changes.
CREATE FUNCTION reserve_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.outcome IS NOT NULL THEN RAISE EXCEPTION 'this reserve was already decided'; END IF;
  IF NEW.recording_id IS DISTINCT FROM OLD.recording_id OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR NEW.flag_id IS DISTINCT FROM OLD.flag_id THEN
    RAISE EXCEPTION 'a reserve holds what it held when it opened';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reserves_guard BEFORE UPDATE ON reserves FOR EACH ROW EXECUTE FUNCTION reserve_guard();
CREATE TRIGGER reserves_same_tenant BEFORE INSERT OR UPDATE ON reserves FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();

ALTER TABLE reserves ENABLE ROW LEVEL SECURITY;
CREATE POLICY reserves_team ON reserves FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT (tenant_id, flag_id, recording_id, amount_cents) ON reserves TO br_app;
GRANT UPDATE (outcome, outcome_note, decided_by, decided_at, release_approval_id) ON reserves TO br_app;

-- What is held, by release and month: the flagged recordings' income and the release's whole
-- income, so each line or statement holds its share. The label's team sees every release; a
-- payee sees only the releases that pay them, and never a flag's note or who decided.
CREATE FUNCTION app_reserve_holds() RETURNS TABLE (release_id uuid, period date, recordings text[], flagged_cents bigint, total_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH held AS (
    SELECT r.recording_id FROM reserves r
    WHERE r.tenant_id = app_current_tenant()
      AND (r.outcome IS NULL OR (r.outcome = 'release' AND r.released_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM approval_decisions d WHERE d.tenant_id = r.tenant_id AND d.approval_id = r.release_approval_id AND d.status = 'approved')))
  ), inc AS (
    SELECT rt.release_id, s.period, l.recording_id, sum(l.amount_cents) AS cents
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id JOIN release_tracks rt ON rt.recording_id = l.recording_id
    WHERE s.tenant_id = app_current_tenant()
    GROUP BY 1, 2, 3
  )
  SELECT i.release_id, i.period,
         array_agg(DISTINCT rec.title ORDER BY rec.title) FILTER (WHERE i.recording_id IN (SELECT recording_id FROM held)),
         coalesce(sum(i.cents) FILTER (WHERE i.recording_id IN (SELECT recording_id FROM held)), 0)::bigint,
         sum(i.cents)::bigint
  FROM inc i JOIN recordings rec ON rec.id = i.recording_id
  WHERE app_role() IN ('owner', 'team')
     OR (app_role() = 'payee' AND i.release_id IN (
           SELECT source_release_id FROM payout_lines WHERE party_id = app_party() AND source_release_id IS NOT NULL
           UNION SELECT release_id FROM payee_statements WHERE party_id = app_party() AND release_id IS NOT NULL))
  GROUP BY i.release_id, i.period
  HAVING coalesce(sum(i.cents) FILTER (WHERE i.recording_id IN (SELECT recording_id FROM held)), 0) > 0
$$;
REVOKE ALL ON FUNCTION app_reserve_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reserve_holds() TO br_app;

-- Flags already open get their reserve now.
INSERT INTO reserves (tenant_id, flag_id, recording_id, amount_cents)
SELECT f.tenant_id, f.id, f.recording_id,
       coalesce((SELECT sum(l.amount_cents) FROM income_lines l JOIN income_statements s ON s.id = l.statement_id
                 WHERE l.recording_id = f.recording_id AND NOT EXISTS (
                   SELECT 1 FROM payout_batches b WHERE b.tenant_id = f.tenant_id AND b.period = s.period AND b.status IN ('sent', 'failed'))), 0)
FROM audit_flags f WHERE f.resolved_at IS NULL;

-- migrate:down
DROP FUNCTION IF EXISTS app_reserve_holds();
ALTER TABLE payout_lines DROP COLUMN IF EXISTS source_release_id;
DROP TABLE IF EXISTS reserves;
DROP FUNCTION IF EXISTS reserve_guard();
