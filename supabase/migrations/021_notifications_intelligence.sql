-- Migration 021: Notifications & Communication Intelligence System
-- Realtime broadcast, secure server-side triggers, and automated notification handling

-- 1. Enable Realtime replication on public.notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 2. Allow authenticated users to delete their own notifications (dismiss)
CREATE POLICY "Delete own notifications" ON public.notifications
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- 3. Core Notification Helper (SECURITY DEFINER)
-- Idempotent, self-suppressing, and deduplicated
CREATE OR REPLACE FUNCTION public.notify_user(
    p_user_id UUID,
    p_type VARCHAR(100),
    p_title VARCHAR(255),
    p_message TEXT,
    p_reference_id UUID,
    p_reference_type VARCHAR(100)
) RETURNS VOID AS $$
BEGIN
    -- Suppress notifying self
    IF p_user_id = auth.uid() THEN
        RETURN;
    END IF;

    -- Deduplication: prevent identical notification within 15 minutes
    IF EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = p_user_id
          AND reference_id = p_reference_id
          AND type = p_type
          AND created_at > NOW() - INTERVAL '15 minutes'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        reference_id,
        reference_type,
        is_read,
        created_at
    ) VALUES (
        p_user_id,
        p_type,
        p_title,
        p_message,
        p_reference_id,
        p_reference_type,
        false,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger on Tasks (Assignment, Status, Deadline, Priority)
CREATE OR REPLACE FUNCTION public.handle_task_notifications()
RETURNS TRIGGER AS $$
DECLARE
    actor_name TEXT;
BEGIN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    IF actor_name IS NULL THEN actor_name := 'A team member'; END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.assignee_id IS NOT NULL THEN
            PERFORM public.notify_user(
                NEW.assignee_id,
                'task_assigned',
                'Task Assigned: ' || NEW.title,
                actor_name || ' assigned you to task: ' || NEW.title,
                NEW.id,
                'task'
            );
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Assignee changed
        IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
            PERFORM public.notify_user(
                NEW.assignee_id,
                'task_assigned',
                'Task Assigned: ' || NEW.title,
                actor_name || ' assigned you to task: ' || NEW.title,
                NEW.id,
                'task'
            );
        END IF;

        -- Status changed
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id != auth.uid() THEN
                PERFORM public.notify_user(
                    NEW.assignee_id,
                    'task_status_changed',
                    'Task Status: ' || NEW.title,
                    actor_name || ' updated status to ' || NEW.status || ' on ' || NEW.title,
                    NEW.id,
                    'task'
                );
            END IF;
            IF NEW.reporter_id IS NOT NULL AND NEW.reporter_id != auth.uid() AND NEW.reporter_id != NEW.assignee_id THEN
                PERFORM public.notify_user(
                    NEW.reporter_id,
                    'task_status_changed',
                    'Task Status: ' || NEW.title,
                    actor_name || ' updated status to ' || NEW.status || ' on ' || NEW.title,
                    NEW.id,
                    'task'
                );
            END IF;
        END IF;

        -- Deadline changed
        IF NEW.due_date IS DISTINCT FROM OLD.due_date AND NEW.assignee_id IS NOT NULL THEN
            PERFORM public.notify_user(
                NEW.assignee_id,
                'task_deadline_changed',
                'Deadline Updated: ' || NEW.title,
                actor_name || ' set due date to ' || COALESCE(NEW.due_date::TEXT, 'None') || ' on ' || NEW.title,
                NEW.id,
                'task'
            );
        END IF;

        -- Priority changed
        IF NEW.priority IS DISTINCT FROM OLD.priority AND NEW.assignee_id IS NOT NULL THEN
            PERFORM public.notify_user(
                NEW.assignee_id,
                'task_priority_changed',
                'Priority Updated: ' || NEW.title,
                actor_name || ' changed priority to ' || NEW.priority || ' on ' || NEW.title,
                NEW.id,
                'task'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_task_notification_event ON public.tasks;
CREATE TRIGGER on_task_notification_event
    AFTER INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_task_notifications();

-- 5. Trigger on Task Comments
CREATE OR REPLACE FUNCTION public.handle_task_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
    task_rec RECORD;
    actor_name TEXT;
BEGIN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.author_id;
    IF actor_name IS NULL THEN actor_name := 'A team member'; END IF;

    SELECT id, title, assignee_id, reporter_id INTO task_rec FROM public.tasks WHERE id = NEW.task_id;
    IF task_rec.id IS NOT NULL THEN
        -- Notify assignee
        IF task_rec.assignee_id IS NOT NULL AND task_rec.assignee_id != NEW.author_id THEN
            PERFORM public.notify_user(
                task_rec.assignee_id,
                'task_comment',
                'New Comment on: ' || task_rec.title,
                actor_name || ' commented on ' || task_rec.title,
                task_rec.id,
                'task'
            );
        END IF;
        -- Notify reporter
        IF task_rec.reporter_id IS NOT NULL AND task_rec.reporter_id != NEW.author_id AND task_rec.reporter_id != task_rec.assignee_id THEN
            PERFORM public.notify_user(
                task_rec.reporter_id,
                'task_comment',
                'New Comment on: ' || task_rec.title,
                actor_name || ' commented on ' || task_rec.title,
                task_rec.id,
                'task'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_task_comment_notification ON public.task_comments;
CREATE TRIGGER on_task_comment_notification
    AFTER INSERT ON public.task_comments
    FOR EACH ROW EXECUTE FUNCTION public.handle_task_comment_notification();

-- 6. Trigger on Direct Messages (Sanitized Payload)
CREATE OR REPLACE FUNCTION public.handle_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    IF NEW.task_id IS NULL AND NEW.recipient_id IS NOT NULL THEN
        SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
        IF sender_name IS NULL THEN sender_name := 'A colleague'; END IF;

        PERFORM public.notify_user(
            NEW.recipient_id,
            'direct_message',
            'New message from ' || sender_name,
            'You received a direct message from ' || sender_name,
            NEW.sender_id,
            'message'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_message_notification ON public.messages;
CREATE TRIGGER on_message_notification
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_message_notification();

-- 7. Trigger on Meeting Participants
CREATE OR REPLACE FUNCTION public.handle_meeting_participant_notification()
RETURNS TRIGGER AS $$
DECLARE
    meeting_rec RECORD;
    organizer_name TEXT;
BEGIN
    SELECT id, title, start_time, organizer_id INTO meeting_rec FROM public.meetings WHERE id = NEW.meeting_id;
    IF meeting_rec.id IS NOT NULL THEN
        SELECT full_name INTO organizer_name FROM public.profiles WHERE id = meeting_rec.organizer_id;
        IF organizer_name IS NULL THEN organizer_name := 'Someone'; END IF;

        PERFORM public.notify_user(
            NEW.participant_id,
            'meeting_invite',
            'Meeting Invitation: ' || meeting_rec.title,
            organizer_name || ' invited you to ' || meeting_rec.title,
            meeting_rec.id,
            'meeting'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_meeting_participant_notification ON public.meeting_participants;
CREATE TRIGGER on_meeting_participant_notification
    AFTER INSERT ON public.meeting_participants
    FOR EACH ROW EXECUTE FUNCTION public.handle_meeting_participant_notification();

-- 8. Trigger on Leave Requests
CREATE OR REPLACE FUNCTION public.handle_leave_request_notification()
RETURNS TRIGGER AS $$
DECLARE
    applicant_name TEXT;
    admin_rec RECORD;
BEGIN
    SELECT full_name INTO applicant_name FROM public.profiles WHERE id = NEW.user_id;
    IF applicant_name IS NULL THEN applicant_name := 'An employee'; END IF;

    IF TG_OP = 'INSERT' THEN
        FOR admin_rec IN 
            SELECT DISTINCT ur.user_id FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE r.name IN ('Admin', 'Super Admin') AND ur.user_id != NEW.user_id
        LOOP
            PERFORM public.notify_user(
                admin_rec.user_id,
                'leave_pending',
                'New Leave Request: ' || applicant_name,
                applicant_name || ' submitted a ' || NEW.type || ' request (' || NEW.start_date || ' to ' || NEW.end_date || ')',
                NEW.id,
                'leave'
            );
        END LOOP;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Approved', 'Rejected') THEN
            PERFORM public.notify_user(
                NEW.user_id,
                'leave_status',
                'Leave Request ' || NEW.status,
                'Your ' || NEW.type || ' request for ' || NEW.start_date || ' has been ' || LOWER(NEW.status::TEXT),
                NEW.id,
                'leave'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_leave_request_notification ON public.leave_requests;
CREATE TRIGGER on_leave_request_notification
    AFTER INSERT OR UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_leave_request_notification();

-- 9. Trigger on Announcements
CREATE OR REPLACE FUNCTION public.handle_announcement_notification()
RETURNS TRIGGER AS $$
DECLARE
    target_user RECORD;
BEGIN
    IF NEW.audience = 'Everyone' THEN
        FOR target_user IN SELECT id FROM public.profiles WHERE is_active = true AND id != NEW.author_id LOOP
            PERFORM public.notify_user(
                target_user.id,
                'announcement',
                'Announcement: ' || NEW.title,
                NEW.title,
                NEW.id,
                'announcement'
            );
        END LOOP;
    ELSIF NEW.audience = 'Employees' THEN
        FOR target_user IN 
            SELECT p.id FROM public.profiles p
            WHERE p.is_active = true AND p.id != NEW.author_id
              AND (p.employment_status = 'Employee' OR EXISTS (
                  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON ur.role_id = r.id 
                  WHERE ur.user_id = p.id AND r.name = 'Employee'
              ))
        LOOP
            PERFORM public.notify_user(
                target_user.id,
                'announcement',
                'Announcement: ' || NEW.title,
                NEW.title,
                NEW.id,
                'announcement'
            );
        END LOOP;
    ELSIF NEW.audience = 'Interns' THEN
        FOR target_user IN 
            SELECT p.id FROM public.profiles p
            WHERE p.is_active = true AND p.id != NEW.author_id
              AND (p.employment_status = 'Intern' OR EXISTS (
                  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON ur.role_id = r.id 
                  WHERE ur.user_id = p.id AND r.name = 'Intern'
              ))
        LOOP
            PERFORM public.notify_user(
                target_user.id,
                'announcement',
                'Announcement: ' || NEW.title,
                NEW.title,
                NEW.id,
                'announcement'
            );
        END LOOP;
    ELSIF NEW.audience = 'Department' AND NEW.department_id IS NOT NULL THEN
        FOR target_user IN 
            SELECT id FROM public.profiles 
            WHERE is_active = true AND department_id = NEW.department_id AND id != NEW.author_id 
        LOOP
            PERFORM public.notify_user(
                target_user.id,
                'announcement',
                'Announcement: ' || NEW.title,
                NEW.title,
                NEW.id,
                'announcement'
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_announcement_notification ON public.announcements;
CREATE TRIGGER on_announcement_notification
    AFTER INSERT ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.handle_announcement_notification();

-- 10. Trigger on Daily Reports Submission
CREATE OR REPLACE FUNCTION public.handle_daily_report_notification()
RETURNS TRIGGER AS $$
DECLARE
    submitter_name TEXT;
    admin_rec RECORD;
BEGIN
    IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
        SELECT full_name INTO submitter_name FROM public.profiles WHERE id = NEW.user_id;
        IF submitter_name IS NULL THEN submitter_name := 'Team Member'; END IF;

        FOR admin_rec IN 
            SELECT DISTINCT ur.user_id FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE r.name IN ('Admin', 'Super Admin') AND ur.user_id != NEW.user_id
        LOOP
            PERFORM public.notify_user(
                admin_rec.user_id,
                'report_submitted',
                'Daily Report Submitted: ' || submitter_name,
                submitter_name || ' submitted daily report for ' || NEW.report_date,
                NEW.id,
                'daily_report'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_daily_report_notification ON public.daily_reports;
CREATE TRIGGER on_daily_report_notification
    AFTER UPDATE ON public.daily_reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_daily_report_notification();

-- 11. Secure Helper for Daily Report Reminder Check (Workforce Rule)
CREATE OR REPLACE FUNCTION public.check_daily_report_reminder()
RETURNS VOID AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_user_id UUID := auth.uid();
    v_is_present BOOLEAN;
    v_is_submitted BOOLEAN;
    v_is_leave BOOLEAN;
    v_is_target BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN RETURN; END IF;

    -- Only active Employees and Interns (excluding Admins and Super Admins)
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_user_id AND p.is_active = true
          AND (p.employment_status IN ('Employee', 'Intern') OR EXISTS (
              SELECT 1 FROM public.user_roles ur JOIN public.roles r ON ur.role_id = r.id
              WHERE ur.user_id = v_user_id AND r.name IN ('Employee', 'Intern')
          ))
          AND NOT EXISTS (
              SELECT 1 FROM public.user_roles ur JOIN public.roles r ON ur.role_id = r.id
              WHERE ur.user_id = v_user_id AND r.name IN ('Admin', 'Super Admin')
          )
    ) INTO v_is_target;

    IF NOT v_is_target THEN RETURN; END IF;

    -- Must be checked in today
    SELECT EXISTS (
        SELECT 1 FROM public.attendance_sessions
        WHERE user_id = v_user_id AND session_date = v_today AND clock_in_time IS NOT NULL
    ) INTO v_is_present;

    -- Must NOT be submitted
    SELECT EXISTS (
        SELECT 1 FROM public.daily_reports
        WHERE user_id = v_user_id AND report_date = v_today AND status = 'submitted'
    ) INTO v_is_submitted;

    -- Must NOT be on approved leave
    SELECT EXISTS (
        SELECT 1 FROM public.leave_requests
        WHERE user_id = v_user_id AND status = 'Approved' AND start_date <= v_today AND end_date >= v_today
    ) INTO v_is_leave;

    -- Only notify if checked in, report pending, and not on approved leave
    IF v_is_present AND NOT v_is_submitted AND NOT v_is_leave THEN
        PERFORM public.notify_user(
            v_user_id,
            'report_pending',
            'Reminder: Daily Report Pending',
            'You are checked in today. Please remember to complete and submit your daily work report.',
            v_user_id,
            'daily_report'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
