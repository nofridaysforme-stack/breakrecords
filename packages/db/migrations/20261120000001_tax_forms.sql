-- migrate:up

-- Tax forms as the IRS defines them.
--  * A W-9 doesn't expire, so it carries no expiry date.
--  * A W-8BEN or W-8BEN-E is valid until the last day of the third calendar year after the year
--    it was signed. The signing date is kept; the expiry is worked out from it.
--  * A W-8 payee is withheld at 30% unless a treaty country, article and rate are recorded.
--  * Each payout line records what was withheld from it.
UPDATE payees SET tax_expires_on = NULL WHERE tax_form = 'W-9';
ALTER TABLE payees
  ADD COLUMN tax_signed_on   date,
  ADD COLUMN treaty_country  char(2) CHECK (treaty_country ~ '^[A-Z]{2}$'),
  ADD COLUMN treaty_article  text CHECK (treaty_article IS NULL OR length(btrim(treaty_article)) > 0),
  ADD COLUMN treaty_rate_bp  integer CHECK (treaty_rate_bp BETWEEN 0 AND 3000),
  ADD CONSTRAINT payees_w9_no_expiry CHECK (tax_form IS DISTINCT FROM 'W-9' OR tax_expires_on IS NULL),
  ADD CONSTRAINT payees_treaty_w8 CHECK (treaty_country IS NULL OR tax_form IN ('W-8BEN', 'W-8BEN-E')),
  ADD CONSTRAINT payees_treaty_whole CHECK ((treaty_country IS NULL) = (treaty_article IS NULL) AND (treaty_country IS NULL) = (treaty_rate_bp IS NULL));
ALTER TABLE payout_lines ADD COLUMN withheld_cents bigint NOT NULL DEFAULT 0 CHECK (withheld_cents >= 0);

-- migrate:down
ALTER TABLE payout_lines DROP COLUMN IF EXISTS withheld_cents;
ALTER TABLE payees DROP CONSTRAINT IF EXISTS payees_treaty_whole, DROP CONSTRAINT IF EXISTS payees_treaty_w8, DROP CONSTRAINT IF EXISTS payees_w9_no_expiry,
  DROP COLUMN IF EXISTS treaty_rate_bp, DROP COLUMN IF EXISTS treaty_article, DROP COLUMN IF EXISTS treaty_country, DROP COLUMN IF EXISTS tax_signed_on;
