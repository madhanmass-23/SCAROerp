-- Migration 023: Projects & Task Management Intelligence, Column Protection, Storage & Audit

-- ============================================================================
-- 1. Private Storage Bucket for Task Attachments
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS Policies for task-attachments
DROP POLICY IF EXISTS "Task members can view attachments" ON storage.objects;
CREATE POLICY "Task members can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'task-attachments' AND (
        public.is_super_admin(auth.uid()) OR
        public.has_permission(auth.uid(), 'tasks.view') OR
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id::text = (storage.foldername(name))[1]
            AND (
                public.is_project_member(auth.uid(), t.project_id) OR
                t.assignee_id = auth.uid() OR
                t.reporter_id = auth.uid()
            )
        )
    )
);

DROP POLICY IF EXISTS "Task members can upload attachments" ON storage.objects;
CREATE POLICY "Task members can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'task-attachments' AND (
        public.is_super_admin(auth.uid()) OR
        public.has_permission(auth.uid(), 'tasks.update') OR
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id::text = (storage.foldername(name))[1]
            AND (
                public.is_project_member(auth.uid(), t.project_id) OR
                t.assignee_id = auth.uid() OR
                t.reporter_id = auth.uid()
            )
        )
    )
);

DROP POLICY IF EXISTS "Task members or managers can delete attachments" ON storage.objects;
CREATE POLICY "Task members or managers can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'task-attachments' AND (
        public.is_super_admin(auth.uid()) OR
        public.has_permission(auth.uid(), 'tasks.manage') OR
        auth.uid() = owner OR
        EXISTS (
            SELECT 1 FROM public.task_attachments ta
            WHERE ta.storage_path = name AND ta.uploaded_by = auth.uid()
        )
    )
);

-- ============================================================================
-- 2. Task Attachments Table RLS Alignment
-- ============================================================================
DROP POLICY IF EXISTS "View task attachments" ON public.task_attachments;
CREATE POLICY "View task attachments" ON public.task_attachments FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.view') OR 
    EXISTS (
        SELECT 1 FROM public.tasks t 
        WHERE t.id = task_id AND (
            public.is_project_member(auth.uid(), t.project_id) OR
            t.assignee_id = auth.uid() OR
            t.reporter_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Upload task attachments" ON public.task_attachments;
CREATE POLICY "Upload task attachments" ON public.task_attachments FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by AND (
        public.is_super_admin(auth.uid()) OR 
        public.has_permission(auth.uid(), 'tasks.update') OR 
        EXISTS (
            SELECT 1 FROM public.tasks t 
            WHERE t.id = task_id AND (
                public.is_project_member(auth.uid(), t.project_id) OR
                t.assignee_id = auth.uid() OR
                t.reporter_id = auth.uid()
            )
        )
    )
);

-- ============================================================================
-- 3. BEFORE INSERT Trigger: Enforce Task Creation Constraints
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_task_insert_security()
RETURNS TRIGGER AS $$
DECLARE
    v_is_manager BOOLEAN := FALSE;
BEGIN
    NEW.created_at := NOW();
    NEW.updated_at := NOW();

    -- Service role / system (auth.uid() IS NULL) or manager/super admin
    IF auth.uid() IS NULL OR 
       public.is_super_admin(auth.uid()) OR 
       public.has_permission(auth.uid(), 'tasks.create') THEN
        v_is_manager := TRUE;
    END IF;

    IF v_is_manager THEN
        -- Managers can assign to any user; default reporter to creator if omitted
        IF NEW.reporter_id IS NULL AND auth.uid() IS NOT NULL THEN
            NEW.reporter_id := auth.uid();
        END IF;
    ELSE
        -- Non-managers (Employees / Interns) creating personal tasks:
        -- Must record authentic reporter
        NEW.reporter_id := auth.uid();

        -- Non-managers can ONLY assign tasks to themselves
        IF NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'Unauthorized: Non-manager employees can only create self-assigned tasks';
        END IF;

        -- Non-managers MUST be an enrolled member of the target project
        IF NOT public.is_project_member(auth.uid(), NEW.project_id) THEN
            RAISE EXCEPTION 'Unauthorized: You must be a member of the project to create tasks in it';
        END IF;
    END IF;

    -- Defaults if null
    IF NEW.status IS NULL THEN
        NEW.status := 'Todo';
    END IF;
    IF NEW.priority IS NULL THEN
        NEW.priority := 'Medium';
    END IF;
    IF NEW.progress IS NULL THEN
        NEW.progress := 0;
    END IF;
    IF NEW.estimated_hours IS NULL THEN
        NEW.estimated_hours := 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_task_insert_security ON public.tasks;
CREATE TRIGGER enforce_task_insert_security
    BEFORE INSERT ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_task_insert_security();

-- ============================================================================
-- 4. BEFORE UPDATE Trigger: Critical Column Tampering & Reassignment Protection
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_task_update_security()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_is_manager BOOLEAN := FALSE;
BEGIN
    -- Check if actor has manager privileges or is service_role / system
    IF v_actor IS NULL OR 
       public.is_super_admin(v_actor) OR 
       public.has_permission(v_actor, 'tasks.manage') THEN
        v_is_manager := TRUE;
    END IF;

    -- Immutable primary key and creation timestamp
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := NOW();

    -- CASE A: NON-MANAGERS (Assignees / Regular Team Members)
    IF NOT v_is_manager THEN
        -- 1. Project ID is strictly immutable: cannot move task across projects
        IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            RAISE EXCEPTION 'Unauthorized: project_id is immutable';
        END IF;

        -- 2. Reporter ID is strictly immutable: cannot spoof or forge task creator
        IF NEW.reporter_id IS DISTINCT FROM OLD.reporter_id THEN
            RAISE EXCEPTION 'Unauthorized: reporter_id is immutable';
        END IF;

        -- 3. Task Re-assignment is strictly forbidden for regular assignees
        IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
            RAISE EXCEPTION 'Unauthorized: task re-assignment is not permitted';
        END IF;
    END IF;

    -- Progress validation
    IF NEW.progress < 0 OR NEW.progress > 100 THEN
        RAISE EXCEPTION 'Task progress must be between 0 and 100';
    END IF;

    -- Auto-synchronize progress on completion
    IF NEW.status = 'Completed' AND OLD.status != 'Completed' AND NEW.progress < 100 THEN
        NEW.progress := 100;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_task_update_security ON public.tasks;
CREATE TRIGGER enforce_task_update_security
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_task_update_security();

-- ============================================================================
-- 5. RLS Policy Hardening for Tasks and Projects
-- ============================================================================

-- Tasks SELECT: Project members, assignees, reporters, and managers
DROP POLICY IF EXISTS "View tasks" ON public.tasks;
CREATE POLICY "View tasks" ON public.tasks FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.view') OR 
    public.is_project_member(auth.uid(), project_id) OR
    assignee_id = auth.uid() OR
    reporter_id = auth.uid()
);

-- Tasks INSERT: Managers OR Self-assigned personal task in enrolled project
DROP POLICY IF EXISTS "Insert tasks" ON public.tasks;
CREATE POLICY "Insert tasks" ON public.tasks FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.create') OR 
    (
        auth.uid() = reporter_id AND 
        auth.uid() = assignee_id AND 
        public.is_project_member(auth.uid(), project_id)
    )
);

-- Tasks UPDATE: Managers, assignees, and reporters
DROP POLICY IF EXISTS "Update tasks" ON public.tasks;
CREATE POLICY "Update tasks" ON public.tasks FOR UPDATE USING (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.update') OR 
    assignee_id = auth.uid() OR 
    reporter_id = auth.uid()
) WITH CHECK (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.update') OR 
    assignee_id = auth.uid() OR 
    reporter_id = auth.uid()
);

-- Tasks DELETE: Managers and original task reporter
DROP POLICY IF EXISTS "Delete tasks" ON public.tasks;
CREATE POLICY "Delete tasks" ON public.tasks FOR DELETE USING (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'tasks.manage') OR
    reporter_id = auth.uid()
);

-- Projects SELECT: Allow assigned owner to view project as well
DROP POLICY IF EXISTS "View projects" ON public.projects;
CREATE POLICY "View projects" ON public.projects FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'projects.view') OR 
    public.is_project_member(auth.uid(), id) OR
    owner_id = auth.uid()
);

-- ============================================================================
-- 6. Audit Logging Triggers on Projects and Tasks
-- ============================================================================
DROP TRIGGER IF EXISTS audit_projects_changes ON public.projects;
CREATE TRIGGER audit_projects_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

DROP TRIGGER IF EXISTS audit_tasks_changes ON public.tasks;
CREATE TRIGGER audit_tasks_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

-- ============================================================================
-- 7. Composite Performance Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON public.tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_reporter_id ON public.tasks(reporter_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
