-- Migration 019: Daily Evidence Storage and Attachments Table

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-evidence', 'daily-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies for daily-evidence

-- Allow authenticated users to upload their own evidence
CREATE POLICY "Users can upload their own evidence."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'daily-evidence' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own evidence
CREATE POLICY "Users can read their own evidence."
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'daily-evidence' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own evidence
CREATE POLICY "Users can delete their own evidence."
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'daily-evidence' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow Admins and Super Admins to read all evidence
-- Note: Assuming role is checked via the 'user_roles' table or a secure view.
-- To keep it performant and simple, we check if the user exists in user_roles with role 'Admin' or 'Super Admin'
CREATE POLICY "Admins and Super Admins can read all evidence."
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'daily-evidence' AND
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Super Admin')
    )
);

-- 3. Create daily_report_attachments table
CREATE TABLE IF NOT EXISTS public.daily_report_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Set up RLS for daily_report_attachments
ALTER TABLE public.daily_report_attachments ENABLE ROW LEVEL SECURITY;

-- Users can insert attachments for their own reports
CREATE POLICY "Users can insert their own attachments"
ON public.daily_report_attachments FOR INSERT
TO authenticated
WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.daily_reports dr 
        WHERE dr.id = report_id AND dr.user_id = auth.uid()
    )
);

-- Users can view their own attachments
CREATE POLICY "Users can view their own attachments"
ON public.daily_report_attachments FOR SELECT
TO authenticated
USING (
    uploaded_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Super Admin')
    )
);

-- Users can delete their own attachments (only if report is still draft)
CREATE POLICY "Users can delete their own attachments"
ON public.daily_report_attachments FOR DELETE
TO authenticated
USING (
    uploaded_by = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.daily_reports dr 
        WHERE dr.id = report_id AND dr.status != 'submitted'
    )
);
