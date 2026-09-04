# SCARO ERP — Phase 6 Architecture Specification
**Notifications & Communication Intelligence System**

---

## 1. Current State Inspection & Architecture Audit

### 1.1 Existing Database Schema
The database already contains a base table for notifications in migration `010_notifications.sql`:
```sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- e.g., 'task_assigned', 'meeting_reminder'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id UUID, -- Can refer to task_id, meeting_id, etc.
    reference_type VARCHAR(100), -- Identifies the table of reference_id
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- **Indexes**: `idx_notifications_user_id`, `idx_notifications_is_read`, `idx_notifications_created_at`.
- **Existing Rows**: 0 (no notifications currently exist in production).
- **Reminders Support**: No scheduled reminder table or background cron job for notifications exists. `pg_cron` is enabled (from Migration 020 for Google Sheets sync retry), but is not configured for notification delivery.

### 1.2 Row Level Security (RLS) Analysis
In `014_rls_policies.sql`, RLS is enabled for `public.notifications` with only two policies:
1. `CREATE POLICY "View own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());`
2. `CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());`

**Security Boundary Findings**:
- There is **no INSERT policy** for authenticated users on `public.notifications`.
- Any attempt by client code to execute `supabase.from('notifications').insert(...)` fails with PostgreSQL error `42501 (Forbidden)`.
- This is architecturally sound: clients **must not** be allowed to fabricate arbitrary notifications for other users.
- Server-side database triggers and `SECURITY DEFINER` procedures are required to generate notifications securely upon authorized entity changes (e.g. task assignments, comments, messages, meetings, leaves, announcements).

### 1.3 Realtime Configuration Status
- **Inspection Result**: The `notifications` table is **not** currently included in the `supabase_realtime` publication.
- While the client successfully connects to Supabase Realtime websocket channels (`status: SUBSCRIBED`), Postgres row changes (`postgres_changes`) are **not broadcast** by PostgreSQL until `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;` is executed.
- If realtime is not enabled in publication, client polling/refresh must be used as fallback. Enabling publication in Migration 021 provides genuine instant notification delivery.

### 1.4 Frontend Implementation Bugs in Existing Skeleton
- **Column Mismatch**: `src/pages/notifications/NotificationsPage.tsx` and `src/layouts/Header.tsx` currently query:
  - `.update({ read: true })` instead of the actual PostgreSQL column `is_read`. This causes runtime PostgREST error `PGRST204: Could not find the 'read' column of 'notifications' in the schema cache`.
  - Type definitions reference `content` instead of the database column `message`.
- **No Entity Click-through Navigation**: Existing UI displays text without navigating to the referenced task, meeting, message, or report.
- **Unread Count Sync**: Unread count is not synchronized cleanly across the application shell.

---

## 2. Minimal Migration 021 Requirements

To implement Phase 6 without client-side security vulnerabilities or fake notifications, **Migration 021** (`supabase/migrations/021_notifications_intelligence.sql`) is required.

### 2.1 What Migration 021 Must Include:
1. **Realtime Broadcast**:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
   ```
2. **Server-Side Event Triggers (`SECURITY DEFINER`)**:
   - **Task Assigned / Status / Deadline / Priority**:
     - Trigger on `public.tasks`: Notifies `assignee_id` when assigned or updated, and notifies `reporter_id` when completed.
   - **Task Comments**:
     - Trigger on `public.task_comments`: Notifies `tasks.assignee_id` and `tasks.reporter_id` (excluding comment author).
   - **Direct Messages**:
     - Trigger on `public.messages` (where `task_id IS NULL`): Notifies `recipient_id` with minimal sanitized title: `"New message from [Sender Name]"` without leaking sensitive message text into the notification payload.
   - **Meeting Invitations / Updates / Cancellations**:
     - Trigger on `public.meeting_participants` and `public.meetings`: Notifies participants on invite or meeting cancellation.
   - **Leave Requests**:
     - Trigger on `public.leave_requests`:
       - On `INSERT` (`status = 'Pending'`): Notifies Admin/Managers.
       - On `UPDATE` (`status` transitions to `'Approved'` or `'Rejected'`): Notifies applicant `user_id`.
   - **Announcements**:
     - Trigger on `public.announcements`: Notifies target audience (`'Everyone'`, `'Employees'`, `'Interns'`, or `'Department'`), excluding the author.
   - **Daily Report Submission**:
     - Trigger on `public.daily_reports` (`status` transitions to `'submitted'`): Notifies Admin/Managers.
3. **Deduplication / Idempotency Rule**:
   - Built directly into trigger functions: checks if an unread notification with identical `user_id`, `reference_id`, and `type` was created within the last 30 minutes, preventing spam or duplicate notifications.
4. **RLS Integrity**:
   - Keep existing `SELECT` and `UPDATE` policies (`user_id = auth.uid()`).
   - Add `DELETE` policy for users to dismiss/delete their own notifications (`user_id = auth.uid()`).
   - **No client INSERT policy**: All notification creations remain exclusively server-controlled via trigger functions.

---

## 3. Detailed Component Architecture

### A. Notification Center UI & Header Dropdown
1. **Header Component (`src/layouts/Header.tsx`)**:
   - Interactive notification bell with unread count badge (hidden when 0).
   - Dropdown showing latest 5 unread/recent notifications with quick "Mark all as read" button.
   - Click item → opens entity directly and marks notification as read.
   - "View all notifications" → navigates to `/app/notifications`.
2. **Notifications Page (`src/pages/notifications/NotificationsPage.tsx`)**:
   - Filter tabs: `All`, `Unread`, `Tasks`, `Messages`, `Meetings`, `Reports`, `Announcements`.
   - Date groupings: `Today` vs `Earlier`.
   - Individual actions: "Mark as read", "Delete".
   - Header action: "Mark all as read".
   - Entity deep-linking with appropriate icons and status badges.

### B. Notification Types & Navigation Schema

| Type | Reference Type | Entity Link | Payload Example |
| :--- | :--- | :--- | :--- |
| `task_assigned` | `task` | `/app/tasks?taskId=<uuid>` | "You were assigned to task: [Title]" |
| `task_status_changed` | `task` | `/app/tasks?taskId=<uuid>` | "Task status updated: [Title] -> [Status]" |
| `task_comment` | `task` | `/app/tasks?taskId=<uuid>` | "New comment on task: [Title]" |
| `direct_message` | `message` | `/app/messages?userId=<sender_id>` | "New message from [Sender Name]" |
| `meeting_invite` | `meeting` | `/app/meetings?meetingId=<uuid>` | "Invited to meeting: [Title] on [Date]" |
| `meeting_cancelled` | `meeting` | `/app/meetings` | "Meeting cancelled: [Title]" |
| `leave_status` | `leave` | `/app/dashboard` | "Your leave request was [Approved/Rejected]" |
| `leave_pending` | `leave` | `/app/admin/overview` | "New leave request from [Name] pending approval" |
| `announcement` | `announcement` | `/app/dashboard` | "Announcement: [Title]" |
| `report_submitted` | `daily_report` | `/app/reports?reportId=<uuid>` | "Daily report submitted by [Name]" |
| `report_pending` | `daily_report` | `/app/tracker` | "Reminder: Please complete your daily report" |

### C. Daily Report Notification & Workforce Logic Integration
- **Strict Compliance with Phase 5B Rules**:
  - The notification system reuses [src/utils/workforceLogic.ts](file:///E:/scaro/src/utils/workforceLogic.ts).
  - Only active Employees and Interns who:
    1. Have checked in today (`attendance_sessions.clock_in_time IS NOT NULL`).
    2. Have not submitted today's daily report (`daily_reports.status != 'submitted'`).
    3. Are not on approved leave (`leave_requests.status = 'Approved'` covering today).
  - Will be evaluated for "Daily Report Pending" reminders.
  - Absent users and approved leave users are strictly excluded from "report pending" reminders.

---

## 4. Security & Privacy Guarantees
1. **Zero Secret Leaks**: No service role keys or secrets in frontend code.
2. **Database-Enforced Authorization**:
   - `SELECT` is constrained to `user_id = auth.uid()`. Even if an attacker manipulates API parameters, PostgreSQL returns zero rows for other users' notifications.
   - `UPDATE` is constrained to `user_id = auth.uid()`. Users cannot mark other users' notifications as read.
   - `DELETE` is constrained to `user_id = auth.uid()`.
   - Clients cannot insert notifications; all generation is automated by server-side database triggers.
3. **Sanitized Payloads**: Direct messages never copy raw message content into notifications, preventing accidental leakage of confidential chat snippets.

---

## 5. Verification & Test Plan
1. **Automated End-to-End Tests (`tests/notifications.spec.ts`)**:
   - Test 1: Employee receives task assignment and direct message notifications.
   - Test 2: Unread count badge increments, decrements on mark as read, and clears on "Mark all as read".
   - Test 3: Notification navigation deep-links to task and conversation.
   - Test 4: RLS Security: Verify cross-user notification reading and updates are blocked by PostgreSQL (403/zero rows).
   - Test 5: Verify absent users and approved leave users do not receive pending report notifications.
2. **Regression Verification**:
   - Run `tests/management.spec.ts` (Phase 5B management tests).
   - Run `tests/qa.spec.ts` (Phase 4 daily work tracker tests).
   - Run `npm run build` and `npm run lint`.
