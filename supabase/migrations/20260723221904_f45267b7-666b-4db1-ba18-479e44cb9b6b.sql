DO $$
DECLARE
  v_row record;
  v_tries int := 0;
BEGIN
  LOOP
    v_tries := v_tries + 1;
    SELECT id, status_code, content::text AS c INTO v_row
      FROM net._http_response
      ORDER BY id DESC LIMIT 1;
    IF v_row.id IS NOT NULL AND v_row.status_code IS NOT NULL THEN
      INSERT INTO public._probe_resp(id, status, content) VALUES (v_row.id, v_row.status_code, v_row.c);
      EXIT;
    END IF;
    EXIT WHEN v_tries > 20;
    PERFORM pg_sleep(2);
  END LOOP;
END $$;