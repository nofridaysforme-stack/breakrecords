-- migrate:up

-- Several people in one role: two artists on a duet, co-producers. Each line of a split
-- version is a role and a party, with the party's share of that role (basis points of the
-- role's amount). A version keeps exactly one label; each role's shares total 100.00% before
-- it can leave draft. Every line signs; the last signature puts the version in effect.
ALTER TABLE split_parties ADD COLUMN share_bp integer NOT NULL DEFAULT 10000 CHECK (share_bp BETWEEN 1 AND 10000);
ALTER TABLE split_parties DROP CONSTRAINT split_parties_pkey;
ALTER TABLE split_parties ADD PRIMARY KEY (version_id, role, party_id);
CREATE UNIQUE INDEX split_parties_one_label ON split_parties (version_id) WHERE role = 'label';

CREATE FUNCTION split_lines_total() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bad text;
BEGIN
  IF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
    SELECT string_agg(role::text, ', ') INTO bad FROM (
      SELECT role FROM split_parties WHERE version_id = NEW.id GROUP BY role HAVING sum(share_bp) <> 10000) x;
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'shares within % must total 100%%', bad; END IF;
    IF NOT EXISTS (SELECT 1 FROM split_parties WHERE version_id = NEW.id AND role = 'label') THEN
      RAISE EXCEPTION 'a split needs the label';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER split_versions_lines_total BEFORE UPDATE OF status ON split_versions FOR EACH ROW EXECUTE FUNCTION split_lines_total();

-- Songwriter splits: a writer confirms only their own share of a song. Changing a song's
-- writers (owner and team) clears every confirmation, so the new shares are agreed afresh.
CREATE FUNCTION app_confirm_writer_share(w uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_party();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'you aren’t a writer in this workspace' USING ERRCODE = '42501'; END IF;
  IF (SELECT coalesce(sum(share_bp), 0) FROM work_writers WHERE work_id = w) <> 10000 THEN
    RAISE EXCEPTION 'this song’s shares don’t total 100%%' USING ERRCODE = '22023';
  END IF;
  UPDATE work_writers SET confirmed = true WHERE work_id = w AND party_id = me AND tenant_id = app_current_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'you aren’t a writer on this song' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_confirm_writer_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_writer_share(uuid) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_confirm_writer_share(uuid);
DROP TRIGGER IF EXISTS split_versions_lines_total ON split_versions;
DROP FUNCTION IF EXISTS split_lines_total();
DROP INDEX IF EXISTS split_parties_one_label;
ALTER TABLE split_parties DROP CONSTRAINT split_parties_pkey;
ALTER TABLE split_parties ADD PRIMARY KEY (version_id, role);
ALTER TABLE split_parties DROP COLUMN IF EXISTS share_bp;
