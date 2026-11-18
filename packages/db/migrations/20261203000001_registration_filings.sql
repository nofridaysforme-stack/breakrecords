-- migrate:up

-- Filing a registration: prepare it (an approval card), approve it, submit it on the
-- organization's site and record that, then record the confirmation and its number. The order
-- is enforced here: nothing is submitted without an approved card, recording the submission
-- ends the card's undo, a confirmation needs a number, and a confirmed registration is final.
ALTER TABLE registrations
  ADD COLUMN approval_id  text,
  ADD COLUMN submitted_on date,
  ADD COLUMN submit_ref   text CHECK (submit_ref IS NULL OR length(btrim(submit_ref)) BETWEEN 1 AND 120),
  ADD COLUMN confirmed_on date,
  ADD FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id);
ALTER TABLE registrations ADD CONSTRAINT registrations_ref_length CHECK (ref IS NULL OR length(btrim(ref)) BETWEEN 1 AND 120);

CREATE FUNCTION registration_filing_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE decided text;
BEGIN
  IF OLD.status = 'confirmed' THEN RAISE EXCEPTION 'this registration is already confirmed'; END IF;
  IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'confirmed') THEN RAISE EXCEPTION 'this registration was already submitted'; END IF;
  -- A new filing card only when there's none, or the last one was rejected.
  IF NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN
    IF OLD.status IN ('submitted', 'confirmed') THEN RAISE EXCEPTION 'this registration was already submitted'; END IF;
    IF OLD.approval_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = OLD.tenant_id AND d.approval_id = OLD.approval_id AND d.status = 'rejected') THEN
      RAISE EXCEPTION 'a filing for this is already waiting or approved';
    END IF;
    IF NEW.approval_id IS NULL OR NEW.status <> 'needsYou' THEN RAISE EXCEPTION 'a new filing is prepared as waiting on approval'; END IF;
  END IF;
  IF NEW.status = 'submitted' AND OLD.status <> 'submitted' THEN
    SELECT d.status::text INTO decided FROM approval_decisions d WHERE d.tenant_id = NEW.tenant_id AND d.approval_id = NEW.approval_id;
    IF NEW.approval_id IS NULL OR decided IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'this filing hasn’t been approved yet'; END IF;
    NEW.submitted_on := coalesce(NEW.submitted_on, current_date);
    UPDATE approvals SET executed_at = coalesce(executed_at, now()) WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  END IF;
  IF NEW.status = 'confirmed' THEN
    IF OLD.status <> 'submitted' THEN RAISE EXCEPTION 'record the submission before the confirmation'; END IF;
    IF NEW.ref IS NULL THEN RAISE EXCEPTION 'a confirmation needs its registration number'; END IF;
    NEW.confirmed_on := coalesce(NEW.confirmed_on, current_date);
  END IF;
  IF OLD.status = 'submitted' AND (NEW.approval_id, NEW.submitted_on) IS DISTINCT FROM (OLD.approval_id, OLD.submitted_on) THEN
    RAISE EXCEPTION 'a submission can’t change';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER registrations_filing_guard BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION registration_filing_guard();

-- Registrations are kept: nobody deletes one from the app.
REVOKE DELETE ON registrations FROM br_app;

-- migrate:down
GRANT DELETE ON registrations TO br_app;
DROP TRIGGER IF EXISTS registrations_filing_guard ON registrations;
DROP FUNCTION IF EXISTS registration_filing_guard();
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_ref_length;
ALTER TABLE registrations DROP COLUMN IF EXISTS confirmed_on, DROP COLUMN IF EXISTS submit_ref, DROP COLUMN IF EXISTS submitted_on, DROP COLUMN IF EXISTS approval_id;
