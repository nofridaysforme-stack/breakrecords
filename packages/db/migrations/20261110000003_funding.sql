-- migrate:up

-- Funding (5d, 5e, 5j).
--  * opportunities: grants Funding Scout found, and offers the label received, with their real
--    terms (cash, what's repaid, the share given up, the album a sale takes). Cards and the
--    comparison are worked out from these terms, never stored as text.
--  * the comparison's starting assumptions per label (Finance Agent's estimate today; from
--    12 months of statements once those are imported, Stage 1).
--  * questions for the offerers, which Finance Agent turns into drafts the label sends itself.
-- Dismissing or declining is recorded (and can be undone); accepting goes through approvals.
-- Only the label's owner and team see any of it.

CREATE TYPE funding_kind AS ENUM ('grant', 'advance', 'sale');

CREATE TABLE funding_assumptions (
  tenant_id                  uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  annual_income_cents        bigint NOT NULL CHECK (annual_income_cents >= 0),
  growth_bp                  integer NOT NULL DEFAULT 0 CHECK (growth_bp > -10000),
  album_annual_income_cents  bigint NOT NULL CHECK (album_annual_income_cents >= 0),
  years                      smallint NOT NULL DEFAULT 5 CHECK (years BETWEEN 1 AND 30),
  updated_on                 date NOT NULL DEFAULT current_date
);

CREATE TABLE funding_opportunities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug               text NOT NULL CHECK (slug ~ '^[a-z0-9_-]+$'),
  kind               funding_kind NOT NULL,
  title              text,                  -- a grant's name; an offer's title is its terms
  cash_cents         bigint NOT NULL CHECK (cash_cents > 0),
  up_to              boolean NOT NULL DEFAULT false,
  repay_total_cents  bigint,
  share_bp           integer CHECK (share_bp BETWEEN 1 AND 10000),
  album_release_id   uuid REFERENCES releases(id),
  offerer            text,
  received_on        date,
  deadline           date NOT NULL,         -- a grant's deadline, or how long an offer stays open
  buy_back           text,
  fit_bp             integer NOT NULL CHECK (fit_bp BETWEEN 0 AND 10000),
  draft_pct          smallint CHECK (draft_pct BETWEEN 0 AND 100),
  approval_id        text,                  -- the application, waiting in approvals
  verified_on        date NOT NULL,
  dismissed_at       timestamptz,
  dismissed_by       uuid REFERENCES users(id),
  declined_at        timestamptz,
  declined_by        uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES approvals(tenant_id, id),
  CHECK (kind <> 'grant' OR (title IS NOT NULL AND repay_total_cents IS NULL AND share_bp IS NULL)),
  CHECK (kind <> 'advance' OR (repay_total_cents IS NOT NULL AND repay_total_cents >= cash_cents AND share_bp IS NOT NULL)),
  CHECK (kind <> 'sale' OR (share_bp IS NOT NULL AND album_release_id IS NOT NULL)),
  CHECK (kind <> 'grant' OR declined_at IS NULL)
);

CREATE TABLE funding_questions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  text       text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 500),
  asked_by   uuid REFERENCES users(id),
  asked_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['funding_assumptions', 'funding_opportunities', 'funding_questions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_team', t);
  END LOOP;
END $$;
CREATE TRIGGER funding_opportunities_same_tenant BEFORE INSERT OR UPDATE ON funding_opportunities FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();
GRANT SELECT, INSERT, UPDATE ON funding_assumptions TO br_app;
GRANT SELECT, INSERT ON funding_opportunities, funding_questions TO br_app;
-- Dismissing and declining are the only changes the app makes to an opportunity.
GRANT UPDATE (dismissed_at, dismissed_by, declined_at, declined_by) ON funding_opportunities TO br_app;

-- migrate:down
DROP TABLE IF EXISTS funding_questions, funding_opportunities, funding_assumptions;
DROP TYPE IF EXISTS funding_kind;
