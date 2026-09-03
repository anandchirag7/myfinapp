select vault.create_secret(
  'https://your-production-paisa-domain.com',
  'paisa_app_url',
  'Production Paisa application URL'
);

select vault.create_secret(
  'THE_SAME_VALUE_AS_STATEMENT_WORKER_SECRET',
  'paisa_statement_worker_secret',
  'Authentication secret for the statement worker'
);


select cron.schedule(
  'paisa-statement-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'paisa_app_url'
    ) || '/api/public/hooks/statement-worker',

    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'paisa_statement_worker_secret'
      )
    ),

    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select
  jobid,
  jobname,
  schedule,
  active
from cron.job
where jobname = 'paisa-statement-worker';


select net.http_post(
  url := (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'paisa_app_url'
  ) || '/api/public/hooks/statement-worker',

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization',
    'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'paisa_statement_worker_secret'
    )
  ),

  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);


select
  status,
  start_time,
  end_time,
  return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'paisa-statement-worker'
)
order by start_time desc
limit 20;


select cron.unschedule('paisa-statement-worker');

select vault.update_secret(
  (
    select id
    from vault.secrets
    where name = 'paisa_app_url'
  ),
  'https://your-new-paisa-domain.com'
);

select vault.update_secret(
  (
    select id
    from vault.secrets
    where name = 'paisa_statement_worker_secret'
  ),
  'YOUR_NEW_SECRET'
);

select id, name, description, updated_at
from vault.secrets
where name in (
  'paisa_app_url',
  'paisa_statement_worker_secret'
);