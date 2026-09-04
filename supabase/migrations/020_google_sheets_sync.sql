-- Migration 020: Google Sheets Integration Table and Sync Triggers

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- 2. Create the Sync Table
CREATE TABLE public.daily_report_sync (
    report_id UUID PRIMARY KEY REFERENCES public.daily_reports(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed', 'permanently_failed')),
    external_row_reference INTEGER, -- Stores the Google Sheet row number for O(1) updates
    attempt_count INTEGER DEFAULT 0,
    error_message TEXT,
    last_attempt_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Set up RLS for daily_report_sync
ALTER TABLE public.daily_report_sync ENABLE ROW LEVEL SECURITY;

-- Only Admins and Super Admins can view the sync logs
CREATE POLICY "Admins and Super Admins can view sync logs"
ON public.daily_report_sync FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Super Admin')
    )
);

-- 4. Trigger Function to queue a report for sync when submitted
CREATE OR REPLACE FUNCTION queue_report_for_sync() RETURNS TRIGGER AS $$
DECLARE
    edge_function_url TEXT;
    webhook_secret TEXT;
    request_id BIGINT;
BEGIN
    -- Only trigger when a report transitions to 'submitted'
    IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
        
        -- Upsert a 'pending' record into the sync table
        INSERT INTO public.daily_report_sync (report_id, status, created_at, updated_at)
        VALUES (NEW.id, 'pending', NOW(), NOW())
        ON CONFLICT (report_id) DO UPDATE 
        SET status = 'pending', attempt_count = 0, error_message = NULL, updated_at = NOW();
        
        -- Retrieve webhook secret and URL from Supabase Vault
        SELECT secret INTO webhook_secret FROM vault.decrypted_secrets WHERE name = 'sync_webhook_secret';
        SELECT secret INTO edge_function_url FROM vault.decrypted_secrets WHERE name = 'sync_edge_function_url';

        IF edge_function_url IS NOT NULL AND edge_function_url != '' THEN
            SELECT net.http_post(
                url := edge_function_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || COALESCE(webhook_secret, '')
                ),
                body := jsonb_build_object(
                    'type', 'SYNC_REPORT',
                    'report_id', NEW.id
                )
            ) INTO request_id;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach the trigger to daily_reports
DROP TRIGGER IF EXISTS on_report_submitted ON public.daily_reports;
CREATE TRIGGER on_report_submitted
AFTER UPDATE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION queue_report_for_sync();

-- 6. Retry Worker (pg_cron)
CREATE OR REPLACE FUNCTION retry_failed_syncs() RETURNS void AS $$
DECLARE
    sync_record RECORD;
    edge_function_url TEXT;
    webhook_secret TEXT;
    request_id BIGINT;
BEGIN
    -- Retrieve Vault secrets
    SELECT secret INTO webhook_secret FROM vault.decrypted_secrets WHERE name = 'sync_webhook_secret';
    SELECT secret INTO edge_function_url FROM vault.decrypted_secrets WHERE name = 'sync_edge_function_url';
    
    IF edge_function_url IS NULL OR edge_function_url = '' THEN
        RETURN;
    END IF;

    -- Process pending or failed records that haven't hit max attempts
    -- SKIP LOCKED prevents concurrent cron runs from processing the same row
    FOR sync_record IN 
        SELECT report_id FROM public.daily_report_sync 
        WHERE status IN ('pending', 'failed') 
        AND attempt_count < 5
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Update the last_attempt_at timestamp to indicate we tried
        UPDATE public.daily_report_sync 
        SET last_attempt_at = NOW()
        WHERE report_id = sync_record.report_id;
        
        -- Fire async webhook
        SELECT net.http_post(
            url := edge_function_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(webhook_secret, '')
            ),
            body := jsonb_build_object(
                'type', 'SYNC_REPORT',
                'report_id', sync_record.report_id
            )
        ) INTO request_id;
    END LOOP;
    
    -- Mark permanently failed
    UPDATE public.daily_report_sync
    SET status = 'permanently_failed', updated_at = NOW()
    WHERE status = 'failed' AND attempt_count >= 5;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Schedule the retry worker every 15 minutes
SELECT cron.schedule('retry_failed_syncs_cron', '*/15 * * * *', 'SELECT retry_failed_syncs();');
