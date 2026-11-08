-- migrate:up

-- Contracts (5b and the template pages).
--  * templates: the label's own agreements, with their clauses and the playbook rules Legal
--    Agent checks drafts against.
--  * agreements: one signed (or to-be-signed) contract, from a template or from a third party.
--    Its counterparties sign; the label signs by approving it (`approval_id`). A split sheet
--    is the song's writer split: its parties, shares and signatures are the work's writers,
--    so there is one source of truth for who wrote what.
--  * review requests: a contract someone uploaded for Legal Agent to check. The file itself
--    arrives with uploads (R2 or S3); until then only its name is recorded.
-- Only the label's owner and team see any of it.

CREATE TYPE agreement_source AS ENUM ('template', 'third_party');
CREATE TYPE review_status AS ENUM ('queued', 'reviewed');

CREATE TABLE contract_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  version     text NOT NULL,            -- "v3 · points"
  updated_on  date NOT NULL,
  summary     text NOT NULL,
  clauses     jsonb NOT NULL CHECK (jsonb_typeof(clauses) = 'array'),
  playbook    text[] NOT NULL DEFAULT '{}',
  label_owned boolean NOT NULL DEFAULT true,   -- false for industry forms (the split sheet)
  position    smallint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

CREATE TABLE agreements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9_-]+$'),
  name           text NOT NULL,
  source         agreement_source NOT NULL,
  template_id    uuid REFERENCES contract_templates(id),
  edits          smallint NOT NULL DEFAULT 0 CHECK (edits >= 0),   -- changes from the template
  reviewed       boolean NOT NULL DEFAULT false,                   -- a third-party contract Legal checked
  work_id        uuid REFERENCES works(id),   -- a split sheet: the song
  terms          text,
  key_date       date,
  key_date_what  text,
  approval_id    text,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  CHECK ((source = 'template') = (template_id IS NOT NULL)),
  CHECK (source = 'third_party' OR NOT reviewed),
  CHECK ((key_date IS NULL) = (key_date_what IS NULL)),
  CHECK (work_id IS NULL OR terms IS NULL)    -- a split sheet's terms are its writers' shares
);

-- Who signs. A band signs as its members (`signers`).
CREATE TABLE agreement_parties (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agreement_id  uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL REFERENCES parties(id),
  signers       smallint NOT NULL DEFAULT 1 CHECK (signers > 0),
  signed_at     date,
  position      smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (agreement_id, party_id)
);

CREATE TABLE contract_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name     text NOT NULL CHECK (file_name ~* '\.(pdf|docx?)$' AND length(file_name) <= 200),
  storage_key   text,
  status        review_status NOT NULL DEFAULT 'queued',
  requested_by  uuid REFERENCES users(id),
  requested_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The cross-tenant guard also covers templates and agreements.
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id', 'statement_id', 'batch_id', 'account_id', 'phase_id', 'template_id', 'agreement_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
        UNION ALL SELECT tenant_id FROM split_nodes WHERE id = r.value::uuid AND r.key IN ('node_id', 'parent_id')
        UNION ALL SELECT tenant_id FROM split_versions WHERE id = r.value::uuid AND r.key = 'version_id'
        UNION ALL SELECT tenant_id FROM income_statements WHERE id = r.value::uuid AND r.key = 'statement_id' AND TG_TABLE_NAME = 'income_lines'
        UNION ALL SELECT tenant_id FROM payee_statements WHERE id = r.value::uuid AND r.key = 'statement_id' AND TG_TABLE_NAME = 'payout_lines'
        UNION ALL SELECT tenant_id FROM payout_batches WHERE id = r.value::uuid AND r.key = 'batch_id'
        UNION ALL SELECT tenant_id FROM recoupment_accounts WHERE id = r.value::uuid AND r.key = 'account_id'
        UNION ALL SELECT tenant_id FROM runbook_phases WHERE id = r.value::uuid AND r.key = 'phase_id'
        UNION ALL SELECT tenant_id FROM contract_templates WHERE id = r.value::uuid AND r.key = 'template_id'
        UNION ALL SELECT tenant_id FROM agreements WHERE id = r.value::uuid AND r.key = 'agreement_id'
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_templates', 'agreements', 'agreement_parties', 'contract_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_team', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant()', t || '_same_tenant', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON contract_templates, agreements, agreement_parties TO br_app;
GRANT SELECT, INSERT ON contract_reviews TO br_app;   -- marking one reviewed comes with Legal Agent (Stage 4)

-- migrate:down
-- Put back the guard from the releases migration.
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id', 'statement_id', 'batch_id', 'account_id', 'phase_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
        UNION ALL SELECT tenant_id FROM split_nodes WHERE id = r.value::uuid AND r.key IN ('node_id', 'parent_id')
        UNION ALL SELECT tenant_id FROM split_versions WHERE id = r.value::uuid AND r.key = 'version_id'
        UNION ALL SELECT tenant_id FROM income_statements WHERE id = r.value::uuid AND r.key = 'statement_id' AND TG_TABLE_NAME = 'income_lines'
        UNION ALL SELECT tenant_id FROM payee_statements WHERE id = r.value::uuid AND r.key = 'statement_id' AND TG_TABLE_NAME = 'payout_lines'
        UNION ALL SELECT tenant_id FROM payout_batches WHERE id = r.value::uuid AND r.key = 'batch_id'
        UNION ALL SELECT tenant_id FROM recoupment_accounts WHERE id = r.value::uuid AND r.key = 'account_id'
        UNION ALL SELECT tenant_id FROM runbook_phases WHERE id = r.value::uuid AND r.key = 'phase_id'
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TABLE IF EXISTS contract_reviews, agreement_parties, agreements, contract_templates;
DROP TYPE IF EXISTS review_status, agreement_source;
