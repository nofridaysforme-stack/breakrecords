-- migrate:up

-- Prepared documents (split sheets, registration packets, copyright worksheets, label copy).
--  * The facts the organizations ask for that the catalog didn't hold yet: each person's legal
--    name, PRO, contact and citizenship; each writer's role and publisher; a song's completion
--    year and alternate titles; a recording's owner and year. Requirements and sources are in
--    docs/RIGHTS_REQUIREMENTS.md.
--  * documents: every prepared file, one row per version, never changed or deleted. What was
--    missing when it was prepared is kept with it, so a gap is never hidden by a later edit.
--  * document_reviews: an AI review of a document, kept apart from it: suggestions only, never
--    the document's own content.
--  * AI assistance is off until a label's owner turns it on (and the platform switch allows it).

CREATE TYPE pro_org AS ENUM ('ascap', 'bmi', 'sesac', 'gmr', 'socan', 'prs', 'other', 'none');
CREATE TYPE writer_role AS ENUM ('composer', 'lyricist', 'composer_lyricist');
CREATE TYPE doc_kind AS ENUM ('split_sheet', 'registration_packet', 'copyright_worksheet', 'label_copy');
CREATE TYPE doc_subject AS ENUM ('work', 'recording', 'release');

ALTER TABLE parties
  ADD COLUMN legal_name   text CHECK (legal_name IS NULL OR length(btrim(legal_name)) > 0),
  ADD COLUMN pro          pro_org,
  ADD COLUMN email        text CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+$'),
  ADD COLUMN address      text CHECK (address IS NULL OR length(btrim(address)) > 0),
  ADD COLUMN citizenship  char(2) CHECK (citizenship ~ '^[A-Z]{2}$'),
  ADD COLUMN domicile     char(2) CHECK (domicile ~ '^[A-Z]{2}$');

ALTER TABLE work_writers
  ADD COLUMN role          writer_role,
  ADD COLUMN publisher_id  uuid REFERENCES parties(id);   -- null: no publisher (self-published or none yet)

ALTER TABLE works
  ADD COLUMN completion_year  smallint CHECK (completion_year BETWEEN 1900 AND 2100),
  ADD COLUMN alt_titles       text[] NOT NULL DEFAULT '{}';

ALTER TABLE recordings
  ADD COLUMN owner_id  uuid REFERENCES parties(id),          -- who owns the master (the ℗ line)
  ADD COLUMN p_year    smallint CHECK (p_year BETWEEN 1900 AND 2100);

-- The publisher and owner must belong to the same tenant (the existing trigger covers party_id
-- and artist_id; these are new names).
CREATE FUNCTION documents_same_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p uuid;
BEGIN
  IF TG_TABLE_NAME = 'work_writers' THEN p := NEW.publisher_id; ELSE p := NEW.owner_id; END IF;
  IF p IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parties WHERE id = p AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'cross-tenant reference: party % does not belong to tenant %', p, NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_writers_publisher_tenant BEFORE INSERT OR UPDATE ON work_writers FOR EACH ROW EXECUTE FUNCTION documents_same_tenant();
CREATE TRIGGER recordings_owner_tenant BEFORE INSERT OR UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION documents_same_tenant();

CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind          doc_kind NOT NULL,
  subject       doc_subject NOT NULL,
  subject_id    uuid NOT NULL,
  version       integer NOT NULL CHECK (version > 0),
  title         text NOT NULL,
  pdf_key       text NOT NULL,                 -- where the PDF is stored
  csv_key       text,                          -- a spreadsheet, for documents organizations take as one
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  gaps          jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(gaps) = 'array'),
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, subject_id, version),
  CHECK (subject = CASE kind WHEN 'split_sheet' THEN 'work'::doc_subject WHEN 'label_copy' THEN 'release'::doc_subject ELSE subject END),
  CHECK (kind <> 'registration_packet' OR subject IN ('work', 'recording'))
);

CREATE TABLE document_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  model         text NOT NULL,
  findings      jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  next_steps    text NOT NULL,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A document's subject must be the tenant's own song, recording or release; a review's document too.
CREATE FUNCTION documents_subject_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'document_reviews' THEN
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = NEW.document_id AND tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'cross-tenant reference: document % does not belong to tenant %', NEW.document_id, NEW.tenant_id;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM works WHERE id = NEW.subject_id AND tenant_id = NEW.tenant_id AND NEW.subject = 'work'
    UNION ALL SELECT 1 FROM recordings WHERE id = NEW.subject_id AND tenant_id = NEW.tenant_id AND NEW.subject = 'recording'
    UNION ALL SELECT 1 FROM releases WHERE id = NEW.subject_id AND tenant_id = NEW.tenant_id AND NEW.subject = 'release'
  ) THEN
    RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', NEW.subject, NEW.subject_id, NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documents_subject_tenant BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION documents_subject_tenant();
CREATE TRIGGER document_reviews_tenant BEFORE INSERT ON document_reviews FOR EACH ROW EXECUTE FUNCTION documents_subject_tenant();

-- Owners and the team read and add; nobody (not even an owner) changes or deletes a version.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents', 'document_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_read', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR INSERT TO br_app
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team') AND created_by = app_user())$p$, t || '_add', t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO br_app', t);
  END LOOP;
END $$;

-- AI assistance, per label. Off by default; only an owner changes it.
ALTER TABLE label_settings ADD COLUMN ai_assist boolean NOT NULL DEFAULT false;
CREATE FUNCTION app_set_ai_assist(on_ boolean) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_current_tenant() IS NULL OR app_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the label''s owners change AI assistance' USING ERRCODE = '42501';
  END IF;
  UPDATE label_settings SET ai_assist = on_ WHERE tenant_id = app_current_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'this label has no settings yet'; END IF;
  RETURN on_;
END $$;
REVOKE EXECUTE ON FUNCTION app_set_ai_assist(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_ai_assist(boolean) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_set_ai_assist(boolean);
ALTER TABLE label_settings DROP COLUMN IF EXISTS ai_assist;
DROP TABLE IF EXISTS document_reviews, documents;
DROP TRIGGER IF EXISTS work_writers_publisher_tenant ON work_writers;
DROP TRIGGER IF EXISTS recordings_owner_tenant ON recordings;
DROP FUNCTION IF EXISTS documents_subject_tenant(), documents_same_tenant();
ALTER TABLE recordings DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS p_year;
ALTER TABLE works DROP COLUMN IF EXISTS completion_year, DROP COLUMN IF EXISTS alt_titles;
ALTER TABLE work_writers DROP COLUMN IF EXISTS role, DROP COLUMN IF EXISTS publisher_id;
ALTER TABLE parties DROP COLUMN IF EXISTS legal_name, DROP COLUMN IF EXISTS pro, DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS address, DROP COLUMN IF EXISTS citizenship, DROP COLUMN IF EXISTS domicile;
DROP TYPE IF EXISTS doc_subject, doc_kind, writer_role, pro_org;
