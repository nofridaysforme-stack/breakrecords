-- migrate:up

-- Rights (5c and its tabs). Registrations already exist (catalog migration); this adds money
-- held for the label at collection societies, and artist profile claims at the services.

CREATE TYPE royalty_source AS ENUM ('soundexchange', 'mlc', 'pro');
CREATE TYPE unclaimed_status AS ENUM ('found', 'claim_prepared', 'claimed', 'paid', 'dismissed');
CREATE TYPE profile_service AS ENUM ('spotify', 'apple_music', 'youtube', 'amazon_music');

-- Royalties a society is holding (found by the Rights Agent's weekly search). Integer cents.
CREATE TABLE unclaimed_royalties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9_-]+$'),
  source        royalty_source NOT NULL,
  work_id       uuid REFERENCES works(id) ON DELETE SET NULL,
  recording_id  uuid REFERENCES recordings(id) ON DELETE SET NULL,
  what          text NOT NULL,
  why           text NOT NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  currency      char(3) NOT NULL DEFAULT 'USD',
  held_since    date NOT NULL,
  claim_method  text NOT NULL,
  status        unclaimed_status NOT NULL DEFAULT 'found',
  found_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CHECK (num_nonnulls(work_id, recording_id) <= 1)
);

-- One row per artist per service. Status words match registrations.
CREATE TABLE profile_claims (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id    uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  service     profile_service NOT NULL,
  status      reg_status NOT NULL DEFAULT 'notStarted',
  ref         text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id),
  PRIMARY KEY (party_id, service)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unclaimed_royalties', 'profile_claims'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_tenant', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO br_app', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant()', t || '_same_tenant', t);
  END LOOP;
END $$;

-- migrate:down
DROP TABLE IF EXISTS profile_claims, unclaimed_royalties;
DROP TYPE IF EXISTS profile_service, unclaimed_status, royalty_source;
