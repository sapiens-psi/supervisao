CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  project_url_secret_id UUID;
  anon_key_secret_id UUID;
BEGIN
  SELECT id INTO project_url_secret_id
  FROM vault.secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF project_url_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      'https://jkhhdhigcucxqsewxpba.supabase.co',
      'project_url',
      'Project URL used by pg_cron to invoke Edge Functions',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      project_url_secret_id,
      'https://jkhhdhigcucxqsewxpba.supabase.co',
      'project_url',
      'Project URL used by pg_cron to invoke Edge Functions',
      NULL
    );
  END IF;

  SELECT id INTO anon_key_secret_id
  FROM vault.secrets
  WHERE name = 'anon_key'
  LIMIT 1;

  IF anon_key_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraGhkaGlnY3VjeHFzZXd4cGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzkyNTAsImV4cCI6MjA5NzI1NTI1MH0.q0LVAWXfyFL_wdOsnDdvKcHrcesyBJWWBNZzgu53NRI',
      'anon_key',
      'Anon key used by pg_cron to authenticate scheduled Edge Function calls',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      anon_key_secret_id,
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraGhkaGlnY3VjeHFzZXd4cGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzkyNTAsImV4cCI6MjA5NzI1NTI1MH0.q0LVAWXfyFL_wdOsnDdvKcHrcesyBJWWBNZzgu53NRI',
      'anon_key',
      'Anon key used by pg_cron to authenticate scheduled Edge Function calls',
      NULL
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.invoke_supervision_reminders()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
      || '/functions/v1/send-supervision-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'triggered_at', now()::text
    ),
    timeout_milliseconds := 10000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'send-supervision-reminders-every-minute'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'send-supervision-reminders-every-minute';
  END IF;
END $$;

SELECT cron.schedule(
  'send-supervision-reminders-every-minute',
  '* * * * *',
  $$SELECT public.invoke_supervision_reminders();$$
);
