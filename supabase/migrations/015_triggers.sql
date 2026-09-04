-- Triggers structure for automatic maintenance and security

-- 1. Updated At Trigger Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER trigger_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_attendance_sessions_updated_at BEFORE UPDATE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. New User Profile Auto-Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Audit Log Trigger Function
CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    actor UUID;
BEGIN
    actor := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        new_data := to_jsonb(NEW);
        INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, new_value)
        VALUES (actor, 'INSERT', TG_TABLE_NAME, NEW.id, new_data);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_value, new_value)
        VALUES (actor, 'UPDATE', TG_TABLE_NAME, NEW.id, old_data, new_data);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_value)
        VALUES (actor, 'DELETE', TG_TABLE_NAME, OLD.id, old_data);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_roles_changes AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

CREATE TRIGGER audit_company_settings_changes AFTER INSERT OR UPDATE OR DELETE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

-- 4. Profile Column Tampering Protection
CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- If user is an admin/super admin, allow all changes
    IF public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage') THEN
        RETURN NEW;
    END IF;
    
    -- Otherwise, lock restricted columns
    NEW.department_id = OLD.department_id;
    NEW.designation = OLD.designation;
    NEW.joining_date = OLD.joining_date;
    NEW.employment_status = OLD.employment_status;
    NEW.is_active = OLD.is_active;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_profile_column_security
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.restrict_profile_updates();

-- 5. Attendance Session Tampering Protection
CREATE OR REPLACE FUNCTION public.restrict_attendance_updates()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'attendance.manage') THEN
        RETURN NEW;
    END IF;
    
    -- Normal users can only update clock_out_time, and they cannot backdate it
    NEW.session_date = OLD.session_date;
    NEW.clock_in_time = OLD.clock_in_time;
    NEW.user_id = OLD.user_id;
    
    -- Prevent status manipulation
    NEW.status = OLD.status;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_attendance_column_security
    BEFORE UPDATE ON public.attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION public.restrict_attendance_updates();

-- 6. Meeting Attendance Tampering Protection
CREATE OR REPLACE FUNCTION public.restrict_meeting_attendance_updates()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.manage') THEN
        RETURN NEW;
    END IF;
    
    -- Normal users can only change joined_at / left_at to NOW, no arbitrary manipulation
    -- For V1 we just prevent manual updates if they already joined/left to prevent rewriting history
    IF OLD.joined_at IS NOT NULL AND NEW.joined_at != OLD.joined_at THEN
        NEW.joined_at = OLD.joined_at;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_meeting_attendance_column_security
    BEFORE UPDATE ON public.meeting_attendance
    FOR EACH ROW EXECUTE FUNCTION public.restrict_meeting_attendance_updates();