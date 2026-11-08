-- migrate:up

-- Payouts (4d), recoupment (4e) and the payee portal (4f to 4h).
--  * payees: how and how often a party is paid, their tax form and the last four digits of
--    the bank account (the account itself lives with the payout provider, Trolley, Stage 3).
--  * payout batches and their lines. A line is one payee's amount in a batch: included, held,
--    carried forward (under the minimum), paid or failed. A batch is only sent once its
--    approval is approved, and sending marks the approval executed; the database refuses
--    anything else. Batches brought over from before the platform are marked `imported`,
--    which the app itself can never set.
--  * requests to a payee for a tax form or bank details (recorded; the provider sends them).
--  * recoupment: what a release owes back (advance plus each recoupable share of its costs)
--    and what has been recouped, period by period.
-- Owners and team see and manage everything here. A payee reads only their own rows.

CREATE TYPE pay_cadence AS ENUM ('monthly', 'quarterly');
CREATE TYPE batch_status AS ENUM ('draft', 'awaiting', 'sent', 'failed');
CREATE TYPE payout_line_status AS ENUM ('included', 'held', 'carried', 'paid', 'failed');
CREATE TYPE payee_request_kind AS ENUM ('tax_form', 'bank_details');

CREATE TABLE payout_policies (
  tenant_id      uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  minimum_cents  bigint NOT NULL DEFAULT 2500 CHECK (minimum_cents >= 0)
);

CREATE TABLE payees (
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id             uuid PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  cadence              pay_cadence NOT NULL DEFAULT 'monthly',
  tax_form             text CHECK (tax_form IN ('W-9', 'W-8BEN', 'W-8BEN-E')),
  tax_expires_on       date,
  bank_last4           text CHECK (bank_last4 ~ '^\d{4}$'),
  bank_name            text,
  -- Earned and paid before the platform, brought over at onboarding.
  opening_earned_cents bigint NOT NULL DEFAULT 0 CHECK (opening_earned_cents >= 0),
  opening_paid_cents   bigint NOT NULL DEFAULT 0 CHECK (opening_paid_cents >= 0),
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE payout_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug         text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name         text NOT NULL,
  cadence      pay_cadence NOT NULL,
  period       date NOT NULL CHECK (extract(day FROM period) = 1),
  pays_on      date NOT NULL,
  status       batch_status NOT NULL DEFAULT 'draft',
  approval_id  text,
  imported     boolean NOT NULL DEFAULT false,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  CHECK ((status IN ('sent', 'failed')) = (sent_at IS NOT NULL))
);

CREATE TABLE payout_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id      uuid NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL REFERENCES parties(id),
  statement_id  uuid REFERENCES payee_statements(id),
  role          text NOT NULL,                     -- "Producer, 3 points"
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  status        payout_line_status NOT NULL DEFAULT 'included',
  failure       text CHECK (failure IS NULL OR length(btrim(failure)) > 0),
  CHECK ((status = 'failed') = (failure IS NOT NULL)),
  UNIQUE (batch_id, party_id, statement_id)
);
CREATE INDEX payout_lines_party ON payout_lines (party_id);

-- Money leaves only through an approved approval. Sending (or recording a failure, which is
-- a send) needs an approved decision on the batch's approval, and marks it executed so it
-- can no longer be undone. Imported history is exempt; the app can't mark rows imported.
CREATE FUNCTION payout_batch_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('sent', 'failed') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'batch % was sent; it can no longer change', OLD.slug;
  END IF;
  IF NEW.status IN ('sent', 'failed') AND NOT NEW.imported AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('sent', 'failed')) THEN
    IF NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id = NEW.tenant_id AND d.approval_id = NEW.approval_id AND d.status = 'approved') THEN
      RAISE EXCEPTION 'batch % has no approved approval; money is never sent without one', NEW.slug USING ERRCODE = 'check_violation';
    END IF;
    UPDATE approvals SET executed_at = coalesce(executed_at, now()) WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payout_batches_guard BEFORE INSERT OR UPDATE ON payout_batches FOR EACH ROW EXECUTE FUNCTION payout_batch_guard();

-- Lines in a sent batch are what was paid; they don't change.
CREATE FUNCTION payout_line_frozen() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b payout_batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM payout_batches WHERE id = coalesce(NEW.batch_id, OLD.batch_id);
  IF b.status IN ('sent', 'failed') AND NOT b.imported THEN
    RAISE EXCEPTION 'batch % was sent; its lines can no longer change', b.slug;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER payout_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON payout_lines FOR EACH ROW EXECUTE FUNCTION payout_line_frozen();

CREATE TABLE payee_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  kind          payee_request_kind NOT NULL,
  requested_by  uuid REFERENCES users(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);
-- One open request of each kind per payee.
CREATE UNIQUE INDEX payee_requests_open ON payee_requests (party_id, kind) WHERE done_at IS NULL;

CREATE TABLE recoupment_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  release_id    uuid NOT NULL UNIQUE REFERENCES releases(id) ON DELETE CASCADE,
  advance_cents bigint NOT NULL DEFAULT 0 CHECK (advance_cents >= 0),
  projected_on  date,                  -- Royalties Agent's projection, while still recouping
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A cost and the share of it the deal lets the label recoup (10000 = all of it; 0 = the label pays).
CREATE TABLE recoupable_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES recoupment_accounts(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  cost_cents  bigint NOT NULL CHECK (cost_cents > 0),
  share_bp    integer NOT NULL CHECK (share_bp BETWEEN 0 AND 10000),   -- 0: the label pays it
  added_by    uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- What a period's statements took back toward the balance.
CREATE TABLE recoupment_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES recoupment_accounts(id) ON DELETE CASCADE,
  period        date NOT NULL CHECK (extract(day FROM period) = 1),
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  source        text NOT NULL,         -- the statement it came from
  UNIQUE (account_id, period)
);

-- The cross-tenant guard also covers payout and recoupment references.
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payees', 'payout_lines', 'payee_requests', 'recoupment_accounts', 'recoupable_costs', 'recoupment_entries'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant()', t || '_same_tenant', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['payout_policies', 'payees', 'payout_batches', 'payout_lines', 'payee_requests', 'recoupment_accounts', 'recoupable_costs', 'recoupment_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_team', t);
  END LOOP;
END $$;

-- A payee reads their own payee record, their own lines and the batches those are in.
CREATE POLICY payees_own ON payees FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND party_id = app_party());
CREATE POLICY payout_lines_own ON payout_lines FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND party_id = app_party());
CREATE FUNCTION app_has_line_in(b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM payout_lines WHERE batch_id = b AND party_id = app_party()) $$;
GRANT EXECUTE ON FUNCTION app_has_line_in(uuid) TO br_app;
CREATE POLICY payout_batches_own ON payout_batches FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND app_has_line_in(id));
CREATE POLICY payout_policies_payee ON payout_policies FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee');

-- The portal lists a payee's splits by name ("Glasshouse, Kesi Vale"): a payee can read the
-- split nodes above the ones they're on, and the songs they write and their own writer share.
CREATE FUNCTION app_payee_split_nodes() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up AS (
    SELECT v.node_id AS id FROM split_versions v JOIN split_parties sp ON sp.version_id = v.id
    WHERE sp.party_id = app_party() AND v.status <> 'draft'
    UNION SELECT n.parent_id FROM split_nodes n JOIN up ON up.id = n.id WHERE n.parent_id IS NOT NULL
  ) SELECT id FROM up
$$;
GRANT EXECUTE ON FUNCTION app_payee_split_nodes() TO br_app;
CREATE POLICY split_nodes_payee_path ON split_nodes FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND id IN (SELECT app_payee_split_nodes()));
CREATE POLICY work_writers_payee_self ON work_writers FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND party_id = app_party());
CREATE POLICY works_payee_writer ON works FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND EXISTS (
    SELECT 1 FROM work_writers ww WHERE ww.work_id = works.id AND ww.party_id = app_party()));

-- Batches: the app may create and update them, never delete them or mark one imported.
GRANT SELECT, UPDATE (status, sent_at, approval_id) ON payout_batches TO br_app;
GRANT INSERT (tenant_id, slug, name, cadence, period, pays_on, status, approval_id) ON payout_batches TO br_app;
GRANT SELECT, INSERT, UPDATE ON payout_lines TO br_app;
GRANT SELECT, INSERT, UPDATE ON payees, payee_requests, recoupment_accounts TO br_app;
GRANT SELECT, INSERT ON payout_policies, recoupable_costs, recoupment_entries TO br_app;

-- migrate:down
DROP POLICY IF EXISTS works_payee_writer ON works;
DROP POLICY IF EXISTS work_writers_payee_self ON work_writers;
DROP POLICY IF EXISTS split_nodes_payee_path ON split_nodes;
-- Put back the guard from the statements migration.
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
DROP TABLE IF EXISTS recoupment_entries, recoupable_costs, recoupment_accounts, payee_requests, payout_lines, payout_batches, payees, payout_policies;
DROP FUNCTION IF EXISTS app_payee_split_nodes(), app_has_line_in(uuid), payout_line_frozen(), payout_batch_guard();
DROP TYPE IF EXISTS payee_request_kind, payout_line_status, batch_status, pay_cadence;
