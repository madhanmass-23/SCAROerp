# SCARO ERP — Phase 9 Architecture
## Workforce Performance & Work Intelligence

---

## 1. Executive Summary

Phase 9 establishes an authoritative, production-grade **Workforce Performance & Work Intelligence** layer for SCARO ERP. This module equips Operations Admins and Super Admins with operational visibility into organizational commitments, current workload distributions, blockers, and historical execution patterns across employees and interns.

A comprehensive read-only audit of migrations `001–023`, existing services (`managementService.ts`, `projectService.ts`, `taskService.ts`), and the UI application reveals:
1. **Authoritative Relational Foundation is Complete**: All 20 necessary database tables (`profiles`, `user_roles`, `roles`, `departments`, `projects`, `project_members`, `tasks`, `task_comments`, `task_attachments`, `daily_reports`, `daily_report_tasks`, `attendance_sessions`, `leave_requests`, `meetings`, `meeting_participants`, `notifications`, `messages`, `audit_logs`, `daily_report_sync`, `company_settings`) already exist in PostgreSQL with strict constraints, enums, composite indexes, and RLS policies.
2. **Phase 5B Provides the Operational Baseline**: `src/services/managementService.ts` and `src/utils/workforceLogic.ts` already implement executive summary cards, attendance-to-report correlation (`evaluateWorkforceCorrelationStatus`), reported blockers, reported company requirements, and Google Sheets sync health.
3. **No Migration 024 is Required**: Because the existing relational model, composite indexes, and security triggers (added in Migrations 020, 021, 022, and 023) fully support multi-table aggregation, time-series date filtering, and individual workload breakdowns, **Migration 024 is NOT REQUIRED**.
4. **Strict Architectural Invariant — Zero Surveillance / Zero Scoring**:
   - **PROHIBITED**: Productivity scores, efficiency formulas, employee leaderboards, comparative performance rankings, AI ratings, attendance scores, "best/worst employee" labels.
   - **MANDATED**: Factual, operational counts (Active Tasks, Overdue Tasks, Tasks In Progress, Tasks In Review, Completed Tasks, Enrolled Projects, Attendance sessions, Approved Leaves, Reported Blockers).

---

## 2. Existing Management Intelligence

### 2.1 Audit of Phase 5B (`managementService.ts` & `management.ts`)

| Feature Area | Current Implementation Status | Evaluation & Gap Analysis |
| :--- | :--- | :--- |
| **Top-level Metrics** | `fetchManagementMetrics()` | **EXISTING**: Computes total employees, interns, active users, checked in today, reports submitted today, reports pending today, active projects, active tasks, blockers count. |
| **Attendance/Report Correlation** | `fetchAttendanceReportCorrelation()` | **EXISTING**: Evaluates `Present & Submitted`, `Present & Report Pending`, `Absent / Not Checked In`, taking approved leave into account via `workforceLogic.ts`. |
| **Reported Blockers** | `fetchReportedBlockers()` | **EXISTING**: Surfaces daily reports where `blockers != ''`. |
| **Company Requirements** | `fetchReportedRequirements()` | **EXISTING**: Surfaces daily reports where `company_requirements != ''`. |
| **Google Sheets Sync Health** | `fetchSyncHealth()` | **EXISTING**: Summarizes sync status, failed records, and retry counters. |
| **Management Reports Explorer** | `fetchManagementReports()` | **EXISTING**: Paginated, filtered daily reports with task breakdowns. |
| **Person Work Profile** | `fetchPersonWorkProfile()` & `PersonWorkProfileModal.tsx` | **PARTIAL**: Basic modal showing raw top 10 reports, 14 attendance sessions, and 10 tasks. Lacks project contribution breakdown, leave history, meeting workload, overdue task breakdown, and time-range filtering. |
| **Team Workload Overview** | *None* | **MISSING**: No aggregated workload view across team members showing active vs overdue tasks and project allocations. |
| **Time-Windowed Trends** | *None* | **MISSING**: No 7/14/30-day factual trend aggregation for report compliance, task completion, or attendance. |
| **Operational Workload Alerts** | *None* | **MISSING**: No factual alert indicators for overdue tasks, heavy task queues, or unaddressed blockers. |

---

## 3. Existing Workforce Data

All workforce intelligence derives exclusively from real tables in PostgreSQL across migrations `001–023`:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              POSTGRESQL SCHEMA                               │
├──────────────────────┬───────────────────────────────────────────────────────┤
│ Table                │ Primary Fields for Work Intelligence                  │
├──────────────────────┼───────────────────────────────────────────────────────┤
│ profiles             │ id, full_name, email, avatar_url, department_id,      │
│                      │ designation, joining_date, employment_status, is_active│
│ user_roles & roles   │ user_id, role_id -> 'Super Admin','Admin','Employee',  │
│                      │ 'Intern'                                              │
│ departments          │ id, name, manager_id, is_active                       │
│ projects             │ id, name, status, start_date, end_date, owner_id       │
│ project_members      │ project_id, user_id                                  │
│ tasks                │ id, project_id, title, assignee_id, reporter_id,      │
│                      │ priority, status, progress, estimated_hours, due_date │
│ task_comments        │ id, task_id, author_id, content, created_at           │
│ task_attachments     │ id, task_id, uploaded_by, file_name, storage_path     │
│ daily_reports        │ id, user_id, report_date, status, tomorrow_plan,      │
│                      │ blockers, company_requirements, notes, submitted_at   │
│ daily_report_tasks   │ id, report_id, task_id, time_spent_minutes,           │
│                      │ completion_percentage, task_status, custom_task_title │
│ attendance_sessions  │ id, user_id, session_date, clock_in_time,             │
│                      │ clock_out_time, status                                │
│ leave_requests       │ id, user_id, type, start_date, end_date, status,      │
│                      │ reviewed_at (reason kept private)                     │
│ meetings & part.     │ id, title, meeting_date, start_time, end_time, status  │
│ audit_logs           │ actor_id, action, table_name, record_id, created_at   │
└──────────────────────┴───────────────────────────────────────────────────────┘
```

---

## 4. Individual Work Profile

The individual work profile provides a 360-degree operational view of a specific team member without speculative evaluations.

### 4.1 Structural Sections
1. **Identity & Core Status**: Full name, email, avatar, role badge, department name, designation, joining date, active state.
2. **Current Workload Summary**:
   - `Active Tasks`: Total count of assigned open tasks (`status IN ('Todo', 'In Progress', 'Review', 'Needs Revision')`).
   - `Tasks In Progress`: Tasks currently being executed (`status = 'In Progress'`).
   - `Tasks In Review`: Tasks submitted for peer/manager inspection (`status = 'Review'`).
   - `Overdue Tasks`: Tasks past due date (`due_date < CURRENT_DATE` and `status NOT IN ('Completed', 'Cancelled')`).
   - `Completed Tasks`: Tasks finalized (`status = 'Completed'`).
   - `Enrolled Projects`: Count of active projects where the person is a project member or assignee.
3. **Tabbed Deep-Dives**:
   - **Tab 1: Current Tasks**: Detailed list of open tasks with project name, priority badge (`Urgent`, `High`, `Medium`, `Low`), progress bar, and due date.
   - **Tab 2: Project Contributions**: Projects the user is member of or has tasks in, detailing assigned tasks, completed tasks, and open tasks per project.
   - **Tab 3: Work History & Daily Reports**: Chronological log of daily reports with tasks worked on, time spent (minutes), completion percentages, and tomorrow's plan.
   - **Tab 4: Attendance & Schedule**: Recent 14-to-30-day attendance sessions (clock-in, clock-out, status) correlated with approved leave dates.
   - **Tab 5: Blockers & Inquiries**: Historical roadblocks and company requirements reported by the user to monitor operational resolution.
   - **Tab 6: Collaborative Commitments (Meetings)**: Upcoming and recent meetings scheduled with start time, duration, and status.

---

## 5. Current Workload Model

Workload is defined strictly by real task commitments and due dates.

### 5.1 Factual Metric Definitions
- **Active Tasks**:
  $$\text{Active Tasks} = \sum [\text{status} \in \{\text{'Todo'}, \text{'In Progress'}, \text{'Review'}, \text{'Needs Revision'}\}]$$
- **Overdue Tasks**:
  $$\text{Overdue Tasks} = \sum [\text{status} \notin \{\text{'Completed'}, \text{'Cancelled'}\} \land \text{due\_date} < \text{CURRENT\_DATE}]$$
- **In-Progress Tasks**:
  $$\text{In Progress} = \sum [\text{status} = \text{'In Progress'}]$$
- **Under-Review Tasks**:
  $$\text{Review} = \sum [\text{status} = \text{'Review'}]$$
- **On-Hold Tasks**:
  $$\text{On Hold} = \sum [\text{status} = \text{'On Hold'}]$$
- **Completed Tasks**:
  $$\text{Completed} = \sum [\text{status} = \text{'Completed'}]$$

### 5.2 Prohibited Anti-Patterns
- **NO** "Productivity Score" (e.g. $\frac{\text{tasks}}{\text{hours}}$).
- **NO** "Employee Efficiency Index".
- **NO** Leaderboards, employee rankings, or sorting by "best/worst".
- **NO** Arbitrary weighted performance formulas.

---

## 6. Task Intelligence

Task intelligence visualizes task pipeline health using the exact PostgreSQL enum `task_status_type`:

```
┌─────────┐     ┌─────────────┐     ┌────────┐     ┌───────────┐
│  Todo   │ ──> │ In Progress │ ──> │ Review │ ──> │ Completed │
└─────────┘     └─────────────┘     └────────┘     └───────────┘
                       │                 │
                       ▼                 ▼
                ┌─────────────┐   ┌────────────────┐
                │   On Hold   │   │ Needs Revision │
                └─────────────┘   └────────────────┘
```

### 6.1 Task Categorization
- **Urgent Queue**: `priority = 'Urgent'` and active.
- **Due Today / Imminent**: `due_date = CURRENT_DATE` or `due_date = CURRENT_DATE + 1`.
- **Overdue Backlog**: `due_date < CURRENT_DATE` and active.
- **Review Queue**: `status = 'Review'`.

---

## 7. Project Contribution

Project contribution maps a person's involvement across company projects without subjective scoring.

### 7.1 Data Sources & Resolution
1. Query `public.project_members` for direct enrollment.
2. Query `public.tasks` where `assignee_id = userId` grouped by `project_id`.
3. Combine sets to prevent duplicate counts.

### 7.2 Contribution Breakdown per Project
- Project Name & Status (`'Active'`, `'Completed'`, `'On Hold'`).
- Membership Status (`'Enrolled Member'` vs `'Task Assignee'`).
- Assigned Tasks Count.
- Completed Tasks Count.
- Open Tasks Count.
- Overdue Tasks Count.

---

## 8. Daily Work Report Intelligence

Daily work reports provide factual daily logs of work executed, time spent, and planning.

### 8.1 Reused Workforce Logic
All pending-report logic reuses [src/utils/workforceLogic.ts](file:///E:/scaro/src/utils/workforceLogic.ts):
```ts
export function evaluateWorkforceCorrelationStatus(
  isPresent: boolean,
  isSubmitted: boolean,
  isApprovedLeave: boolean = false
): { status: AttendanceReportCorrelationItem['status']; isPending: boolean };
```

### 8.2 Report Aggregate Metrics (Time Windowed)
- Total Reports Submitted.
- Reports Pending Today.
- Total Self-Reported Work Time: $\sum \text{time\_spent\_minutes}$.
- Average Self-Reported Task Completion Percentage: $\frac{\sum \text{completion\_percentage}}{N}$.
- Blockers Logged Count.

---

## 9. Attendance Correlation

Correlates physical check-in status with daily work reporting to detect operational disconnects.

### 9.1 The Four Authoritative States
1. **Present & Submitted**: User checked in today (`attendance_sessions.clock_in_time IS NOT NULL`) AND submitted today's report (`daily_reports.status = 'submitted'`), OR is on approved leave today.
2. **Present & Report Pending**: User checked in today, is not on approved leave, and has not yet submitted today's report (`isPending = true`).
3. **Absent / Not Checked In**: User has no active attendance session today. (Explicitly NOT counted as pending).
4. **On Leave**: User has a verified record in `leave_requests` with `status = 'Approved'` covering today.

---

## 10. Leave Integration

Integrates Phase 7 leave operations into workforce intelligence.

### 10.1 Displayed Metrics & Schedules
- Approved Leave Count & Days (YTD / Selected Period).
- Upcoming Scheduled Leaves (Next 30 Days).
- Leave Types: `Leave`, `Permission`, `Work From Home`.

### 10.2 Privacy Protection Mandate
The `reason` field in `leave_requests` often contains confidential medical or personal details. In management workforce intelligence views:
- **Only** `type`, `start_date`, `end_date`, and `status` are displayed.
- The raw `reason` text is **omitted** from work profile summaries to protect employee privacy.

---

## 11. Meeting Integration

Inspects collaborative commitments from `meetings` and `meeting_participants`.

### 11.1 Displayed Information
- Upcoming Meetings (Title, Date, Time, Duration).
- Recent Meetings attended.
- Meeting Status (`'Scheduled'`, `'Completed'`, `'Cancelled'`).

### 11.2 Architectural Rule
Meeting volume is **never** used as a productivity score. A high meeting count indicates heavy collaborative requirements, not high or low performance.

---

## 12. Blockers & Requirements

Surfaces operational friction directly reported by employees and interns.

### 12.1 Blockers Management
- Source: `daily_reports.blockers` (when `!= ''`).
- Purpose: Identifies technical impediments, third-party dependency outages, or permission bottlenecks.
- Display: Chronological list with report date, submitter name, department, and blocker description.

### 12.2 Company Requirements Management
- Source: `daily_reports.company_requirements` (when `!= ''`).
- Purpose: Captures resource needs (hardware, software licenses, database credentials, training).
- Display: Chronological list with report date, submitter name, and requirement text.

---

## 13. Work History

Provides a paginated, chronological record of daily work tasks.

### 13.1 Schema Join Structure
- `daily_reports` joined with `daily_report_tasks`.
- `daily_report_tasks` joined with `tasks(title, project:projects(name))`.
- Attached evidence joined with `daily_report_attachments`.

### 13.2 Displayed Attributes
`Date` • `Project Name` • `Task Title` • `Time Spent (Hours/Minutes)` • `Completion %` • `Tomorrow Plan` • `Evidence File Link`.

---

## 14. Team Workload

Designed for Admins supervising their specific department or assigned project teams.

### 14.1 Team Workload Table (Factual & Non-Comparative)
| Column | Description |
| :--- | :--- |
| **Team Member** | Name, avatar, role badge, designation. |
| **Today's Status** | Correlation status (`Present & Submitted`, `Report Pending`, `Absent`, `On Leave`). |
| **Active Tasks** | Factual count of open tasks assigned. |
| **In Progress** | Count of tasks currently in progress. |
| **Overdue** | Count of tasks past due date. |
| **Active Projects** | Count of projects the member is participating in. |
| **Action** | "View Work Profile" button opening the individual intelligence modal/page. |

---

## 15. Super Admin Intelligence

Provides executive, organization-wide intelligence across all departments and projects.

### 15.1 Company-Wide Overview Cards
1. **Total Workforce**: Employees + Interns + Active Users.
2. **Attendance Compliance**: Checked In Today vs Absent vs On Approved Leave.
3. **Daily Report Compliance**: Reports Submitted vs Reports Pending Today.
4. **Task Operations**: Total Active Tasks vs Overdue Tasks vs In-Review Tasks.
5. **Project Landscape**: Total Active Projects.
6. **Active Impediments**: Total Unresolved Blockers reported.
7. **System Sync Health**: Google Sheets synchronization status.

---

## 16. Time Windows

Standardized time horizons for filtering reports, task throughput, and attendance:
- **Today** (`report_date = CURRENT_DATE`)
- **Last 7 Days** (`report_date >= CURRENT_DATE - 7`)
- **Last 14 Days** (`report_date >= CURRENT_DATE - 14`)
- **Last 30 Days** (`report_date >= CURRENT_DATE - 30`)
- **Custom Range** (`report_date BETWEEN startDate AND endDate`)

All queries execute server-side boundary filters using PostgREST operators (`gte`, `lte`).

---

## 17. Legitimate Trends

Trends represent historical volume over time, never "performance curves".

### 17.1 Trend Formats
1. **Daily Report Submission Trend**: Number of daily reports submitted per day over the last 7/14/30 days.
2. **Task Completion Throughput**: Number of tasks marked `'Completed'` per day over the selected window.
3. **Daily Check-In Volume**: Number of unique attendance clock-ins per day.

### 17.2 Zero-Fill Algorithm
Missing days (e.g. weekends or holidays) are explicitly zero-filled by the client utility so that charts reflect accurate chronological dates without distortion.

---

## 18. Operational Alerts

Operational alerts are purely factual status indicators designed to draw managerial attention to actionable workflow bottlenecks.

### 18.1 Defined Factual Alerts
- **Overdue Task Alert**: $\text{Count of overdue tasks} > 0$ for a person or project.
- **Multiple Urgent Tasks Alert**: $\text{Count of active Urgent tasks} \ge 3$ for a single individual (potential overload).
- **Pending Daily Report Alert**: Person checked in today, working day has ended, and report is still pending.
- **Reported Blocker Alert**: Person has submitted a daily report containing an unresolved blocker.
- **Project Overdue Alert**: Project past target end date with incomplete tasks remaining.

---

## 19. Privacy Model

1. **Direct Messages Privacy**: The `public.messages` table contains 1-on-1 private communications. Management work profiles must **never** query or display direct messages.
2. **Leave Reason Privacy**: The `reason` field in `public.leave_requests` is withheld from management overview tables. Only the leave type and date range are exposed.
3. **Private Evidence Isolation**: Evidence files in `daily-evidence` storage and `task-attachments` storage are accessible only to authorized roles via signed URLs.

---

## 20. Security Model

1. **Role Enforcement**:
   - `Super Admin`: Company-wide visibility across all profiles, tasks, projects, reports, and settings.
   - `Admin`: Visibility bounded by authorized permissions/roles.
   - `Employee` & `Intern`: **Strictly blocked** from management overview endpoints and dashboards. Access is limited strictly to their own tasks, projects, reports, and profile.
2. **RLS Preservation**: All queries run through Supabase client respecting active PostgreSQL RLS policies. Client-side role spoofing is impossible.
3. **No Email Whitelists**: Authorization is verified strictly via `user_roles` joined with `roles` and `permissions`.

---

## 21. Performance Model

1. **Server-Side Bounds**: All time-series and report queries use PostgREST `.gte()`, `.lte()`, and `.range()` for pagination.
2. **Parallel Promise Execution**: Dashboards query metrics, reports, attendance, and tasks in parallel using `Promise.all`.
3. **Composite Index Utilization**:
   - Tasks: `idx_tasks_project_status`, `idx_tasks_assignee_status`, `idx_tasks_reporter_id`.
   - Attendance: `idx_attendance_sessions_user_id`, `idx_attendance_sessions_session_date`.
   - Reports: `idx_daily_reports_user_id`, `idx_daily_reports_report_date`.
   - Leave: `idx_leave_requests_dates`, `idx_leave_requests_user_id`.

---

## 22. Google Sheets Integration

Phase 5A Google Sheets integration is complete, tested, and operational.
- **Verdict**: **No Phase 5A changes required.**
- Daily report sync triggers and worker queues operate independently and require no modifications for Phase 9.

---

## 23. Notification Integration

Phase 6 Notifications & Communication Intelligence is complete.
- **Verdict**: **No new notification triggers or tables required.**
- Existing database triggers already dispatch notifications for task assignments, meeting schedules, and leave approvals.

---

## 24. Realtime

- **Verdict**: **Not required for Phase 9.**
- Management intelligence dashboards rely on explicit on-mount loading and user-triggered refresh buttons. Subscribing to full-database change feeds for management analytics is unnecessary and incurs unjustified connection overhead.

---

## 25. Audit Logging

- **Verdict**: **Supported via existing database infrastructure.**
- Triggers on `public.projects`, `public.tasks`, `public.leave_requests`, and `public.roles` already log modifications to `public.audit_logs`. No additional audit triggers are required.

---

## 26. Migration 024 Decision

- **Verdict**: **Migration 024 is NOT REQUIRED.**
- Comprehensive audit confirms that all 20 necessary tables, 8 core enums, RLS policies, storage buckets, and composite indexes already exist. Phase 9 is purely an application-tier intelligence, aggregation, service, and UI enhancement.

---

## 27. Testing Strategy

When implementation begins, testing must encompass:
1. **Security & Role Isolation**:
   - Verify Employees and Interns cannot access management work intelligence routes (`/app/admin/*`, `/app/admin/workforce`, etc.).
   - Verify Admin and Super Admin access corresponds to their authorized scope.
2. **Factual Metric Accuracy**:
   - Verify active tasks count equals Todo + In Progress + Review + Needs Revision.
   - Verify overdue tasks count matches tasks where `due_date < today` and status is not completed/cancelled.
   - Verify attendance/report correlation accurately applies `evaluateWorkforceCorrelationStatus`.
3. **Privacy Enforcement**:
   - Verify private direct messages are never retrieved or rendered.
   - Verify leave reasons are excluded from management workforce summaries.
4. **Zero-Scoring Conformance**:
   - Automated scan verifying absence of productivity ratings, efficiency formulas, or leaderboard rankings.
5. **Full Regression Suite**:
   - Phase 4 Daily Work Tracker (`tests/qa.spec.ts`)
   - Phase 5B Management Intelligence (`tests/management.spec.ts`)
   - Phase 6 Notifications (`tests/notifications.spec.ts`)
   - Phase 7 Leave Operations (`tests/leave.spec.ts`)
   - Phase 8 Projects & Tasks (`tests/projects_tasks.spec.ts`)

---

## 28. Risks

| Risk | Mitigation |
| :--- | :--- |
| **N+1 Query Overhead on Team Views** | Fetch team profiles and task counts in batched queries rather than individual per-user loop requests. |
| **Date Timezone Boundary Offsets** | Use ISO date strings (`YYYY-MM-DD`) matching `company_settings.timezone` (`Asia/Kolkata`) rather than client-local UTC parsing. |
| **UI Crowding on Dashboards** | Employ clean tabbed views and structured cards rather than dumping all metrics on a single unscrollable page. |

---

## 29. Out of Scope

The following items are strictly out of scope for Phase 9:
- Performance scores, productivity indexes, or AI evaluation scores.
- Employee ranking algorithms or gamified leaderboards.
- Modifying Phase 5A Google Sheets edge function or webhook pipeline.
- Modifying Phase 6 notification triggers or creating new notification types.
- Modifying core database schema or creating Migration 024.

---

## 30. Final Recommendation

Proceed with Phase 9 implementation adhering to this architecture document:
1. Retain and extend [src/services/managementService.ts](file:///E:/scaro/src/services/managementService.ts) and [src/types/management.ts](file:///E:/scaro/src/types/management.ts).
2. Expand `PersonWorkProfileModal.tsx` into an exhaustive multi-tab Work Intelligence view (Overview, Current Tasks, Project Contributions, Work History, Attendance/Leave, Blockers, Meetings).
3. Add a Team Workload intelligence overview to `AdminDashboard.tsx` and `SuperAdminDashboard.tsx`.
4. Add factual workload alerts and time-windowed compliance trends (7/14/30 days).
5. Maintain 100% regression compatibility across Phases 4 through 8.
