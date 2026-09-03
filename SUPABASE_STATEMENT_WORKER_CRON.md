# Supabase Cron: Paisa Statement Worker

This runbook schedules an authenticated request to the Paisa statement worker every minute.

Run the SQL from **Supabase Dashboard → SQL Editor**. Replace all uppercase placeholders first.

## 1. Application configuration

Configure these server-side variables in the deployed Paisa application:

```env
STATEMENT_QUEUE_ENABLED=true
STATEMENT_WORKER_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=REPLACE_WITH_YOUR_OLLAMA_KEY
OLLAMA_MODEL=REPLACE_WITH_YOUR_MODEL
```

Do not prefix these variables with `VITE_`. Apply the Release A and Release C database migrations before enabling the queue.

## 2. Enable Supabase extensions

Enable `pg_cron`, `pg_net`, and Vault from **Database → Extensions**. Alternatively, run:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
```

If Supabase rejects an extension statement, enable that extension from the Dashboard.

## 3. Create Vault secrets

The URL must be the public production URL of Paisa, without a trailing slash. The worker secret must exactly match the application's `STATEMENT_WORKER_SECRET`.

```sql
select vault.create_secret(
  'https://YOUR-PAISA-DOMAIN',
  'paisa_app_url',
  'Production Paisa application URL'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_STATEMENT_WORKER_SECRET',
  'paisa_statement_worker_secret',
  'Authentication secret for the Paisa statement worker'
);
```

Create each named secret once. Use the update statements below for later changes.

Verify the entries without exposing their decrypted values:

```sql
select id, name, description, created_at, updated_at
from vault.secrets
where name in ('paisa_app_url', 'paisa_statement_worker_secret')
order by name;
```

The query must return exactly two rows.

## 4. Create the Cron job

```sql
select cron.schedule(
  'paisa-statement-worker',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'paisa_app_url'
    ) || '/api/public/hooks/statement-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'paisa_statement_worker_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $cron$
);
```

Do not run this block twice with the same job name. Unschedule the existing job before recreating it.

## 5. Test immediately

This makes the same request without waiting for Cron:

```sql
select net.http_post(
  url := (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'paisa_app_url'
  ) || '/api/public/hooks/statement-worker',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'paisa_statement_worker_secret'
    )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;
```

The immediate result is a request ID. Inspect the HTTP response using the monitoring query below.

## 6. Verify and monitor Cron

Verify the job:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'paisa-statement-worker';
```

Inspect recent Cron executions:

```sql
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'paisa-statement-worker'
)
order by start_time desc
limit 20;
```

If your project permits access to the `pg_net` response table:

```sql
select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 20;
```

Expected responses include `{"processed":false}` when the queue is empty and a response containing `"processed":true` when a job is claimed. HTTP `401` means the application and Vault secrets do not match.

## 7. Update the application URL

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'paisa_app_url'),
  'https://YOUR-NEW-PAISA-DOMAIN'
);
```

The Cron job reads Vault on every execution and does not need to be recreated.

## 8. Rotate the worker secret

First change `STATEMENT_WORKER_SECRET` in the deployed application and redeploy it. Then immediately run:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'paisa_statement_worker_secret'),
  'YOUR_NEW_LONG_RANDOM_SECRET'
);
```

Run the immediate test again after rotation.

## 9. Disable or re-enable the job

Disable:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'paisa-statement-worker'),
  active := false
);
```

Re-enable:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'paisa-statement-worker'),
  active := true
);
```

## 10. Remove the job

```sql
select cron.unschedule('paisa-statement-worker');
```

This does not delete queued messages or Vault secrets.

## 11. Permanently remove the Vault secrets

Only run this when decommissioning the worker:

```sql
delete from vault.secrets
where name in ('paisa_app_url', 'paisa_statement_worker_secret');
```

## Safe rollout order

1. Apply the database migrations.
2. Deploy with `STATEMENT_QUEUE_ENABLED=false` or unset.
3. Configure `STATEMENT_WORKER_SECRET` in the application.
4. Create the Vault secrets and Cron job.
5. Run the immediate test and confirm HTTP 200.
6. Enable `STATEMENT_QUEUE_ENABLED=true` and redeploy.
