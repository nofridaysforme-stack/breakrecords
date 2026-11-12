-- migrate:up

-- Contract templates for every workspace. Indie SRVCS keeps one starter library that every
-- workspace can read; it isn't any workspace's data, so it has no tenant. A workspace makes its
-- own copy of a starter to change the wording; its copy hides the starter of the same slug.
-- Starters are marked not reviewed by a lawyer until platform staff record an attorney's review,
-- and changing a starter's wording clears that review.
CREATE TABLE starter_templates (
  slug         text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
  name         text NOT NULL,
  version      text NOT NULL,
  summary      text NOT NULL,
  clauses      jsonb NOT NULL CHECK (jsonb_typeof(clauses) = 'array'),
  playbook     text[] NOT NULL DEFAULT '{}',
  label_owned  boolean NOT NULL DEFAULT true,
  position     smallint NOT NULL DEFAULT 0,
  -- Workspace kinds it isn't shown to by default (an artist workspace doesn't sign artists).
  not_for      tenant_kind[] NOT NULL DEFAULT '{}',
  updated_on   date NOT NULL DEFAULT current_date,
  reviewed_at  timestamptz,
  reviewed_by  text,   -- the staff member's email: kept even if their login is removed
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL))
);
ALTER TABLE starter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY starter_templates_read ON starter_templates FOR SELECT TO br_app USING (true);
GRANT SELECT ON starter_templates TO br_app;

CREATE FUNCTION starter_wording_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.summary, NEW.clauses, NEW.playbook) IS DISTINCT FROM (OLD.summary, OLD.clauses, OLD.playbook) THEN
    NEW.updated_on := current_date;
    IF NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at THEN NEW.reviewed_at := NULL; NEW.reviewed_by := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER starter_templates_wording BEFORE UPDATE ON starter_templates FOR EACH ROW EXECUTE FUNCTION starter_wording_changed();

-- Platform staff record that an attorney reviewed a starter (or take it back).
CREATE FUNCTION app_set_starter_reviewed(s text, reviewed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_platform_admin() THEN RAISE EXCEPTION 'only Indie SRVCS staff record a review' USING ERRCODE = '42501'; END IF;
  UPDATE starter_templates SET reviewed_at = CASE WHEN reviewed THEN clock_timestamp() END, reviewed_by = CASE WHEN reviewed THEN (SELECT email FROM users WHERE id = app_user()) END WHERE slug = s;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such starter template' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_set_starter_reviewed(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_starter_reviewed(text, boolean) TO br_app;

-- A workspace's own templates are versioned: every change to the wording is a new version, kept.
ALTER TABLE contract_templates
  ADD COLUMN starter_slug text REFERENCES starter_templates(slug),
  ADD COLUMN starter_reviewed boolean,   -- whether the starter it was copied from had been reviewed
  ADD COLUMN version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0);

CREATE TABLE contract_template_versions (
  template_id  uuid NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_no   integer NOT NULL,
  version      text NOT NULL,
  summary      text NOT NULL,
  clauses      jsonb NOT NULL,
  playbook     text[] NOT NULL,
  saved_by     uuid REFERENCES users(id),
  saved_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (template_id, version_no)
);
INSERT INTO contract_template_versions (template_id, tenant_id, version_no, version, summary, clauses, playbook)
  SELECT id, tenant_id, 1, version, summary, clauses, playbook FROM contract_templates;

CREATE FUNCTION contract_template_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version_no <> OLD.version_no OR NEW.slug <> OLD.slug OR NEW.starter_slug IS DISTINCT FROM OLD.starter_slug THEN
      RAISE EXCEPTION 'a template’s version and origin can’t be changed';
    END IF;
    IF (NEW.summary, NEW.clauses, NEW.playbook) IS NOT DISTINCT FROM (OLD.summary, OLD.clauses, OLD.playbook) THEN RETURN NEW; END IF;
    NEW.version_no := OLD.version_no + 1;
    NEW.version := CASE WHEN OLD.version ~ '^v[0-9]+' THEN regexp_replace(OLD.version, '^v[0-9]+', 'v' || ((substring(OLD.version FROM '^v([0-9]+)'))::int + 1)) ELSE 'v' || NEW.version_no END;
    NEW.updated_on := current_date;
  END IF;
  INSERT INTO contract_template_versions (template_id, tenant_id, version_no, version, summary, clauses, playbook, saved_by)
    VALUES (NEW.id, NEW.tenant_id, NEW.version_no, NEW.version, NEW.summary, NEW.clauses, NEW.playbook, app_user());
  RETURN NEW;
END $$;
-- The version row is written before the template row on update, so it's AFTER for inserts only.
CREATE TRIGGER contract_templates_version_ins AFTER INSERT ON contract_templates FOR EACH ROW EXECUTE FUNCTION contract_template_version();
CREATE TRIGGER contract_templates_version_upd BEFORE UPDATE ON contract_templates FOR EACH ROW EXECUTE FUNCTION contract_template_version();

ALTER TABLE contract_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_template_versions_team ON contract_template_versions FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT ON contract_template_versions TO br_app;

-- An agreement keeps the version of the wording it was drafted from.
ALTER TABLE agreements ADD COLUMN template_version integer;
UPDATE agreements a SET template_version = 1 WHERE template_id IS NOT NULL;
CREATE FUNCTION agreement_template_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.template_id IS NOT NULL AND NEW.template_version IS NULL THEN
    NEW.template_version := (SELECT version_no FROM contract_templates WHERE id = NEW.template_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agreements_template_version BEFORE INSERT ON agreements FOR EACH ROW EXECUTE FUNCTION agreement_template_version();

-- The starter library. The wording is a starting point written for Indie SRVCS, not reviewed by a lawyer.
INSERT INTO starter_templates (slug, name, version, summary, clauses, playbook, label_owned, position, not_for) VALUES
  ('artist', 'Artist agreement', 'v1 · net profit', 'For signing an artist or band to the label. Profits split after costs are recouped.', '[{"title":"Profit split","text":"Net profit splits 50/50 between the label and the artist after recoupable costs."},{"title":"Term","text":"3 years, with one option period the artist can decline."},{"title":"Recoupable costs","text":"Recording and video at 100%, marketing at 50%. Nothing else is charged back."},{"title":"Audit","text":"The artist can audit statements once a year, up to 3 years back."}]'::jsonb, ARRAY['Never take ownership of masters for more than the term plus 2 years.', 'Statements at least quarterly.']::text[], true, 0, '{artist}'::tenant_kind[]),
  ('producer', 'Producer agreement', 'v1 · points', 'For a producer paid in points from the first dollar, with an optional advance.', '[{"title":"Royalty","text":"Points of gross receipts, paid from the first dollar."},{"title":"Advance","text":"Recoupable against the producer royalty only."},{"title":"Credit","text":"\"Produced by\" on every store and in the liner notes."},{"title":"Delivery","text":"Final mixes and stems by the date in the schedule."}]'::jsonb, ARRAY['Points stay between 2 and 4.', 'No approval rights over the artist’s other recordings.']::text[], true, 1, '{}'::tenant_kind[]),
  ('feature', 'Feature agreement', 'v1', 'For a featured artist on one recording.', '[{"title":"Share","text":"A share of the main artist’s royalty, floored to the cent; the remainder stays with the artist."},{"title":"Name use","text":"The label may use the featured artist’s name and likeness to promote the recording only."}]'::jsonb, ARRAY['Feature share stays at or under 15% of the artist share.']::text[], true, 2, '{}'::tenant_kind[]),
  ('split', 'Split sheet', 'v1 · song', 'Who wrote a song and how its publishing splits. Needed before MLC and PRO filings.', '[{"title":"Writers and shares","text":"Each writer’s share of the song. Shares must total exactly 100.00%."},{"title":"Publishers","text":"Each writer’s publisher, or “self-published”."}]'::jsonb, ARRAY['Every writer signs before anything is filed.']::text[], false, 3, '{}'::tenant_kind[]),
  ('publishing', 'Publishing agreement', 'v1 · full', 'The label owns the writer’s share of copyright in the songs for the term and files as their publisher.', '[{"title":"Rights","text":"The label owns the publisher share of each song written in the term, worldwide."},{"title":"Income","text":"The writer keeps their writer share at the PRO; publishing income splits 50/50 after the publisher’s costs."},{"title":"Term","text":"3 years; songs stay with the label for 10 years after the term ends."}]'::jsonb, ARRAY['Never take the writer share at the PRO.', 'Songs revert no later than 10 years after the term.']::text[], true, 4, '{}'::tenant_kind[]),
  ('co-publishing', 'Co-publishing agreement', 'v1 · 50/50', 'The writer and the label co-own the publisher share. The label files and collects for both.', '[{"title":"Rights","text":"The label and the writer each own half of the publisher share."},{"title":"Income","text":"The writer gets their writer share plus half the publisher share, so 75% of the song’s income."},{"title":"Term","text":"3 years; songs stay co-owned for 10 years after the term ends."}]'::jsonb, ARRAY['The writer’s total stays at or above 75%.']::text[], true, 5, '{}'::tenant_kind[]),
  ('admin', 'Administration agreement', 'v1 · 15% fee', 'The writer keeps ownership. The label registers the songs and collects for a fee.', '[{"title":"Rights","text":"No ownership changes. The label may register, license and collect for the songs."},{"title":"Fee","text":"15% of publishing income collected, taken before it is paid to the writer."},{"title":"Territory","text":"Worldwide, through sub-publishers outside the US where the label names one."},{"title":"Term","text":"3 years, then year to year until either side ends it with 90 days’ notice."}]'::jsonb, ARRAY['Admin fee stays at or under 20%.', 'The writer keeps ownership of every song.']::text[], true, 6, '{}'::tenant_kind[]),
  ('sync', 'Sync license', 'v1 · one-off', 'A one-off license to use a recording in a film, ad, game or show.', '[{"title":"Use","text":"The exact scene, length and media. Anything else needs a new license."},{"title":"Fee","text":"One fee covering the master and the song, split by the splits in place."},{"title":"Territory and term","text":"Where and for how long the use can run."}]'::jsonb, ARRAY['Every sync license is a signature, so it always comes to you.']::text[], true, 7, '{}'::tenant_kind[])
;

-- migrate:down
DROP TRIGGER IF EXISTS agreements_template_version ON agreements;
DROP FUNCTION IF EXISTS agreement_template_version();
ALTER TABLE agreements DROP COLUMN IF EXISTS template_version;
DROP TABLE IF EXISTS contract_template_versions;
DROP TRIGGER IF EXISTS contract_templates_version_ins ON contract_templates;
DROP TRIGGER IF EXISTS contract_templates_version_upd ON contract_templates;
DROP FUNCTION IF EXISTS contract_template_version();
ALTER TABLE contract_templates DROP COLUMN IF EXISTS starter_slug, DROP COLUMN IF EXISTS starter_reviewed, DROP COLUMN IF EXISTS version_no;
DROP FUNCTION IF EXISTS app_set_starter_reviewed(text, boolean);
DROP TABLE IF EXISTS starter_templates;
DROP FUNCTION IF EXISTS starter_wording_changed();
