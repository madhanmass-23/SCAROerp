-- ============================================================================
-- Migration 025: Meeting Security - Restrict Meeting Creation by Role
-- Enforce that Interns cannot schedule/create meetings at the database level.
-- Only Super Admins, Admins, and Employees can create meetings.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_meeting_insert_security()
RETURNS TRIGGER AS $$
BEGIN
    -- If created by an authenticated user (not system/service role)
    IF auth.uid() IS NOT NULL THEN
        -- Check if user has the Intern role
        IF EXISTS (
            SELECT 1 
            FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND r.name = 'Intern'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Interns are not permitted to schedule meetings'
                USING ERRCODE = '42501';
        END IF;

        -- Ensure organizer_id is set to the authenticated creator if omitted
        IF NEW.organizer_id IS NULL THEN
            NEW.organizer_id := auth.uid();
        END IF;
    END IF;

    NEW.created_at := NOW();
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_meeting_insert_security ON public.meetings;
CREATE TRIGGER enforce_meeting_insert_security
    BEFORE INSERT ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.handle_meeting_insert_security();
