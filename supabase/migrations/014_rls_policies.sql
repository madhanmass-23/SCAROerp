-- RLS Policies structure

-- 1. Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_report_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- 2. Secure Helper Functions
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = $1 AND r.name = 'Super Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_permission(user_id UUID, permission_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = $1 AND p.name = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- is_project_member must be SECURITY DEFINER to bypass RLS and avoid infinite recursion
-- when used inside the project_members RLS policies. 
CREATE OR REPLACE FUNCTION public.is_project_member(user_id UUID, target_project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = target_project_id AND pm.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Core RLS Policies

-- Company Settings
CREATE POLICY "Anyone can read company settings" ON public.company_settings FOR SELECT USING (true);

CREATE POLICY "Super Admins can update company settings" ON public.company_settings FOR UPDATE USING (public.is_super_admin(auth.uid()));

-- Roles & Permissions
CREATE POLICY "Anyone can read roles" ON public.roles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super Admins manage roles" ON public.roles USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can read permissions" ON public.permissions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super Admins manage permissions" ON public.permissions USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can read role_permissions" ON public.role_permissions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super Admins manage role_permissions" ON public.role_permissions USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can read user_roles" ON public.user_roles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super Admins manage user_roles" ON public.user_roles USING (public.is_super_admin(auth.uid()));

-- Departments
CREATE POLICY "Anyone can read departments" ON public.departments FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users with users.manage can modify departments" ON public.departments USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'));

-- Profiles (Updates are protected from column tampering via BEFORE UPDATE trigger in 015_triggers.sql)
CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super Admins can manage profiles" ON public.profiles USING (public.is_super_admin(auth.uid()));

-- Projects & Project Members
CREATE POLICY "View projects" ON public.projects FOR SELECT USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'projects.view') OR 
  public.is_project_member(auth.uid(), id)
);

CREATE POLICY "Manage projects" ON public.projects USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'projects.manage')
);

CREATE POLICY "View project members" ON public.project_members FOR SELECT USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'projects.view') OR 
  public.is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Manage project members" ON public.project_members USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'projects.manage')
);

-- Tasks
CREATE POLICY "View tasks" ON public.tasks FOR SELECT USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'tasks.view') OR 
  public.is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Insert tasks" ON public.tasks FOR INSERT WITH CHECK (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'tasks.create')
);

CREATE POLICY "Update tasks" ON public.tasks FOR UPDATE USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'tasks.update') OR 
  assignee_id = auth.uid() OR
  reporter_id = auth.uid()
);

CREATE POLICY "Delete tasks" ON public.tasks FOR DELETE USING (
  public.is_super_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'tasks.manage')
);

-- Task Comments & Attachments
CREATE POLICY "View task comments" ON public.task_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view') OR public.is_project_member(auth.uid(), t.project_id)))
);

CREATE POLICY "Create task comments" ON public.task_comments FOR INSERT WITH CHECK (
  auth.uid() = author_id AND
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view') OR public.is_project_member(auth.uid(), t.project_id)))
);

CREATE POLICY "Update own task comments" ON public.task_comments FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Delete own task comments" ON public.task_comments FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "View task attachments" ON public.task_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view') OR public.is_project_member(auth.uid(), t.project_id)))
);

CREATE POLICY "Upload task attachments" ON public.task_attachments FOR INSERT WITH CHECK (
  auth.uid() = uploaded_by AND
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view') OR public.is_project_member(auth.uid(), t.project_id)))
);

CREATE POLICY "Delete task attachments" ON public.task_attachments FOR DELETE USING (auth.uid() = uploaded_by OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.manage'));

-- Attendance Sessions (Column tampering protected by trigger)
CREATE POLICY "View own attendance" ON public.attendance_sessions FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'attendance.view'));

CREATE POLICY "Insert own attendance" ON public.attendance_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own attendance" ON public.attendance_sessions FOR UPDATE USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'attendance.manage'));

-- Daily Reports
CREATE POLICY "View daily reports" ON public.daily_reports FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'reports.view'));

CREATE POLICY "Insert own daily report" ON public.daily_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own daily report" ON public.daily_reports FOR UPDATE USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'reports.manage'));

CREATE POLICY "View daily report tasks" ON public.daily_report_tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_id AND (r.user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'reports.view')))
);

CREATE POLICY "Insert daily report tasks" ON public.daily_report_tasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_id AND r.user_id = auth.uid())
);

CREATE POLICY "Manage daily report tasks" ON public.daily_report_tasks USING (
  EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_id AND (r.user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'reports.manage')))
);

-- Leave Requests
CREATE POLICY "View leave requests" ON public.leave_requests FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'leave.view'));

CREATE POLICY "Create leave requests" ON public.leave_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update leave requests" ON public.leave_requests FOR UPDATE USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'leave.manage'));

-- Announcements
CREATE POLICY "View announcements" ON public.announcements FOR SELECT USING (
  audience = 'Everyone' OR 
  (audience = 'Employees' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employment_status = 'Employee')) OR
  (audience = 'Interns' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employment_status = 'Intern')) OR
  (audience = 'Department' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND department_id = public.announcements.department_id)) OR
  public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'announcements.view')
);

CREATE POLICY "Manage announcements" ON public.announcements USING (
  public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'announcements.manage')
);

-- Meetings (Column tampering protected by trigger)
CREATE POLICY "View meetings" ON public.meetings FOR SELECT USING (
  organizer_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = id AND mp.participant_id = auth.uid()) OR
  public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.view')
);

CREATE POLICY "Manage meetings" ON public.meetings USING (
  organizer_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.manage')
);

CREATE POLICY "View meeting participants" ON public.meeting_participants FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.view'))) OR
  participant_id = auth.uid()
);

CREATE POLICY "Manage meeting participants" ON public.meeting_participants USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.manage')))
);

CREATE POLICY "View meeting attendance" ON public.meeting_attendance FOR SELECT USING (
  participant_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.view')))
);

CREATE POLICY "Update own meeting attendance" ON public.meeting_attendance FOR UPDATE USING (
  participant_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.manage')
);

-- Messages
CREATE POLICY "View messages" ON public.messages FOR SELECT USING (
  sender_id = auth.uid() OR 
  recipient_id = auth.uid() OR
  (task_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view'))))
);

CREATE POLICY "Send messages" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  (task_id IS NULL OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view'))))
);

-- Notifications
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());

-- Audit Logs
CREATE POLICY "View audit logs" ON public.audit_logs FOR SELECT USING (
  public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'audit.view')
);