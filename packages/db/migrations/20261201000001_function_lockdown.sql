-- migrate:up

-- Only the app role runs our functions. The lockdown's per-schema "REVOKE EXECUTE ... FROM
-- PUBLIC" default is ignored by PostgreSQL (a per-schema default can only add to the global
-- one), so functions created since then were executable by PUBLIC. Take PUBLIC's back from every
-- function of ours (the app role keeps the grants it was given; helpers it was never given stay
-- out of its reach), and change the global default for the role that runs migrations, so new
-- functions start locked too.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- migrate:down
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
