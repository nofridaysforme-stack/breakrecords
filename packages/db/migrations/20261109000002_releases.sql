-- migrate:up

-- Releases (2g runbook, the releases list, budgets). The release itself, its tracks, assets
-- and registrations are catalog tables; this adds what it takes to put it out:
--  * a runbook of phases and tasks. A phase is either on a fixed date ("Now") or a number of
--    days from the release date ("8 weeks out" = -56), so moving the release moves every
--    relative phase with it. A task that stands between the release and delivery carries the
--    sentence that explains why (`blocks_delivery`); once the task is done it stops blocking.
--  * budget lines, planned and spent, in cents.
--  * the playlist pitch, within the store's character limit.
-- Only the label's owner and team can see or change any of it.

CREATE TYPE task_state AS ENUM ('done', 'inProgress', 'needsYou', 'waiting', 'locked');

CREATE TABLE runbook_phases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  release_id   uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  position     smallint NOT NULL CHECK (position >= 0),
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  starts_on    date,                -- a fixed date
  offset_days  integer,             -- or days from the release date
  until        boolean NOT NULL DEFAULT false,   -- runs until this date rather than starting on it
  UNIQUE (release_id, position),
  CHECK (num_nonnulls(starts_on, offset_days) = 1)
);

CREATE TABLE runbook_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase_id         uuid NOT NULL REFERENCES runbook_phases(id) ON DELETE CASCADE,
  position         smallint NOT NULL CHECK (position >= 0),
  title            text NOT NULL CHECK (length(btrim(title)) > 0),
  owner            text NOT NULL,
  state            task_state NOT NULL DEFAULT 'waiting',
  gate_owner       text,            -- a gate: this task can't start until its owner clears it
  gate_waiting_on  text,
  blocks_delivery  text CHECK (blocks_delivery IS NULL OR length(btrim(blocks_delivery)) > 0),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, position),
  CHECK (gate_waiting_on IS NULL OR gate_owner IS NOT NULL),
  CHECK (state <> 'locked' OR gate_owner IS NOT NULL)   -- a locked task always says who holds the key
);

CREATE TABLE release_budget_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  release_id     uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  position       smallint NOT NULL CHECK (position >= 0),
  category       text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  planned_cents  bigint NOT NULL CHECK (planned_cents >= 0),
  spent_cents    bigint NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
  UNIQUE (release_id, position)
);

CREATE TABLE release_pitches (
  release_id  uuid PRIMARY KEY REFERENCES releases(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  text        text NOT NULL,
  char_limit  integer NOT NULL CHECK (char_limit > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (length(text) <= char_limit)
);

-- The cross-tenant guard also covers a task's phase.
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['runbook_phases', 'runbook_tasks', 'release_budget_lines', 'release_pitches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_team', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO br_app', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant()', t || '_same_tenant', t);
  END LOOP;
END $$;

-- migrate:down
-- Put back the guard from the payouts migration.
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id', 'statement_id', 'batch_id', 'account_id') AND value IS NOT NULL LOOP
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
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TABLE IF EXISTS release_pitches, release_budget_lines, runbook_tasks, runbook_phases;
DROP TYPE IF EXISTS task_state;
