-- migrate:up

-- A licensee's owners act as owners in its labels. They could already open them
-- (app_can_access); without a role there, every owner-or-team rule refused them.
CREATE OR REPLACE FUNCTION app_role() RETURNS member_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT coalesce(
    (SELECT role FROM memberships WHERE user_id = app_user() AND tenant_id = app_tenant()),
    (SELECT 'owner'::member_role FROM tenants c JOIN memberships m ON m.tenant_id = c.parent_id
       WHERE c.id = app_tenant() AND m.user_id = app_user() AND m.role = 'owner' LIMIT 1)
  )
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION app_role() RETURNS member_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS
  $$ SELECT role FROM memberships WHERE user_id = app_user() AND tenant_id = app_tenant() $$;
