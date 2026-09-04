# SCARO ERP — Phase 8 Architecture Specification
**Projects & Task Management Intelligence**

---

## 1. Executive Summary

Phase 8 evaluates and architects the operational evolution of SCARO ERP's **Projects**, **Tasks**, and **Work Management** ecosystem.

A comprehensive read-only audit of migrations `001–022` and the `src/` codebase reveals:
1. **Schema Foundation Exists**: Database tables `public.projects`, `public.project_members`, `public.tasks`, `public.task_comments`, and `public.task_attachments` were created in `006_projects_tasks.sql` with enums `task_status_type` and `task_priority_type` in `002_core_types.sql`.
2. **Existing UI is Non-Functional and Fragile**:
   - The "New Project" button on `ProjectsPage.tsx` and "Create Task" button on `TasksPage.tsx` are non-operational dead buttons with no event handlers, modals, or forms.
   - The status dropdown in `TasksPage.tsx` sends invalid enum strings (`'pending'`, `'in_progress'`), which trigger PostgreSQL runtime type cast exceptions when selected.
   - The task tab filtering logic in `TasksPage.tsx` completely drops tasks created by a manager/reporter for other team members.
   - There are no dedicated services (`projectService.ts` or `taskService.ts`) or centralized TypeScript models (`src/types/project.ts`, `src/types/task.ts`).
3. **Database RLS Blocks Employee/Intern Task Creation**:
   - `tasks` INSERT policy requires `is_super_admin` or `tasks.create` permission (held only by `Admin`). Non-manager employees and interns cannot create personal tasks or project tasks directly in the database.
4. **Column Tampering Security Vulnerability on Tasks**:
   - The `UPDATE` policy on `public.tasks` allows `assignee_id = auth.uid() OR reporter_id = auth.uid()` to update the entire row without a `WITH CHECK` clause or column protection trigger, allowing an assignee to arbitrarily reassign `project_id`, `reporter_id`, or `assignee_id`.
5. **Storage Bucket for Attachments Does Not Exist**:
   - While `public.task_attachments` exists in SQL, **no Supabase storage bucket** was ever created for task attachments in migrations `001–022` (only `avatars` and `daily-evidence` exist).
6. **Cross-Phase Integrations Already Active**:
   - Daily Tracker (Phase 4) successfully links `daily_report_tasks.task_id` to `tasks.id`.
   - Phase 5B Management Intelligence displays active tasks and recent daily report logs in project activity views.
   - Phase 6 Notifications triggers (`on_task_notification_event`, `on_task_comment_notification`) already automate notifications on assignment, status change, deadline update, priority change, and comments.

---

## 2. Existing Project Schema

### 2.1 Table Definition (`006_projects_tasks.sql`)
```sql
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Active',
    start_date DATE,
    end_date DATE,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Explicit Schema Columns & Capabilities
| Field / Capability | Column in DB | Type / Constraint | Analysis |
| :--- | :--- | :--- | :--- |
| Project Name | `name` | `VARCHAR(255) NOT NULL` | Supported |
| Description | `description` | `TEXT NULL` | Supported |
| Status | `status` | `VARCHAR(50) DEFAULT 'Active'` | **NOT an ENUM**. Stored as string. Code inconsistently checks `'active'` vs DB default `'Active'`. |
| Start Date | `start_date` | `DATE NULL` | Supported |
| End Date | `end_date` | `DATE NULL` | Supported |
| Owner | `owner_id` | `UUID REFERENCES profiles(id)` | Supported |
| Created By | `created_by` | `UUID REFERENCES profiles(id)` | Supported |
| Manager | *None* | *None* | Handled via `owner_id` (no separate manager column) |
| Department | *None* | *None* | **Not supported** on `projects`. Departments link to profiles, not projects. |
| Priority | *None* | *None* | **Not supported** on `projects`. Only tasks have priority. |
| Progress | *None* | *None* | **Not stored in DB**. Must be derived from tasks. |
| Activity / History | *None* | *None* | **Not supported in DB**. Derived via `tasks` and `daily_report_tasks`. |
| Archive / Close | *None* | *None* | Handled via `status` field (`'Archived'`, `'Closed'`). |

### 2.3 Indexes & Triggers
- Index: None explicitly created on `projects` in `006_projects_tasks.sql`.
- Trigger: `trigger_projects_updated_at` runs `BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()`.

---

## 3. Existing Task Schema

### 3.1 Table Definition (`006_projects_tasks.sql`)
```sql
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    priority public.task_priority_type DEFAULT 'Medium',
    status public.task_status_type DEFAULT 'Todo',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    estimated_hours NUMERIC(6,2) DEFAULT 0 CHECK (estimated_hours >= 0),
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Core Enums (`002_core_types.sql`)
- **`task_status_type`**: `'Todo'`, `'In Progress'`, `'Review'`, `'Needs Revision'`, `'Completed'`, `'On Hold'`, `'Cancelled'`
  *(Note: `'Blocked'` is **not** an enum value; `'On Hold'` or `'Needs Revision'` exist instead)*.
- **`task_priority_type`**: `'Low'`, `'Medium'`, `'High'`, `'Urgent'`.

### 3.3 Explicit Schema Columns & Capabilities
| Field / Capability | Column in DB | Type / Constraint | Analysis |
| :--- | :--- | :--- | :--- |
| Title | `title` | `VARCHAR(255) NOT NULL` | Supported |
| Description | `description` | `TEXT NULL` | Supported |
| Project Link | `project_id` | `UUID REFERENCES projects(id) ON DELETE CASCADE` | **Mandatory** (`NOT NULL`). Every task must belong to a project. |
| Assignee | `assignee_id` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Supported (optional, unassigned allowed) |
| Reporter | `reporter_id` | `UUID REFERENCES profiles(id) ON DELETE RESTRICT` | **Mandatory** (`NOT NULL`). Creator/manager tracking. |
| Priority | `priority` | `public.task_priority_type DEFAULT 'Medium'` | 4 values: `'Low'`, `'Medium'`, `'High'`, `'Urgent'` |
| Status | `status` | `public.task_status_type DEFAULT 'Todo'` | 7 values: `'Todo'`, `'In Progress'`, `'Review'`, `'Needs Revision'`, `'Completed'`, `'On Hold'`, `'Cancelled'` |
| Progress | `progress` | `INTEGER DEFAULT 0 CHECK (0..100)` | Supported in DB, but ignored by UI |
| Estimated Hours | `estimated_hours` | `NUMERIC(6,2) DEFAULT 0 CHECK (>= 0)` | Supported in DB, but ignored by UI |
| Due Date | `due_date` | `DATE NULL` | Supported |
| Timestamps | `created_at`, `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | Handled via auto-trigger |
| Comments | *Relation* | `public.task_comments` table | Supported |
| Attachments | *Relation* | `public.task_attachments` table | **Table exists, but Storage Bucket is MISSING** |
| Task Dependencies | *None* | *None* | Not supported in DB |
| Subtasks | *None* | *None* | Not supported in DB |
| Labels / Tags | *None* | *None* | Not supported in DB |

### 3.4 Indexes
- `idx_tasks_project_id ON public.tasks(project_id)`
- `idx_tasks_assignee_id ON public.tasks(assignee_id)`
- `idx_tasks_status ON public.tasks(status)`
- `idx_tasks_due_date ON public.tasks(due_date)`

---

## 4. Existing Project Membership

### 4.1 Schema Definition (`006_projects_tasks.sql`)
```sql
CREATE TABLE public.project_members (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
```

### 4.2 Membership Authorization Model
- **Who can view project members**:
  - Super Admins (`is_super_admin(auth.uid())`)
  - Users with `projects.view` permission (Admins)
  - Assigned Project Members (`public.is_project_member(auth.uid(), project_id)`)
- **Who can add/remove members**:
  - Only Super Admins and Admins (`projects.manage`).
  - Project `owner_id` **cannot** add or remove members unless they hold `projects.manage`.
- **Project Membership vs Task Visibility**:
  - `tasks` SELECT RLS policy strictly gates visibility to:
    `public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'tasks.view') OR public.is_project_member(auth.uid(), project_id)`
  - **Critical Rule**: A user **must** be in `project_members` to see the project and its tasks (unless they are Super Admin or Admin). If a task is assigned to an employee who is not a project member, the employee **cannot see the task**.

---

## 5. Existing Task Assignment

### 5.1 Current Assignment Capabilities & Restrictions
- **Can Employee create a task?**
  - **NO**. RLS policy `"Insert tasks"` requires `public.has_permission(auth.uid(), 'tasks.create')` or `is_super_admin`.
  - In `017_seed_data.sql`, `tasks.create` is assigned exclusively to `Admin`.
  - Regular Employees and Interns attempting direct INSERT are rejected with RLS check violation.
- **Can Intern create a task?**
  - **NO**. Same restriction as above.
- **Can Admin / Super Admin assign a task?**
  - **YES**. Admins have `tasks.create` and `tasks.update`. Super Admins bypass via `is_super_admin`.
- **Can an Employee assign work to another Employee?**
  - **NO**. Employees cannot insert tasks.
- **Can users assign tasks outside their project?**
  - The database only enforces foreign key integrity `project_id REFERENCES projects(id)`.
  - There is currently no database constraint or trigger validating that `assignee_id` belongs to `project_members(project_id)`.

---

## 6. Existing RLS / Security

### 6.1 Matrix of Database Permissions (`014_rls_policies.sql`)
| Entity | Operation | Permitted Roles / Conditions |
| :--- | :--- | :--- |
| **`projects`** | `SELECT` | Super Admin OR `projects.view` (Admin) OR `is_project_member(auth.uid(), id)` |
| **`projects`** | `INSERT/UPDATE/DELETE` | Super Admin OR `projects.manage` (Admin) |
| **`project_members`** | `SELECT` | Super Admin OR `projects.view` (Admin) OR `is_project_member(auth.uid(), project_id)` |
| **`project_members`** | `INSERT/UPDATE/DELETE` | Super Admin OR `projects.manage` (Admin) |
| **`tasks`** | `SELECT` | Super Admin OR `tasks.view` (Admin) OR `is_project_member(auth.uid(), project_id)` |
| **`tasks`** | `INSERT` | Super Admin OR `tasks.create` (Admin) |
| **`tasks`** | `UPDATE` | Super Admin OR `tasks.update` (Admin) OR `assignee_id = auth.uid()` OR `reporter_id = auth.uid()` |
| **`tasks`** | `DELETE` | Super Admin OR `tasks.manage` (Admin) |
| **`task_comments`** | `SELECT` | Super Admin OR `tasks.view` OR `is_project_member(auth.uid(), t.project_id)` |
| **`task_comments`** | `INSERT` | `auth.uid() = author_id` AND user can view the task |
| **`task_comments`** | `UPDATE/DELETE` | `auth.uid() = author_id` |
| **`task_attachments`**| `SELECT` | Super Admin OR `tasks.view` OR `is_project_member(auth.uid(), t.project_id)` |
| **`task_attachments`**| `INSERT` | `auth.uid() = uploaded_by` AND user can view the task |
| **`task_attachments`**| `DELETE` | `uploaded_by = auth.uid()` OR Super Admin OR `tasks.manage` |

### 6.2 Security Audit Findings & Vulnerabilities
1. **Unrestricted Column Modification on Task Update**:
   - The RLS UPDATE policy on `tasks` allows `assignee_id = auth.uid()` to update the row.
   - Because there is no `WITH CHECK` clause or column protection trigger, an assignee can change `assignee_id` (reassigning to someone else), change `reporter_id` (forging creator), change `project_id` (moving task across projects), or alter `estimated_hours` arbitrarily.
2. **Assignee Visibility Orphan Trap**:
   - If an Admin assigns an employee to a task whose `project_id` does not have that employee in `project_members`, the employee cannot see the task under `"View tasks"` RLS!
3. **No Database Validation on Assignee Membership**:
   - Any user can be set as `assignee_id`, even if they are not in `project_members`.
4. **Recursive RLS Check**:
   - `is_project_member` uses `SECURITY DEFINER SET search_path = public` specifically to prevent infinite recursion on `project_members`. This implementation is verified clean and safe.

---

## 7. Existing Task UI

### 7.1 Current Implementation (`src/pages/tasks/TasksPage.tsx`)
- **Query Strategy**:
  ```ts
  .from('tasks')
  .select(`*, assignee:profiles!tasks_assignee_id_fkey(full_name), reporter:profiles!tasks_reporter_id_fkey(full_name)`)
  .or(`assignee_id.eq.${user.id},reporter_id.eq.${user.id}`)
  .order('created_at', { ascending: false });
  ```
- **Severe Deficiencies**:
  1. **Dead Create Button**: `<Button variant="primary">Create Task</Button>` has no handler.
  2. **Broken Tab Filter**:
     ```ts
     // Line 151
     if (activeTab === 'assigned_by_manager') {
       return t.assignee_id === user?.id && t.reporter_id !== user?.id;
     } else {
       return t.assignee_id === user?.id && t.reporter_id === user?.id;
     }
     ```
     - Tasks where `reporter_id === user.id` and `assignee_id !== user.id` (delegated tasks) are completely omitted from the UI.
  3. **Runtime Cast Crash on Status Update**:
     ```tsx
     <select value={selectedTask.status} onChange={(e) => updateTaskStatus(e.target.value)}>
       <option value="pending">Pending</option>
       <option value="in_progress">In Progress</option>
       <option value="completed">Completed</option>
     </select>
     ```
     - Selecting `"pending"` or `"in_progress"` crashes with `invalid input value for enum task_status_type`. Valid database enum values are `'Todo'`, `'In Progress'`, `'Review'`, `'Needs Revision'`, `'Completed'`, `'On Hold'`, `'Cancelled'`.
  4. **No Filter / Search Controls**: Missing project filter, priority filter, due date filter, and search bar.
  5. **No Progress Slider**: Database column `progress` (0–100%) is completely absent from the UI.
  6. **No Attachments View / Upload**: `task_attachments` table is unqueried.
  7. **Admin Access Limited to Personal Tasks**: Admins and Super Admins visiting `/app/tasks` only see tasks where they are personally the assignee or reporter, despite holding global task visibility permissions.

---

## 8. Existing Project UI

### 8.1 Current Implementation (`src/pages/projects/ProjectsPage.tsx`)
- **Query Strategy**:
  ```ts
  .from('projects')
  .select(`*, owner:profiles!projects_owner_id_fkey(full_name)`)
  .order('created_at', { ascending: false });
  ```
- **Modal Queries**:
  - Fetches members from `project_members`.
  - Fetches top 10 tasks from `tasks`.
  - Fetches top 10 daily report tasks from `daily_report_tasks` joined with `daily_reports`.
- **Deficiencies**:
  1. **Dead New Project Button**: `<Button variant="primary">New Project</Button>` has no click action.
  2. **No Creation / Edit Capabilities**: No ability to create projects, update status/dates, or add/remove members.
  3. **Case Sensitivity Bug**: Compares `project.status === 'active'` (lowercase), whereas Migration 006 sets default `'Active'` (title case).
  4. **No Progress Metrics**: No task completion ratio or derived progress bar.
  5. **Sidebar Exclusion for Interns**: `Sidebar.tsx` line 34 restricts `Projects` to `['Super Admin', 'Admin', 'Employee']`, hiding it from Interns.

---

## 9. Existing Daily Tracker Integration

### 9.1 Schema & Code Linkage
- `public.daily_report_tasks` (`008_daily_reports.sql`):
  `task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL`
  Columns: `time_spent_minutes`, `completion_percentage`, `task_status`, `custom_task_title`.
- `DailyTrackerPage.tsx`:
  - When submitting a daily report, users can select an existing task from `tasks` or type a custom task title.
  - Logs `completion_percentage` and `task_status` in `daily_report_tasks`.
- `ProjectsPage.tsx`:
  - Lines 112–135 query `daily_report_tasks!inner` linked to `tasks.project_id` to show recent daily logs.
- **Invariant**: Phase 4 Daily Work Tracker workflow is complete and stable. Phase 8 must read from and link to `daily_report_tasks` without altering its schema or submission contract.

---

## 10. Existing Management Integration

### 10.1 Management Layer (`src/services/managementService.ts`)
- Currently exports:
  - `fetchManagementMetrics`: High-level company metrics.
  - `fetchAttendanceReportCorrelation`: Daily check-in vs daily report correlation.
  - `fetchReportedBlockers`: Critical blockers from daily reports.
  - `fetchReportedRequirements`: Resource requests from daily reports.
  - `fetchSyncHealth`: Google Sheets sync worker health.
  - `fetchManagementReports`: Paginated report audit.
  - `fetchPersonWorkProfile`: Member profile with attendance, reports, and tasks logged in daily reports.
- **Playwright Regression Invariant (`tests/management.spec.ts` Case 5)**:
  - Test 5 explicitly visits `/app/projects`, clicks a project card, and asserts visibility of:
    - `"Project Details & Activity Overview"`
    - `"Recent Daily Report Logs"`
  - **Mandatory Constraint**: Phase 8 enhancements to `ProjectsPage.tsx` must preserve these text selectors and modal behavior.

---

## 11. Existing Notification Integration

### 11.1 Trigger-Based Notifications (`021_notifications_intelligence.sql`)
1. **`handle_task_notifications()` on `public.tasks`**:
   - `INSERT`: If `assignee_id` is set -> notifies assignee with `task_assigned`.
   - `UPDATE`:
     - Assignee changed -> notifies new assignee (`task_assigned`).
     - Status changed -> notifies assignee and reporter (`task_status_changed`).
     - Due date changed -> notifies assignee (`task_deadline_changed`).
     - Priority changed -> notifies assignee (`task_priority_changed`).
2. **`handle_task_comment_notification()` on `public.task_comments`**:
   - `INSERT`: Notifies assignee and reporter of new comment (`task_comment`).
- **Critical Architectural Rule**: All notification generation is **already automated at the database trigger layer**. The frontend **must never** manually insert notifications into `public.notifications` during task operations.

---

## 12. Existing Attachment Storage

### 12.1 Database vs Storage Audit
- **Table in SQL**:
  `public.task_attachments` exists (`id`, `task_id`, `uploaded_by`, `file_name`, `storage_path`, `file_size`, `file_type`, `created_at`).
- **Storage Bucket**:
  - `storage.buckets` was inspected across migrations `001–022`.
  - Migration 018 created `avatars`.
  - Migration 019 created `daily-evidence`.
  - **NO BUCKET EXISTS FOR TASK ATTACHMENTS**.
- **Assessment**:
  Task attachments cannot function in production until a private storage bucket (`task-attachments`) is created with authenticated storage RLS policies and signed URL generation.

---

## 13. Existing Realtime

### 13.1 Realtime Publication Inspection
- In `021_notifications_intelligence.sql`:
  `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;`
- **Tables in Publication**: Only `public.notifications`.
- Neither `projects`, `tasks`, nor `task_comments` are published to Realtime.
- **Recommendation**: Tasks and projects should use deterministic REST queries with optimistic state updates on mutation and refetch-on-action. Realtime subscription is **not required** and would add unnecessary connection overhead for standard ERP task tracking.

---

## 14. Existing Audit Logging

### 14.1 Audit Triggers Inspection
- `public.handle_audit_log()` is attached to:
  - `roles` (Migration 015)
  - `company_settings` (Migration 015)
  - `leave_requests` (Migration 022)
- Neither `public.projects` nor `public.tasks` are currently wired to `handle_audit_log()`.
- **Assessment**: Project creation/updates and task mutations are not logged in `public.audit_logs`.

---

## 15. Current Capabilities

| Capability | Status | Notes |
| :--- | :---: | :--- |
| Project Data Model | **Complete** | Standard relational schema in DB |
| Project Membership Table | **Complete** | Relational junction with `user_id` & `project_id` |
| Task Data Model | **Complete** | Relational schema with status and priority enums |
| Task Status Enum | **Complete** | 7 granular states in `002_core_types.sql` |
| Task Priority Enum | **Complete** | 4 priority levels |
| Task Discussion / Comments | **Partial** | Database table and UI present, but limited styling |
| Daily Tracker Task Correlation | **Complete** | Linked via `daily_report_tasks.task_id` |
| Automated Task Notifications | **Complete** | Database triggers handle all lifecycle events |
| Project Activity in Management | **Complete** | Embedded in project modal & work profile |

---

## 16. Missing Capabilities

| Capability | Severity | Description |
| :--- | :---: | :--- |
| **Task Status Enum Consistency** | **CRITICAL BUG** | `TasksPage.tsx` submits invalid strings (`pending`, `in_progress`), triggering database exceptions. |
| **Task Creation Mechanism** | **HIGH** | "Create Task" button is inert; regular employees are blocked by RLS from inserting tasks. |
| **Project Creation & Management** | **HIGH** | "New Project" button is inert; no UI exists to create projects or assign members. |
| **Storage Bucket for Attachments** | **HIGH** | `task-attachments` bucket does not exist in Supabase storage. |
| **Task Update Column Protection** | **HIGH SECURITY** | Assignees can alter `project_id`, `reporter_id`, or `assignee_id` due to lack of column restriction triggers. |
| **Task Filter & Search** | **MEDIUM** | No project filter, status filter, priority filter, due date filter, or text search. |
| **Project Progress Calculation** | **MEDIUM** | No derived progress metric; progress is not calculated from tasks. |
| **Overdue Work Intelligence** | **MEDIUM** | No visual indicators or filters for past-due unfinished tasks. |
| **Project & Task Service Layer** | **MEDIUM** | No dedicated services or TypeScript definitions; queries are scattered inline. |
| **Intern Project Access** | **LOW** | `Sidebar.tsx` omits `Projects` for `Intern` role. |

---

## 17. Proposed Phase 8 Scope

### What Phase 8 Will Deliver:
1. **TypeScript Service Layer**:
   - `src/types/project.ts` & `src/types/task.ts`: Strict types matching database enums.
   - `src/services/projectService.ts`: Centralized queries for projects, membership, metrics, and activity.
   - `src/services/taskService.ts`: Centralized queries for my tasks, assigned tasks, project tasks, comments, and status updates.
2. **Project Management Workspace (`ProjectsPage.tsx`)**:
   - Project cards displaying derived progress bar, task counts (total, completed, in progress, overdue), member avatars, and status badges.
   - Modal for "New Project" / "Edit Project" (for Admins / Super Admins).
   - Member management tab inside project modal (assign / remove members).
   - Preservation of existing `Project Details & Activity Overview` and `Recent Daily Report Logs` to guarantee zero regression on `tests/management.spec.ts`.
3. **Task Management Intelligence (`TasksPage.tsx`)**:
   - Tabs: **My Assigned Tasks**, **Delegated / Reported Tasks**, and (for Admins/Super Admins) **Company Task Overview**.
   - Multi-criteria filter bar: Project, Status (matching enum), Priority, Due Date / Overdue, and Keyword Search.
   - Task detail modal with correct status dropdown (using valid enum values), progress slider (0–100%), estimated hours, discussion thread, and task metadata.
   - Task Creation modal with project selection, member assignment, due date, priority, and description.
4. **Security & Data Integrity**:
   - Server-side column protection on `tasks` to prevent unauthorized tampering with `project_id`, `reporter_id`, and `created_at`.
   - RLS policy refinement allowing employees to create personal tasks or tasks within projects they belong to.
   - Automatic assignment of `reporter_id = auth.uid()`.
5. **Storage Bucket Provisioning**:
   - Provision `task-attachments` bucket (private) with storage RLS policies and signed URL handling.

---

## 18. Project UX

### Layout & Information Architecture:
- **Header**: Title "Projects", project count, search/filter, and "New Project" button (visible to Admins / Super Admins).
- **Project Cards Grid**:
  - Project Title & Status badge (`Active`, `On Hold`, `Completed`, `Archived`).
  - Description (2-line clamp).
  - Derived Progress Bar: `% Completed Tasks` with visual indicator.
  - Metric Pills: `Total Tasks`, `Completed`, `In Progress`, `Overdue`.
  - Date Range (Start Date → End Date / "Ongoing").
  - Project Owner / Manager profile badge.
  - Team Member Avatars count (`+N members`).
- **Project Detail & Activity Modal**:
  - **Overview Tab**: Project metadata, description, dates, owner.
  - **Tasks Tab**: Filterable list of all tasks within this project.
  - **Members Tab**: List of members with "Add Member" / "Remove Member" actions for managers.
  - **Recent Daily Report Logs**: Preserved for management intelligence and Phase 5B test compatibility.

---

## 19. Task UX

### Layout & Information Architecture:
- **Header**: Title "Task Management", active count, "Create Task" button.
- **Role-Aware Tabs**:
  - `My Tasks`: Tasks where `assignee_id = current_user.id`.
  - `Delegated by Me`: Tasks where `reporter_id = current_user.id AND assignee_id != current_user.id`.
  - `All Tasks (Organization)`: Visible exclusively to `Admin` and `Super Admin`.
- **Status Sub-Filters**:
  - `All`, `Todo`, `In Progress`, `In Review`, `Needs Revision`, `Completed`, `On Hold`.
- **Filter Bar**:
  - Project Selector.
  - Priority Selector (`Low`, `Medium`, `High`, `Urgent`).
  - Overdue Toggle (`Overdue Only`).
  - Search input (searches title and description).
- **Task Card / Row**:
  - Priority tag (color-coded: Urgent = red, High = amber, Medium = blue, Low = neutral).
  - Title and Project name badge.
  - Status pill.
  - Due date badge (highlighted in red if overdue).
  - Progress bar (`X%`).
  - Assignee and Reporter avatars/names.
  - Comment count badge.

---

## 20. Task Workflow

### State Machine & Transitions:
```
       ┌────────────────────────┐
       │          Todo          │
       └───────────┬────────────┘
                   │ Start Work
                   ▼
       ┌────────────────────────┐       Block/Pause       ┌────────────────────────┐
       │      In Progress       │ ◄─────────────────────► │        On Hold         │
       └───────────┬────────────┘                         └────────────────────────┘
                   │ Submit for Review
                   ▼
       ┌────────────────────────┐       Revise
       │         Review         │ ──────────────────────► ┌────────────────────────┐
       └───────────┬────────────┘                         │     Needs Revision     │
                   │ Approve                              └───────────┬────────────┘
                   ▼                                                  │ Re-submit
       ┌────────────────────────┐                                     │
       │       Completed        │ ◄───────────────────────────────────┘
       └────────────────────────┘
```
- **Allowed Actor Actions**:
  - **Assignee**: Can transition `Todo -> In Progress -> Review`, `In Progress -> On Hold`, update `progress` (0–100%).
  - **Reporter / Manager**: Can transition `Review -> Completed` or `Review -> Needs Revision`, reassign, cancel (`Cancelled`).
  - **Admin / Super Admin**: Global administrative transition capability.

---

## 21. Project Progress Model

### Authoritative Calculation Formula:
To avoid fake numbers or database column synchronization drift, project progress is **strictly derived from real task data**:
$$\text{Project Progress} = \begin{cases} 
0\% & \text{if Total Active Tasks} = 0 \\
\frac{\sum \text{task.progress}}{\text{Total Active Tasks}} & \text{or} \quad \frac{\text{Completed Tasks}}{\text{Total Active Tasks}} \times 100\%
\end{cases}$$

- **Rules**:
  1. `Cancelled` tasks are **excluded** from the denominator.
  2. If tasks have granular progress (0–100%), the average progress of all non-cancelled tasks provides an accurate completion metric.
  3. Projects with 0 tasks display an empty state indicator ("No tasks yet") rather than an arbitrary 0% or 100%.

---

## 22. Overdue Work Model

### Definition & Business Logic:
A task is classified as **Overdue** if and only if:
$$\text{due\_date} < \text{CURRENT\_DATE} \quad \text{AND} \quad \text{status} \notin ('Completed', 'Cancelled')$$

- **Display Rules**:
  - Overdue status is visually indicated with an urgent badge (`Due YYYY-MM-DD (X days overdue)`).
  - Overdue tasks sort to the top of the default task queue.
  - The Project card highlights an overdue count pill if any project task meets this condition.

---

## 23. Workload Visibility

### Ethical & Operational Workload Metrics:
In accordance with ERP design principles, workload visibility provides operational clarity rather than punitive surveillance:
- **Operational Metrics**:
  - **Active Tasks per Team Member**: Total non-completed tasks assigned to a user.
  - **Upcoming Deadlines**: Tasks due within the next 7 days.
  - **Project Distribution**: Number of distinct active projects a member is contributing to.
- **Strictly Prohibited**:
  - No "Employee Productivity Scores".
  - No algorithmic performance rankings or surveillance timers.
  - No fake AI health metrics.

---

## 24. Security Model

### 1. Database-Side Authorization:
- All task queries and mutations must be authorized by PostgreSQL RLS policies. Frontend restrictions are UI affordances only.
- The `UPDATE` trigger on `public.tasks` must ensure:
  - `id`, `project_id`, `created_at` are immutable once created.
  - Non-managers cannot change `reporter_id`.
  - Assignees can only update `status`, `progress`, and `description` of their own tasks.
- The `INSERT` trigger on `public.tasks` must ensure:
  - `reporter_id` is automatically set to `auth.uid()`.
  - Non-managers cannot create tasks for projects they are not members of.

---

## 25. Privacy Model

- **Project Visibility**: Non-manager users can only see projects where they are explicitly recorded in `project_members`.
- **Task Visibility**: Non-manager users can only see tasks for projects they belong to, or tasks assigned to them.
- **Discussions & Comments**: Comments on tasks are restricted to members of the parent project.
- **Attachments**: Stored in a private Supabase bucket; downloads require authenticated signed URLs with short-lived TTL (15 minutes).

---

## 26. Performance Model

1. **Avoid N+1 Queries**:
   - In `ProjectsPage.tsx`, task counts and progress will be aggregated via a single query or view rather than querying tasks for each project card in a loop.
2. **Database Indexes Required**:
   - Composite index `idx_tasks_project_status ON public.tasks(project_id, status)` for project dashboard aggregations.
   - Composite index `idx_tasks_assignee_status ON public.tasks(assignee_id, status)` for personal dashboard task queues.
3. **Server-Side Pagination / Limits**:
   - Limit task and project lists to 50 items per page with cursor/offset pagination.

---

## 27. Migration 023 Decision

### Decision: **MIGRATION 023 IS REQUIRED**

### Justification & Exact Schema Additions:
While the basic tables exist, completing Phase 8 safely and professionally without Migration 023 is impossible due to the following hard database deficiencies:
1. **RLS Policy Refinement**: Currently, employees/interns cannot create tasks because `tasks.create` permission is restricted to `Admin`. The policy must be updated to allow project members to create tasks within their projects.
2. **Column Tampering Prevention Trigger**: A `BEFORE UPDATE` trigger on `public.tasks` is required to protect `project_id`, `reporter_id`, and `created_at` from unauthorized modification by assignees.
3. **Storage Bucket Provisioning**: A private storage bucket `task-attachments` must be created in `storage.buckets` along with storage RLS policies.
4. **Audit Logging Integration**: `handle_audit_log()` must be attached to `projects` and `tasks` to track deletions and critical mutations.
5. **Composite Performance Indexes**:
   - `CREATE INDEX idx_tasks_project_status ON public.tasks(project_id, status);`
   - `CREATE INDEX idx_tasks_assignee_status ON public.tasks(assignee_id, status);`

---

## 28. Testing Strategy

A dedicated Playwright test suite (`tests/projects_tasks.spec.ts`) will be implemented covering:
1. **Security Escalation & RLS Tests**:
   - Employee attempting to update `project_id` or `reporter_id` on an assigned task -> MUST BE REJECTED.
   - Non-member attempting to view private project tasks -> MUST BE BLOCKED (0 rows).
   - Employee creating task in an unassigned project -> MUST BE REJECTED.
2. **Task Workflow & Status Enum Tests**:
   - Valid status transitions (`Todo` -> `In Progress` -> `Review` -> `Completed`) -> PASS.
   - Invalid status strings (`pending`) -> Prevented at type/API level.
3. **Project Progress & Overdue Derivation Tests**:
   - Verifying project progress calculation matches task completion.
   - Verifying overdue task flags on past-due dates.
4. **UI End-to-End Workflows**:
   - Admin creating a project, assigning members, creating a task.
   - Employee logging in, viewing assigned task, updating progress, adding a comment.
5. **Regression Verification**:
   - Phase 4 QA (`tests/qa.spec.ts`).
   - Phase 5B Management Intelligence (`tests/management.spec.ts` - specifically Test 5).
   - Phase 6 Notifications (`tests/notifications.spec.ts`).
   - Phase 7 Leave (`tests/leave.spec.ts`).

---

## 29. Risks

1. **Phase 5B Project Activity Test Clash**:
   - `tests/management.spec.ts` Test 5 relies on specific DOM text: `"Project Details & Activity Overview"` and `"Recent Daily Report Logs"`. Any UI redesign of `ProjectsPage.tsx` that removes these exact strings will fail existing regression tests.
   - *Mitigation*: Strictly preserve these modal sections and headers.
2. **Recursive RLS on Task Creation**:
   - Checking project membership during task insert must use `public.is_project_member()`, which is already `SECURITY DEFINER`.
3. **Notification Flooding**:
   - Since Migration 021 triggers notifications on task updates, bulk task updates could flood users.
   - *Mitigation*: Triggers check `IS DISTINCT FROM OLD` to ensure notifications fire only on actual value changes.

---

## 30. Out of Scope

The following features are **explicitly out of scope** for Phase 8:
- Gantt charts or complex timeline scheduling dependencies.
- Subtasks / multi-level nested task hierarchies (unsupported by schema).
- Kanban board drag-and-drop animations with third-party canvas libraries.
- Algorithmic employee productivity rating or ranking.
- External issue tracker sync (Jira / GitHub).

---

## 31. Final Recommendation

1. **Approve Phase 8 Architecture Specification**.
2. **Authorize Migration 023** to implement column protection triggers, project-member task insert RLS, storage bucket provisioning for `task-attachments`, audit triggers, and composite indexes.
3. **Execute Frontend Implementation**:
   - Create `src/types/project.ts` and `src/types/task.ts`.
   - Create `src/services/projectService.ts` and `src/services/taskService.ts`.
   - Re-architect `src/pages/tasks/TasksPage.tsx` with role-aware tabs, valid enums, filter bar, progress sliders, and working creation modal.
   - Re-architect `src/pages/projects/ProjectsPage.tsx` with derived progress bars, working project creation modal, member management, and preserved activity logs.
4. **Conduct Full QA & Regression Testing**.
