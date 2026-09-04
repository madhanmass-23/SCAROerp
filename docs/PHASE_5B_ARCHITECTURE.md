# Phase 5B: Management Intelligence & Daily Work Control Architecture

## 1. Existing Database Schema Review

The SCARO ERP database comprises 20 migrations enforcing a strict relational model and Row-Level Security (RLS). Key entities relevant to Management Intelligence include:

- **`profiles`** (`005_profiles.sql`):
  - Primary key: `id` (references `auth.users(id)`).
  - Columns: `email`, `full_name`, `avatar_url`, `department_id`, `designation`, `joining_date`, `employment_status` (`'Employee'`, `'Intern'`), `is_active`.
  - Relationships: Foreign key to `departments(id)`.
- **`roles` & `user_roles`** (`004_roles_permissions.sql`, `017_seed_data.sql`):
  - Roles: `Super Admin`, `Admin`, `Employee`, `Intern`.
  - Helper functions: `public.is_super_admin(user_id)` and `public.has_permission(user_id, permission_name)`.
- **`projects` & `project_members`** (`006_projects_tasks.sql`):
  - Columns: `id`, `name`, `description`, `status` (`'Active'`), `start_date`, `end_date`, `owner_id`, `created_by`.
  - `project_members`: Composite key (`project_id`, `user_id`).
- **`tasks`** (`006_projects_tasks.sql`):
  - Columns: `id`, `project_id`, `title`, `description`, `assignee_id`, `reporter_id`, `priority`, `status` (`'Todo'`, `'In Progress'`, `'Completed'`), `progress`, `estimated_hours`, `due_date`.
- **`attendance_sessions`** (`007_attendance_meetings.sql`):
  - Columns: `id`, `user_id`, `session_date`, `clock_in_time`, `clock_out_time`, `status` (`'Present'`, `'Late'`, `'Half-Day'`).
  - Unique index on `user_id` where `clock_out_time IS NULL`.
- **`daily_reports`** (`008_daily_reports.sql`):
  - Columns: `id`, `user_id`, `report_date`, `status` (`'draft'`, `'submitted'`), `tomorrow_plan`, `blockers`, `company_requirements`, `notes`, `submitted_at`.
  - Unique constraint: `(user_id, report_date)`.
- **`daily_report_tasks`** (`008_daily_reports.sql`):
  - Columns: `id`, `report_id`, `task_id`, `time_spent_minutes`, `completion_percentage`, `task_status`, `custom_task_title`.
- **`daily_report_attachments`** (`019_daily_evidence.sql`):
  - Columns: `id`, `report_id`, `uploaded_by`, `file_name`, `storage_path`, `file_size`, `file_type`.
  - Storage bucket: `daily-evidence` (private bucket, authenticated RLS).
- **`daily_report_sync`** (`020_google_sheets_sync.sql`):
  - Columns: `report_id` (PK, references `daily_reports(id)`), `status` (`'pending'`, `'processing'`, `'synced'`, `'failed'`, `'permanently_failed'`), `external_row_reference`, `attempt_count`, `error_message`, `last_attempt_at`, `synced_at`.

---

## 2. Authorization Scope: Super Admin vs Admin

### Super Admin Scope
- **Database Boundary**: Bypasses restrictions via `is_super_admin(auth.uid()) = true`.
- **Visibility**: Company-wide executive intelligence across all departments, roles, company settings, and system-level logs.
- **Role**: Executive oversight, company-wide workforce counts, organizational settings.

### Admin Scope
- **Database Boundary**: Evaluated via role permissions (`reports.view`, `tasks.view`, `attendance.view`, `projects.view`, `users.view`).
- **Visibility**: Under the existing RLS policies in `014_rls_policies.sql`, having `reports.view` grants read access to all daily reports in the organization.
- **Operational Scope**: Focused strictly on daily operations and workforce supervision. Admin does **not** see company administration, company settings, or role management controls. In team dashboards, Admin views operational metrics (workforce attendance, report submission compliance, blockers reported by team members, active tasks).

---

## 3. Business Metric Definitions & Formulas

### Daily Report Pending Definition
- **Target Population**: Active team members who are required to submit daily reports:
  $$\text{Target Population} = \{ u \in \text{profiles} \mid u.\text{is\_active} = \text{true} \land \text{role}(u) \in [ \text{'Employee'}, \text{'Intern'} ] \}$$
- **Submitted Today**:
  $$\text{Submitted Today} = \{ r \in \text{daily\_reports} \mid r.\text{report\_date} = \text{today} \land r.\text{status} = \text{'submitted'} \land r.\text{user\_id} \in \text{Target Population} \}$$
- **Pending Today**:
  $$\text{Reports Pending Today} = |\text{Target Population}| - |\text{Submitted Today}|$$
  (Admin and Super Admin accounts are explicitly excluded from this calculation).

### Attendance + Report Correlation States
Targeted at active Employees and Interns:
1. **Present & Submitted**: User has an `attendance_sessions` record for today (`clock_in_time IS NOT NULL`) AND has a `daily_reports` record for today with `status = 'submitted'`.
2. **Present & Report Pending**: User has an `attendance_sessions` record for today (`clock_in_time IS NOT NULL`) AND either has no `daily_reports` record for today OR the report `status = 'draft'`.
3. **Absent / Not Checked In**: User has no `attendance_sessions` record for today.

### Blocker & Company Requirement Semantics
- In `daily_reports`, `blockers` and `company_requirements` are free-text narrative fields.
- The schema does **not** maintain a blocker lifecycle (no `is_resolved`, `resolved_at`, or `severity` fields).
- Therefore, they are presented as **"Reported Blockers"** and **"Reported Company Requirements"**, reflecting items submitted by team members on specific report dates.
- No artificial lifecycle or severity ratings will be fabricated.

### Morning Plan Storage
- Morning plans are collected by `DailyCheckinInterceptor.tsx` upon morning check-in and stored in `daily_reports.notes` (formatted as `Today's Plan: <plan>`) and `daily_reports.tomorrow_plan`.
- In the Report Detail view, the morning plan is read directly from these existing fields.

### Attendance Consistency
- Without an artificial expected-working-days calendar, we do not fabricate percentage "attendance consistency" scores.
- Instead, the Person Work Profile displays authentic recent attendance sessions (last 7–14 days) showing session dates, clock-in times, and session statuses.

---

## 4. Google Sheets Sync Health Monitoring

- Data source: Authoritative PostgreSQL table `daily_report_sync`.
- Health Metrics:
  - `Synced`: Records where `status = 'synced'`.
  - `Pending`: Records where `status = 'pending'`.
  - `Failed`: Records where `status = 'failed'`.
  - `Permanently Failed`: Records where `status = 'permanently_failed'`.
- Failed Sync Log: Lists report date, person, attempt count, last attempt timestamp, and sanitized error messages.
- Security: Never exposes `sync_webhook_secret`, Edge Function URLs, Google private keys, or API tokens. Never queries Google Sheets from the browser.

---

## 5. Shared Management Data Layer Architecture

To prevent redundant business logic across views, a centralized service layer (`src/services/managementService.ts`) handles data aggregation:
- `fetchManagementMetrics()`: Efficiently fetches counts for employees, interns, active projects, today's attendance, submissions, and pending counts.
- `fetchAttendanceReportCorrelation()`: Joins profiles, today's attendance, and today's daily reports.
- `fetchReportedBlockers()`: Retrieves submitted reports containing non-empty blockers.
- `fetchReportedRequirements()`: Retrieves submitted reports containing company requirements.
- `fetchSyncHealth()`: Aggregates `daily_report_sync` statuses and failed sync records.
- `fetchManagementReports(params)`: Supports server-side pagination (`from`, `to`), deterministic ordering (`report_date DESC, id DESC`), date presets/ranges, role, department, status, and sync status filters.

---

## 6. Database Migration Requirement: NONE

No schema changes or migrations are needed. All fields, relations, indexes, and RLS policies required for Phase 5B already exist and are fully functioning.
