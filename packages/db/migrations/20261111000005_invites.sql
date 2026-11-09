-- migrate:up

-- Invitations are allowlist entries (owners add and remove them; first sign-in turns one into
-- a membership). This lists the current label's invitations for its owners, with whether each
-- person has signed in yet.
CREATE FUNCTION app_invites() RETURNS TABLE (email text, role member_role, party_slug text, added_at timestamptz, joined boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.email, a.role, a.party_slug, a.added_at,
         EXISTS (SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = a.email AND m.tenant_id = a.tenant_id)
  FROM allowlist a
  WHERE a.tenant_id = app_current_tenant() AND app_role() = 'owner'
  ORDER BY a.added_at DESC, a.email
$$;
GRANT EXECUTE ON FUNCTION app_invites() TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_invites();
