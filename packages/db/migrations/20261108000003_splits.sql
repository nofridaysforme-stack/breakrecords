-- migrate:up

-- Splits (Splits and Percentage Spec > Rules engine). A tree of nodes (label, artist, release,
-- income type); a node without versions inherits its parent's split. Each node's split is a
-- versioned rule: draft, sent for signatures, in effect once every party signs, superseded by
-- the next. Shares are basis points; a version can only leave draft when net profit is 100%.

CREATE TYPE split_status AS ENUM ('draft', 'sent', 'in_effect', 'superseded');
CREATE TYPE split_role AS ENUM ('producer', 'label', 'artist', 'feature');

CREATE TABLE split_nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  label       text NOT NULL,
  parent_id   uuid REFERENCES split_nodes(id) ON DELETE CASCADE,
  position    smallint NOT NULL DEFAULT 0,
  -- What the agreement says, until contracts are live (shown beside the split).
  deal_notes  jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE split_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  node_id         uuid NOT NULL REFERENCES split_nodes(id) ON DELETE CASCADE,
  version         integer NOT NULL CHECK (version > 0),
  status          split_status NOT NULL DEFAULT 'draft',
  deal_type       text NOT NULL DEFAULT 'net_profit' CHECK (deal_type = 'net_profit'),
  terms           jsonb NOT NULL,
  effective_from  date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by      uuid REFERENCES users(id),
  sent_at         timestamptz,
  in_effect_at    timestamptz,
  UNIQUE (node_id, version),
  CHECK (jsonb_typeof(terms->'producerBp') = 'number' AND jsonb_typeof(terms->'labelOfNetBp') = 'number'
     AND jsonb_typeof(terms->'artistOfNetBp') = 'number' AND jsonb_typeof(terms->'featureOfArtistBp') = 'number'),
  -- Only a draft may leave net profit unassigned.
  CHECK (status = 'draft' OR (terms->>'labelOfNetBp')::int + (terms->>'artistOfNetBp')::int = 10000)
);
CREATE UNIQUE INDEX split_versions_one_open ON split_versions (node_id) WHERE status IN ('draft', 'sent');
CREATE UNIQUE INDEX split_versions_one_in_effect ON split_versions (node_id) WHERE status = 'in_effect';

-- Who each version pays, and when they signed.
CREATE TABLE split_parties (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_id  uuid NOT NULL REFERENCES split_versions(id) ON DELETE CASCADE,
  role        split_role NOT NULL,
  party_id    uuid NOT NULL REFERENCES parties(id),
  signed_at   timestamptz,
  signed_by   uuid REFERENCES users(id),
  PRIMARY KEY (version_id, role)
);

-- A payee's login is linked to the party they are, so they can see and sign their own splits.
ALTER TABLE memberships ADD COLUMN party_id uuid REFERENCES parties(id) ON DELETE SET NULL;
ALTER TABLE allowlist ADD COLUMN party_slug text;

CREATE FUNCTION app_party() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT party_id FROM memberships WHERE user_id = app_user() AND tenant_id = app_tenant() $$;
GRANT EXECUTE ON FUNCTION app_party() TO br_app;

-- Claiming an invitation also links the payee's party, if the invitation names one.
CREATE OR REPLACE FUNCTION app_claim_invites(u uuid) RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO memberships (user_id, tenant_id, role, party_id)
    SELECT u, a.tenant_id, a.role, (SELECT p.id FROM parties p WHERE p.tenant_id = a.tenant_id AND p.slug = a.party_slug)
    FROM allowlist a JOIN users usr ON usr.email = a.email
    WHERE usr.id = u
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET party_id = coalesce(memberships.party_id, EXCLUDED.party_id)
    RETURNING 1
  ) SELECT count(*)::int FROM ins
$$;

ALTER TABLE split_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_parties ENABLE ROW LEVEL SECURITY;

-- Owners and team manage every split. A payee can read the versions they're a party to
-- (and the nodes those hang on), and sign only their own line.
CREATE POLICY split_nodes_team ON split_nodes FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY split_nodes_payee ON split_nodes FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND EXISTS (
    SELECT 1 FROM split_versions v JOIN split_parties sp ON sp.version_id = v.id WHERE v.node_id = split_nodes.id AND sp.party_id = app_party()));

CREATE POLICY split_versions_team ON split_versions FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE POLICY split_versions_payee ON split_versions FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND status <> 'draft' AND EXISTS (
    SELECT 1 FROM split_parties sp WHERE sp.version_id = split_versions.id AND sp.party_id = app_party()));

CREATE POLICY split_parties_team ON split_parties FOR ALL TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'))
  WITH CHECK (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
CREATE FUNCTION app_is_split_party(v uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM split_parties WHERE version_id = v AND party_id = app_party()) $$;
GRANT EXECUTE ON FUNCTION app_is_split_party(uuid) TO br_app;
CREATE POLICY split_parties_payee_read ON split_parties FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND app_is_split_party(version_id));
CREATE POLICY split_parties_payee_sign ON split_parties FOR UPDATE TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND party_id = app_party() AND signed_at IS NULL)
  WITH CHECK (party_id = app_party() AND signed_by = app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON split_nodes, split_versions, split_parties TO br_app;

-- A payee can read the names of the people on splits they're party to (and no other parties).
CREATE POLICY parties_payee_cosigners ON parties FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() = 'payee' AND EXISTS (
    SELECT 1 FROM split_parties sp WHERE sp.party_id = parties.id AND app_is_split_party(sp.version_id)));

-- The cross-tenant guard also covers split references. SECURITY DEFINER: it only reads which
-- tenant a referenced row belongs to, and must work for a payee who can't read those tables.
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
           WHERE key IN ('work_id', 'recording_id', 'release_id', 'party_id', 'artist_id', 'node_id', 'version_id', 'parent_id') AND value IS NOT NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT tenant_id FROM works WHERE id = r.value::uuid AND r.key = 'work_id'
        UNION ALL SELECT tenant_id FROM recordings WHERE id = r.value::uuid AND r.key = 'recording_id'
        UNION ALL SELECT tenant_id FROM releases WHERE id = r.value::uuid AND r.key = 'release_id'
        UNION ALL SELECT tenant_id FROM parties WHERE id = r.value::uuid AND r.key IN ('party_id', 'artist_id')
        UNION ALL SELECT tenant_id FROM split_nodes WHERE id = r.value::uuid AND r.key IN ('node_id', 'parent_id')
        UNION ALL SELECT tenant_id FROM split_versions WHERE id = r.value::uuid AND r.key = 'version_id'
      ) t WHERE t.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'cross-tenant reference: % % does not belong to tenant %', r.key, r.value, NEW.tenant_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
-- The last signature puts a sent version in effect and supersedes the one it replaces.
-- SECURITY DEFINER: the last signer may be a payee, who can't change versions directly.
CREATE FUNCTION split_take_effect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v split_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM split_versions WHERE id = NEW.version_id FOR UPDATE;
  IF v.status = 'sent' AND NOT EXISTS (SELECT 1 FROM split_parties WHERE version_id = v.id AND signed_at IS NULL) THEN
    UPDATE split_versions SET status = 'superseded' WHERE node_id = v.node_id AND status = 'in_effect';
    UPDATE split_versions SET status = 'in_effect', in_effect_at = now() WHERE id = v.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER split_parties_take_effect AFTER UPDATE OF signed_at ON split_parties FOR EACH ROW
  WHEN (NEW.signed_at IS NOT NULL) EXECUTE FUNCTION split_take_effect();

CREATE TRIGGER split_nodes_same_tenant BEFORE INSERT OR UPDATE ON split_nodes FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();
CREATE TRIGGER split_versions_same_tenant BEFORE INSERT OR UPDATE ON split_versions FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();
CREATE TRIGGER split_parties_same_tenant BEFORE INSERT OR UPDATE ON split_parties FOR EACH ROW EXECUTE FUNCTION catalog_same_tenant();

-- migrate:down
DROP POLICY IF EXISTS parties_payee_cosigners ON parties;
-- Put back the catalog-only cross-tenant guard (its split branches would point at dropped tables).
CREATE OR REPLACE FUNCTION catalog_same_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TABLE IF EXISTS split_parties, split_versions, split_nodes;
DROP FUNCTION IF EXISTS split_take_effect(), app_is_split_party(uuid), app_party();
ALTER TABLE memberships DROP COLUMN IF EXISTS party_id;
ALTER TABLE allowlist DROP COLUMN IF EXISTS party_slug;
DROP TYPE IF EXISTS split_role, split_status;
