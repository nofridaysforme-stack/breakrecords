-- migrate:up

-- Assigning ISRCs and UPCs from a workspace's own prefixes.
--  * code_prefixes: the workspace's US ISRC Rights Owner Prefix (country + registrant code) and
--    its GS1 company prefix, with the next number to hand out. Only owners set them.
--  * app_assign_isrc / app_assign_upc: give a recording or release the next unused code. The
--    number only goes up; a code anyone already uses (ISRCs and UPCs are unique across the
--    platform) is skipped. ISRCs restart at 00001 each year. The rules match
--    packages/core/src/codes.ts.

CREATE TABLE code_prefixes (
  tenant_id    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  isrc_prefix  text CHECK (isrc_prefix ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
  isrc_year    smallint,
  isrc_next    integer NOT NULL DEFAULT 1 CHECK (isrc_next BETWEEN 1 AND 100000),
  gs1_prefix   text CHECK (gs1_prefix ~ '^\d{6,10}$'),
  upc_next     bigint NOT NULL DEFAULT 1 CHECK (upc_next >= 1),
  updated_by   uuid REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE code_prefixes ENABLE ROW LEVEL SECURITY;
CREATE POLICY code_prefixes_team ON code_prefixes FOR SELECT TO br_app
  USING (tenant_id = app_current_tenant() AND app_role() IN ('owner', 'team'));
GRANT SELECT ON code_prefixes TO br_app;

/** The GS1 check digit for the digits before it. */
CREATE FUNCTION gtin_check_digit(body text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT (10 - (sum(substr(reverse(body), i, 1)::int * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END) % 10)) % 10
  FROM generate_series(1, length(body)) i
$$;

/** Owners set the prefixes. An empty value clears one. Changing the GS1 prefix restarts its numbering. */
CREATE FUNCTION app_set_code_prefixes(isrc text, gs1 text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE i text := nullif(upper(regexp_replace(coalesce(isrc, ''), '[\s-]', '', 'g')), '');
        g text := nullif(regexp_replace(coalesce(gs1, ''), '[\s-]', '', 'g'), '');
BEGIN
  IF app_current_tenant() IS NULL OR app_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the owners set code prefixes' USING ERRCODE = '42501';
  END IF;
  INSERT INTO code_prefixes (tenant_id, isrc_prefix, gs1_prefix, updated_by) VALUES (app_current_tenant(), i, g, app_user())
  ON CONFLICT (tenant_id) DO UPDATE SET
    isrc_prefix = EXCLUDED.isrc_prefix,
    isrc_next = CASE WHEN code_prefixes.isrc_prefix IS DISTINCT FROM EXCLUDED.isrc_prefix THEN 1 ELSE code_prefixes.isrc_next END,
    gs1_prefix = EXCLUDED.gs1_prefix,
    upc_next = CASE WHEN code_prefixes.gs1_prefix IS DISTINCT FROM EXCLUDED.gs1_prefix THEN 1 ELSE code_prefixes.upc_next END,
    updated_by = EXCLUDED.updated_by, updated_at = now();
END $$;

/** Gives a recording that has no ISRC the next one from the workspace's prefix. */
CREATE FUNCTION app_assign_isrc(rec_slug text) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE p code_prefixes; r recordings; yr int := extract(year FROM now())::int; n int; code text;
BEGIN
  IF app_current_tenant() IS NULL OR app_role() NOT IN ('owner', 'team') THEN RAISE EXCEPTION 'only the owners and team assign codes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM recordings WHERE tenant_id = app_current_tenant() AND slug = rec_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such recording' USING ERRCODE = 'P0002'; END IF;
  IF r.isrc IS NOT NULL THEN RAISE EXCEPTION 'this recording already has an ISRC' USING ERRCODE = '23505'; END IF;
  SELECT * INTO p FROM code_prefixes WHERE tenant_id = app_current_tenant() FOR UPDATE;
  IF NOT FOUND OR p.isrc_prefix IS NULL THEN RAISE EXCEPTION 'set your ISRC prefix in Settings first' USING ERRCODE = '22023'; END IF;
  n := CASE WHEN p.isrc_year IS DISTINCT FROM yr THEN 1 ELSE p.isrc_next END;
  LOOP
    IF n > 99999 THEN RAISE EXCEPTION 'this year''s ISRCs for your prefix are used up' USING ERRCODE = '22023'; END IF;
    code := p.isrc_prefix || lpad((yr % 100)::text, 2, '0') || lpad(n::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM recordings WHERE isrc = code);
    n := n + 1;
  END LOOP;
  UPDATE recordings SET isrc = code, updated_by = app_user(), updated_at = now() WHERE id = r.id;
  UPDATE code_prefixes SET isrc_year = yr, isrc_next = n + 1 WHERE tenant_id = p.tenant_id;
  RETURN code;
END $$;

/** Gives a release that has no UPC the next one from the workspace's GS1 prefix. */
CREATE FUNCTION app_assign_upc(rel_slug text) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE p code_prefixes; r releases; n bigint; body text; code text; cap bigint;
BEGIN
  IF app_current_tenant() IS NULL OR app_role() NOT IN ('owner', 'team') THEN RAISE EXCEPTION 'only the owners and team assign codes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM releases WHERE tenant_id = app_current_tenant() AND slug = rel_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such release' USING ERRCODE = 'P0002'; END IF;
  IF r.upc IS NOT NULL THEN RAISE EXCEPTION 'this release already has a UPC' USING ERRCODE = '23505'; END IF;
  SELECT * INTO p FROM code_prefixes WHERE tenant_id = app_current_tenant() FOR UPDATE;
  IF NOT FOUND OR p.gs1_prefix IS NULL THEN RAISE EXCEPTION 'set your GS1 company prefix in Settings first' USING ERRCODE = '22023'; END IF;
  cap := (10::bigint ^ (11 - length(p.gs1_prefix)))::bigint - 1;
  n := p.upc_next;
  LOOP
    IF n > cap THEN RAISE EXCEPTION 'your GS1 prefix has no numbers left' USING ERRCODE = '22023'; END IF;
    body := p.gs1_prefix || lpad(n::text, 11 - length(p.gs1_prefix), '0');
    code := body || gtin_check_digit(body)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM releases WHERE upc = code);
    n := n + 1;
  END LOOP;
  UPDATE releases SET upc = code WHERE id = r.id;
  UPDATE code_prefixes SET upc_next = n + 1 WHERE tenant_id = p.tenant_id;
  RETURN code;
END $$;

-- A UPC typed into the app is checked there (packages/core/src/codes.ts: isUpc), so codes
-- imported as they were sent are kept even when their check digit is wrong.

GRANT EXECUTE ON FUNCTION app_set_code_prefixes(text, text), app_assign_isrc(text), app_assign_upc(text), gtin_check_digit(text) TO br_app;

-- migrate:down
DROP FUNCTION IF EXISTS app_assign_upc(text), app_assign_isrc(text), app_set_code_prefixes(text, text);
DROP TABLE IF EXISTS code_prefixes;
DROP FUNCTION IF EXISTS gtin_check_digit(text);
