DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT name FROM vault.decrypted_secrets ORDER BY name LOOP
    RAISE NOTICE '%', r.name;
  END LOOP;
END $$;