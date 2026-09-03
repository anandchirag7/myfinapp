-- Release A: truthful, resumable statement-classification states.
ALTER TYPE public.statement_upload_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.statement_upload_status ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE public.statement_upload_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE public.statement_upload_status ADD VALUE IF NOT EXISTS 'retrying';
ALTER TYPE public.statement_upload_status ADD VALUE IF NOT EXISTS 'cancelled';

