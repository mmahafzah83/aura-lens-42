CREATE TABLE IF NOT EXISTS public._probe_secret_names (name text, ts timestamptz default now());
INSERT INTO public._probe_secret_names(name) SELECT name FROM vault.decrypted_secrets;