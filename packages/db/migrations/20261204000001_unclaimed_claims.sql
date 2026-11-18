-- migrate:up

-- Claiming unclaimed money is a filing: an approved card before the claim is submitted
-- (submitting ends its undo), then what was paid, or that it wasn't ours, both final.
ALTER TABLE unclaimed_royalties
  ADD COLUMN approval_id     text,
  ADD COLUMN submitted_on    date,
  ADD COLUMN submit_ref      text CHECK (submit_ref IS NULL OR length(btrim(submit_ref)) BETWEEN 1 AND 120),
  ADD COLUMN resolved_on     date,
  ADD COLUMN paid_cents      bigint CHECK (paid_cents IS NULL OR paid_cents > 0),
  ADD COLUMN resolution_note text CHECK (resolution_note IS NULL OR length(btrim(resolution_note)) BETWEEN 1 AND 500),
  ADD FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  ADD CONSTRAINT unclaimed_paid_has_amount CHECK (status <> 'paid' OR paid_cents IS NOT NULL),
  ADD CONSTRAINT unclaimed_dismissed_has_note CHECK (status <> 'dismissed' OR resolution_note IS NOT NULL);

CREATE FUNCTION unclaimed_claim_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A song or recording being deleted clears its link (ON DELETE SET NULL); allow just that.
  IF (to_jsonb(NEW) - 'work_id' - 'recording_id') = (to_jsonb(OLD) - 'work_id' - 'recording_id')
     AND (NEW.work_id IS NULL OR NEW.work_id = OLD.work_id) AND (NEW.recording_id IS NULL OR NEW.recording_id = OLD.recording_id) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'dismissed') THEN RAISE EXCEPTION 'this claim is already closed'; END IF;
  IF (NEW.amount_cents, NEW.source, NEW.what, NEW.held_since) IS DISTINCT FROM (OLD.amount_cents, OLD.source, OLD.what, OLD.held_since) THEN
    RAISE EXCEPTION 'what the society reported can’t be changed';
  END IF;
  IF NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN
    IF OLD.status <> 'found' AND OLD.status <> 'claim_prepared' THEN RAISE EXCEPTION 'this claim was already submitted'; END IF;
    IF OLD.approval_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = OLD.tenant_id AND d.approval_id = OLD.approval_id AND d.status = 'rejected') THEN
      RAISE EXCEPTION 'a claim for this is already waiting or approved';
    END IF;
    IF NEW.approval_id IS NULL OR NEW.status <> 'claim_prepared' THEN RAISE EXCEPTION 'a new claim is prepared as waiting on approval'; END IF;
  END IF;
  IF NEW.status = 'claimed' AND OLD.status <> 'claimed' THEN
    IF NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = NEW.tenant_id AND d.approval_id = NEW.approval_id AND d.status = 'approved') THEN
      RAISE EXCEPTION 'this claim hasn’t been approved yet';
    END IF;
    NEW.submitted_on := coalesce(NEW.submitted_on, current_date);
    UPDATE approvals SET executed_at = coalesce(executed_at, now()) WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  END IF;
  IF NEW.status = 'paid' AND OLD.status <> 'claimed' THEN RAISE EXCEPTION 'record the claim as submitted before what was paid'; END IF;
  IF NEW.status = 'dismissed' AND OLD.status = 'claim_prepared' AND NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = OLD.tenant_id AND d.approval_id = OLD.approval_id AND d.status = 'rejected') THEN
    RAISE EXCEPTION 'decide the waiting claim card first';
  END IF;
  IF NEW.status IN ('paid', 'dismissed') THEN NEW.resolved_on := coalesce(NEW.resolved_on, current_date); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER unclaimed_claim_guard BEFORE UPDATE ON unclaimed_royalties FOR EACH ROW EXECUTE FUNCTION unclaimed_claim_guard();

-- What a society reported is kept, claimed or not.
REVOKE DELETE ON unclaimed_royalties FROM br_app;

-- migrate:down
GRANT DELETE ON unclaimed_royalties TO br_app;
DROP TRIGGER IF EXISTS unclaimed_claim_guard ON unclaimed_royalties;
DROP FUNCTION IF EXISTS unclaimed_claim_guard();
ALTER TABLE unclaimed_royalties DROP CONSTRAINT IF EXISTS unclaimed_dismissed_has_note, DROP CONSTRAINT IF EXISTS unclaimed_paid_has_amount,
  DROP COLUMN IF EXISTS resolution_note, DROP COLUMN IF EXISTS paid_cents, DROP COLUMN IF EXISTS resolved_on,
  DROP COLUMN IF EXISTS submit_ref, DROP COLUMN IF EXISTS submitted_on, DROP COLUMN IF EXISTS approval_id;
