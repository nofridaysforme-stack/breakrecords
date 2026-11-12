-- migrate:up

-- A release node in the split tree points at its release, so a release's split is found from
-- Catalog (and a release gets at most one). Older nodes without one keep working by name.
ALTER TABLE split_nodes ADD COLUMN release_id uuid REFERENCES releases(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX split_nodes_release ON split_nodes (release_id) WHERE release_id IS NOT NULL;
-- The existing same-tenant guard on split_nodes already checks release_id.

-- A solo artist's own workspace: the owner says they are the release's artist, so they can
-- sign that line of the split themselves. Only their own membership, only a party in this
-- workspace, and only if they aren't linked to someone else already.
CREATE FUNCTION app_link_me_to_party(p uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_role() NOT IN ('owner', 'team') THEN RAISE EXCEPTION 'only the workspace’s owners and team' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM parties WHERE id = p AND tenant_id = app_current_tenant()) THEN RAISE EXCEPTION 'no such party' USING ERRCODE = '42501'; END IF;
  UPDATE memberships SET party_id = p WHERE user_id = app_user() AND tenant_id = app_current_tenant() AND party_id IS NULL;
END $$;
REVOKE ALL ON FUNCTION app_link_me_to_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_link_me_to_party(uuid) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_link_me_to_party(uuid);
DROP INDEX IF EXISTS split_nodes_release;
ALTER TABLE split_nodes DROP COLUMN IF EXISTS release_id;
