-- migrate:up

-- The team list names each person by the name they gave, else the person they are in the
-- catalog (memberships.party_id), so the activity log and Settings show names, not usernames.
CREATE OR REPLACE FUNCTION app_team() RETURNS TABLE (user_id uuid, name text, email text, role member_role, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, coalesce(nullif(btrim(u.name), ''), p.name), u.email, m.role, m.title
  FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN parties p ON p.id = m.party_id
  WHERE m.tenant_id = app_current_tenant() AND m.role IN ('owner', 'team') AND app_role() IN ('owner', 'team')
  ORDER BY (m.role = 'owner') DESC, m.created_at, u.email
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION app_team() RETURNS TABLE (user_id uuid, name text, email text, role member_role, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, u.name, u.email, m.role, m.title FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = app_current_tenant() AND m.role IN ('owner', 'team') AND app_role() IN ('owner', 'team')
  ORDER BY (m.role = 'owner') DESC, m.created_at, u.email
$$;
