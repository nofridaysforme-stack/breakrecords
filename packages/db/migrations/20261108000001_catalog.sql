-- migrate:up

-- Catalog (Platform Build Plan, core data model): parties, songs (works), recordings,
-- releases and assets, plus registrations with outside bodies. Every row belongs to a
-- tenant. `slug` is the stable id the UI and API use; `id` is internal. created_at uses
-- clock_timestamp() so rows added in one transaction keep their order.
-- Only the label's owner and team can read or change the catalog; payees can't.

CREATE TYPE party_type AS ENUM ('person', 'group', 'company');
CREATE TYPE ai_use AS ENUM ('undeclared', 'none', 'partial_stems', 'partial_vocals', 'partial_artwork', 'full');
CREATE TYPE release_kind AS ENUM ('single', 'ep', 'album');
CREATE TYPE asset_kind AS ENUM ('cover_art', 'master_audio', 'instrumental', 'stems', 'lyrics', 'press_photo', 'document');
CREATE TYPE reg_org AS ENUM ('pro', 'mlc', 'sx_owner', 'sx_artist', 'copyright', 'neighboring');
CREATE TYPE reg_status AS ENUM ('notStarted', 'prepared', 'needsYou', 'submitted', 'confirmed', 'blocked');

-- Anyone who is paid or credited: artist, band, writer, producer, engineer, company.
CREATE TABLE parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  type        party_type NOT NULL DEFAULT 'person',
  ipi         text,
  isni        text,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

-- A song (composition).
CREATE TABLE works (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  title       text NOT NULL,
  iswc        text CHECK (iswc ~ '^T-\d{3}\.\d{3}\.\d{3}-\d$'),
  has_lyrics  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

-- Writer shares in basis points (10000 = 100%). Unconfirmed until every writer signs the
-- split sheet (Splits spec); a work's confirmed shares must total exactly 10000.
CREATE TABLE work_writers (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_id     uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  party_id    uuid NOT NULL REFERENCES parties(id),
  share_bp    integer NOT NULL CHECK (share_bp BETWEEN 1 AND 10000),
  confirmed   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (work_id, party_id)
);

-- A master.
CREATE TABLE recordings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  title       text NOT NULL,
  work_id     uuid REFERENCES works(id),
  artist_id   uuid NOT NULL REFERENCES parties(id),
  isrc        text UNIQUE CHECK (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}\d{7}$'),
  duration_s  integer CHECK (duration_s > 0),
  genre       text CHECK (genre IS NULL OR length(btrim(genre)) > 0),
  ai_use      ai_use NOT NULL DEFAULT 'undeclared',
  agent_note  text,                  -- what the Metadata Agent is doing about gaps
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE recording_credits (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recording_id  uuid NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  party_id      uuid NOT NULL REFERENCES parties(id),
  role          text NOT NULL,       -- "Producer, writer", "Mix engineer"
  position      smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (recording_id, party_id)
);

-- A product.
CREATE TABLE releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9_-]+$'),
  title         text NOT NULL,
  kind          release_kind NOT NULL,
  artist_id     uuid NOT NULL REFERENCES parties(id),
  upc           text UNIQUE CHECK (upc ~ '^\d{12,13}$'),
  release_date  date,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE release_tracks (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  release_id    uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  recording_id  uuid NOT NULL REFERENCES recordings(id),
  position      smallint NOT NULL CHECK (position > 0),
  PRIMARY KEY (release_id, position),
  UNIQUE (release_id, recording_id)
);

-- A file. Storage (R2 or S3, signed URLs) arrives with uploads; `storage_key` is null until then.
CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          asset_kind NOT NULL,
  detail        text,                -- "3000px", "8 files"
  release_id    uuid REFERENCES releases(id) ON DELETE SET NULL,
  recording_id  uuid REFERENCES recordings(id) ON DELETE SET NULL,
  ready         boolean NOT NULL DEFAULT false,
  storage_key   text,
  checksum      text,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Filings with outside bodies (PRO, MLC, SoundExchange, Copyright Office, neighboring
-- rights). Songs register with PRO and MLC; recordings with SoundExchange and neighboring
-- societies; copyright covers either.
CREATE TABLE registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org           reg_org NOT NULL,
  work_id       uuid REFERENCES works(id) ON DELETE CASCADE,
  recording_id  uuid REFERENCES recordings(id) ON DELETE CASCADE,
  status        reg_status NOT NULL DEFAULT 'notStarted',
  ref           text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(work_id, recording_id) = 1),
  CHECK (org NOT IN ('pro', 'mlc') OR work_id IS NOT NULL),
  CHECK (org NOT IN ('sx_owner', 'sx_artist', 'neighboring') OR recording_id IS NOT NULL)
);
CREATE UNIQUE INDEX registrations_one_per_subject ON registrations (org, coalesce(work_id, recording_id));

-- A row's tenant must match the tenant of what it points to (no cross-tenant links).
CREATE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW)) WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
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
  FOREACH t IN ARRAY ARRAY['parties', 'works', 'work_writers', 'recordings', 'recording_credits', 'releases', 'release_tracks', 'assets', 'registrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO br_app
      USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
      WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))$p$, t || '_tenant', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO br_app', t);
    IF t IN ('work_writers', 'recordings', 'recording_credits', 'releases', 'release_tracks', 'assets', 'registrations') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant()', t || '_same_tenant', t);
    END IF;
  END LOOP;
END $$;

-- migrate:down
DROP TABLE IF EXISTS registrations, assets, release_tracks, releases, recording_credits, recordings, work_writers, works, parties;
DROP FUNCTION IF EXISTS catalog_same_tenant();
DROP TYPE IF EXISTS reg_status, reg_org, asset_kind, release_kind, ai_use, party_type;
