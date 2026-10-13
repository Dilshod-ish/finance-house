-- Runs once, at cluster init, as a superuser. Role provisioning is an
-- operations concern, not a schema migration: the migration role owns the
-- schema but normally has neither CREATEROLE nor admin on other roles.
DO $$
DECLARE
  v_grantee text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_app') THEN
    CREATE ROLE fincore_app NOLOGIN;
  END IF;

  -- The login roles that must be able to SET ROLE fincore_app: the one running
  -- this script, and the conventional application login role.
  FOREACH v_grantee IN ARRAY ARRAY[current_user, 'fincore'] LOOP
    IF v_grantee <> 'fincore_app' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_grantee) THEN
      EXECUTE format('GRANT fincore_app TO %I', v_grantee);
    END IF;
  END LOOP;
END
$$;
