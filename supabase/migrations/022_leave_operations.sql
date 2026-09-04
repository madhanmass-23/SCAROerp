-- Migration 022: Leave Operations, Security Tampering Protection, and Audit Logging

-- 1. Add 'Cancelled' to public.leave_status_type enum if not exists
ALTER TYPE public.leave_status_type ADD VALUE IF NOT EXISTS 'Cancelled';

-- 2. Add rejection_reason column to public.leave_requests
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

-- Ensure rejection_reason can only be populated if status is Rejected
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS check_rejection_reason_status;
ALTER TABLE public.leave_requests ADD CONSTRAINT check_rejection_reason_status 
    CHECK (status = 'Rejected' OR rejection_reason IS NULL);

-- 3. Composite index for date range queries (attendance correlation, calendar)
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- 4. BEFORE INSERT Trigger: Enforce Default Initial State for Non-Managers
CREATE OR REPLACE FUNCTION public.handle_leave_request_insert()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at := NOW();
    NEW.updated_at := NOW();

    -- Ensure non-managers cannot submit pre-approved or pre-reviewed leave
    IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'leave.manage')) THEN
        NEW.status := 'Pending';
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_leave_insert_security ON public.leave_requests;
CREATE TRIGGER enforce_leave_insert_security
    BEFORE INSERT ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_leave_request_insert();

-- 5. BEFORE UPDATE Trigger: Critical Security & Tampering Protection
CREATE OR REPLACE FUNCTION public.handle_leave_request_security()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_is_manager BOOLEAN := FALSE;
BEGIN
    -- Check manager privileges
    IF v_actor IS NOT NULL AND (public.is_super_admin(v_actor) OR public.has_permission(v_actor, 'leave.manage')) THEN
        v_is_manager := TRUE;
    END IF;

    -- Protect immutable columns
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := NOW();

    -- CASE A: MANAGER (Admin / Super Admin)
    IF v_is_manager THEN
        -- If modifying status
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.status = 'Pending' THEN
                IF NEW.status = 'Approved' THEN
                    NEW.reviewed_by := v_actor;
                    NEW.reviewed_at := NOW();
                    NEW.rejection_reason := NULL;
                ELSIF NEW.status = 'Rejected' THEN
                    NEW.reviewed_by := v_actor;
                    NEW.reviewed_at := NOW();
                    -- Rejection reason should be populated when rejecting
                    IF NEW.rejection_reason IS NULL OR TRIM(NEW.rejection_reason) = '' THEN
                        NEW.rejection_reason := 'Rejected by administrator';
                    END IF;
                ELSE
                    RAISE EXCEPTION 'Invalid status transition for manager review: %', NEW.status;
                END IF;
            ELSE
                RAISE EXCEPTION 'Cannot modify status of a finalized leave request (current status: %)', OLD.status;
            END IF;
        ELSE
            -- Manager updating details without changing status
            NEW.reviewed_by := OLD.reviewed_by;
            NEW.reviewed_at := OLD.reviewed_at;
        END IF;

        RETURN NEW;
    END IF;

    -- CASE B: REGULAR APPLICANT (Employee / Intern)
    IF v_actor IS NOT NULL AND v_actor = OLD.user_id THEN
        -- Applicant can only update while request is Pending
        IF OLD.status != 'Pending' THEN
            RAISE EXCEPTION 'Cannot modify a leave request that is already %', OLD.status;
        END IF;

        -- Applicant status transitions: only Pending -> Cancelled is allowed
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status = 'Cancelled' THEN
                NEW.reviewed_by := NULL;
                NEW.reviewed_at := NULL;
                NEW.rejection_reason := NULL;
            ELSE
                RAISE EXCEPTION 'Unauthorized status transition: applicants cannot approve or reject leave requests';
            END IF;
        ELSE
            -- Applicant updating details while Pending: lock review columns
            NEW.reviewed_by := NULL;
            NEW.reviewed_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;

        RETURN NEW;
    END IF;

    -- CASE C: UNAUTHORIZED USER
    RAISE EXCEPTION 'Permission denied to update leave request';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_leave_update_security ON public.leave_requests;
CREATE TRIGGER enforce_leave_update_security
    BEFORE UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_leave_request_security();

-- 6. Refine RLS Policy on public.leave_requests for UPDATE
DROP POLICY IF EXISTS "Update leave requests" ON public.leave_requests;
CREATE POLICY "Update leave requests" ON public.leave_requests 
    FOR UPDATE 
    USING (
        (auth.uid() = user_id AND status = 'Pending') OR 
        public.is_super_admin(auth.uid()) OR 
        public.has_permission(auth.uid(), 'leave.manage')
    )
    WITH CHECK (
        (auth.uid() = user_id AND status IN ('Pending', 'Cancelled')) OR 
        public.is_super_admin(auth.uid()) OR 
        public.has_permission(auth.uid(), 'leave.manage')
    );

-- 7. Authoritative Audit Logging for Leave Requests
DROP TRIGGER IF EXISTS audit_leave_requests_changes ON public.leave_requests;
CREATE TRIGGER audit_leave_requests_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();
