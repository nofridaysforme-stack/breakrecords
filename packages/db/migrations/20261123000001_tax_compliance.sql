-- migrate:up

-- Tax compliance (Build List P1 #3).
--  * Withholding is worked out from each payee's form (packages/core/src/tax.ts):
--      W-9: none, unless the IRS has told the label to backup withhold (`backup_withholding`).
--      W-8BEN / W-8BEN-E: 30%, or the treaty rate when a treaty is recorded.
--      No form, or a W-8 past its expiry: the workspace's `missing_form_policy` decides:
--      hold their payout (the default), or pay with 24% backup withholding.
--  * A payee certifies their own form in the portal (app_submit_tax_form). The full taxpayer
--    number is never stored here: only its last four digits. The payout provider holds the
--    rest (Stage 3).
--  * Year-end filings (1099-MISC for US payees, 1042-S for foreign ones) are prepared as an
--    approval card. Nothing is filed from here: once approved, the label downloads the file
--    and marks the year filed after uploading it to the IRS.
ALTER TABLE payees
  ADD COLUMN backup_withholding boolean NOT NULL DEFAULT false,
  ADD COLUMN tax_legal_name     text CHECK (tax_legal_name IS NULL OR length(btrim(tax_legal_name)) BETWEEN 1 AND 200),
  ADD COLUMN tin_last4          text CHECK (tin_last4 ~ '^\d{4}$'),
  ADD COLUMN tax_signature      text CHECK (tax_signature IS NULL OR length(btrim(tax_signature)) BETWEEN 1 AND 200),
  ADD COLUMN tax_country        char(2) CHECK (tax_country ~ '^[A-Z]{2}$');

ALTER TABLE payout_policies
  ADD COLUMN missing_form_policy text NOT NULL DEFAULT 'hold' CHECK (missing_form_policy IN ('hold', 'withhold'));

CREATE TABLE tax_filings (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year         integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  approval_id  text NOT NULL,
  prepared_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  prepared_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  filed_at     timestamptz,
  filed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, year),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  CHECK ((filed_at IS NULL) = (filed_by IS NULL))
);
ALTER TABLE tax_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_filings_team ON tax_filings FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT, INSERT ON tax_filings TO br_app;
GRANT UPDATE (filed_at, filed_by) ON tax_filings TO br_app;
GRANT UPDATE (missing_form_policy) ON payout_policies TO br_app;

-- A year is marked filed only after its approval card was approved.
CREATE FUNCTION tax_filing_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.filed_at IS NOT NULL THEN RAISE EXCEPTION 'the % filing is already marked filed', OLD.year; END IF;
  IF NEW.filed_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM approval_decisions d WHERE d.tenant_id = NEW.tenant_id AND d.approval_id = NEW.approval_id AND d.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'the % filing has not been approved', NEW.year;
  END IF;
  -- Filed with the IRS: the approval can no longer be undone.
  IF NEW.filed_at IS NOT NULL THEN
    UPDATE approvals SET executed_at = coalesce(executed_at, now()) WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_filings_guard BEFORE UPDATE ON tax_filings FOR EACH ROW EXECUTE FUNCTION tax_filing_guard();

-- A payee certifies their own tax form. Only the signed-in payee, only for themselves. Any
-- open request for a tax form is closed by it.
CREATE FUNCTION app_submit_tax_form(form text, legal_name text, tin4 text, signature text, country text,
                                    t_country text, t_article text, t_rate integer, signed date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_party();
BEGIN
  IF me IS NULL OR app_role() <> 'payee' THEN RAISE EXCEPTION 'only a payee can submit their own tax form' USING ERRCODE = '42501'; END IF;
  IF form NOT IN ('W-9', 'W-8BEN', 'W-8BEN-E') THEN RAISE EXCEPTION 'unknown form %', form USING ERRCODE = '22023'; END IF;
  UPDATE payees SET
    tax_form = form, tax_signed_on = signed,
    tax_expires_on = CASE WHEN form = 'W-9' THEN NULL ELSE make_date(extract(year FROM signed)::int + 3, 12, 31) END,
    tax_legal_name = legal_name, tin_last4 = tin4, tax_signature = signature,
    tax_country = CASE WHEN form = 'W-9' THEN 'US' ELSE country END,
    treaty_country = CASE WHEN form = 'W-9' THEN NULL ELSE t_country END,
    treaty_article = CASE WHEN form = 'W-9' THEN NULL ELSE t_article END,
    treaty_rate_bp = CASE WHEN form = 'W-9' THEN NULL ELSE t_rate END,
    backup_withholding = CASE WHEN form = 'W-9' THEN backup_withholding ELSE false END
  WHERE party_id = me AND tenant_id = app_current_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'no payee record' USING ERRCODE = '42501'; END IF;
  UPDATE payee_requests SET done_at = clock_timestamp() WHERE party_id = me AND kind = 'tax_form' AND done_at IS NULL;
  INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
  SELECT app_current_tenant(), 'AUD-TAX-' || upper(substr(md5(random()::text), 1, 8)), app_user(), 'tax_form.submitted', p.slug,
         jsonb_build_object('form', form, 'treaty', t_country IS NOT NULL)
  FROM parties p WHERE p.id = me;
END $$;
REVOKE ALL ON FUNCTION app_submit_tax_form(text, text, text, text, text, text, text, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_tax_form(text, text, text, text, text, text, text, integer, date) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_submit_tax_form(text, text, text, text, text, text, text, integer, date);
DROP TABLE IF EXISTS tax_filings;
DROP FUNCTION IF EXISTS tax_filing_guard();
ALTER TABLE payout_policies DROP COLUMN IF EXISTS missing_form_policy;
ALTER TABLE payees DROP COLUMN IF EXISTS tax_country, DROP COLUMN IF EXISTS tax_signature, DROP COLUMN IF EXISTS tin_last4,
  DROP COLUMN IF EXISTS tax_legal_name, DROP COLUMN IF EXISTS backup_withholding;
