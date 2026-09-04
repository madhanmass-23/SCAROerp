# SCARO ERP — Phase 7 Architecture Specification
**Leave & Basic HR Operations Module**

---

## 1. Executive Summary

Phase 7 evaluates the transformation of the nascent leave database structure into a production-grade, role-aware Leave & Basic HR Operations module for SCARO ERP.

A complete read-only inspection of the database (migrations 001–021) and frontend source code reveals:
1. **Schema Foundation Exists**: A basic `public.leave_requests` table exists with enum types `leave_type` (`'Leave'`, `'Permission'`, `'Work From Home'`) and `leave_status_type` (`'Pending'`, `'Approved'`, `'Rejected'`).
2. **Zero Frontend Leave UI Exists**: There are currently **no** Leave pages, components, or leave services in `src/`. The `/app/leave` route in `Sidebar.tsx` leads to an unhandled 404 route in `App.tsx`.
3. **Critical Security Vulnerability in Existing RLS**: The existing `UPDATE` policy on `leave_requests` permits any authenticated user to update their own leave row without a `WITH CHECK` constraint or column restriction trigger, which theoretically permits users to self-approve leave requests (`status = 'Approved'`).
4. **No Leave Balances or Holiday System**: There are **no** tables or columns for leave balances, accruals, carry-forwards, or company holidays in PostgreSQL.
5. **Phase 5B & Phase 6 Integration Already Active**: 
   - Approved leave is successfully consumed by [src/utils/workforceLogic.ts](file:///E:/scaro/src/utils/workforceLogic.ts) to exclude approved-leave users from pending daily reports.
   - Database trigger `on_leave_request_notification` (Migration 021) already generates notifications on leave submission and approval/rejection.

---

## 2. Existing Leave Schema

### 2.1 Table Structure (`011_leave_announcements.sql`)
```sql
CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type public.leave_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status public.leave_status_type DEFAULT 'Pending',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_user_id ON public.leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
```

### 2.2 Core Types (`002_core_types.sql`)
- `leave_type`: `'Leave'`, `'Permission'`, `'Work From Home'`
- `leave_status_type`: `'Pending'`, `'Approved'`, `'Rejected'`

### 2.3 Explicit Schema Capabilities & Limitations
| Capability | Supported in DB? | Details |
| :--- | :---: | :--- |
| Primary Key | **YES** | `id UUID DEFAULT gen_random_uuid()` |
| User Reference | **YES** | `user_id REFERENCES public.profiles(id)` |
| Leave Types | **YES** | 3 enum values: `'Leave'`, `'Permission'`, `'Work From Home'` |
| Date Range | **YES** | `start_date DATE`, `end_date DATE`, `CHECK (end_date >= start_date)` |
| Reason Field | **YES** | `reason TEXT NOT NULL` |
| Approval Status | **YES** | `'Pending'`, `'Approved'`, `'Rejected'` |
| Reviewer Tracking | **YES** | `reviewed_by UUID REFERENCES profiles(id)`, `reviewed_at TIMESTAMPTZ` |
| Rejection Reason | **NO** | No column for rejection explanation or admin comments |
| Cancellation Status | **NO** | No `'Cancelled'` state in `leave_status_type` enum |
| Draft State | **NO** | No `'Draft'` state in `leave_status_type` enum |
| Leave Balances | **NO** | **Leave balances are not currently supported by the existing schema.** |
| Overlap Prevention | **NO** | No database constraint prevents overlapping leave requests |
| Company Holidays | **NO** | No holiday table or weekend exclusion logic in DB |
| Approval History Log | **NO** | Only latest `reviewed_by` / `reviewed_at` is preserved |

---

## 3. Existing Leave UI

- **Inspection Finding**: **ZERO** UI components exist for Leave.
- `src/layouts/Sidebar.tsx` line 42 displays:
  ```ts
  { name: 'Leave', href: '/app/leave', icon: Calendar, roles: ['Super Admin', 'Admin'] }
  ```
  - Employees and Interns do not have a leave link in their sidebar.
  - Clicking `/app/leave` hits a fallback redirect because the route is not registered in `src/App.tsx`.
- `src/pages/dashboard/EmployeeDashboard.tsx` and `InternDashboard.tsx` have zero leave widgets or links.
- `src/pages/admin/AdminDashboard.tsx` and `SuperAdminDashboard.tsx` have zero leave widgets or management tables.

---

## 4. Existing RLS / Permissions

### 4.1 Seeded Permissions (`017_seed_data.sql`)
- `leave.view`: Assigned to `Admin` role.
- `leave.manage`: Assigned to `Admin` role.
- `Super Admin`: Bypasses via `public.is_super_admin(auth.uid())`.
- `Employee` and `Intern`: Have neither `leave.view` nor `leave.manage`.

### 4.2 RLS Policies (`014_rls_policies.sql`)
```sql
-- 1. SELECT
CREATE POLICY "View leave requests" ON public.leave_requests 
  FOR SELECT USING (
    auth.uid() = user_id OR 
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'leave.view')
  );

-- 2. INSERT
CREATE POLICY "Create leave requests" ON public.leave_requests 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE
CREATE POLICY "Update leave requests" ON public.leave_requests 
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'leave.manage')
  );

-- 4. DELETE
-- NO DELETE policy exists.
```

### 4.3 Critical Security Finding (RLS Privilege Escalation Gap)
In `014_rls_policies.sql`, the policy `"Update leave requests"` allows `auth.uid() = user_id` to update records. 
Unlike `public.profiles` and `public.attendance_sessions`, there is **no trigger** (such as `restrict_leave_updates()`) locking down sensitive columns.
- **Vulnerability**: A regular Employee or Intern can currently send a direct PostgREST `PATCH` request to `/rest/v1/leave_requests` setting `status = 'Approved'`, `reviewed_by = auth.uid()`, bypassing management review!
- **Mandatory Remediation**: A column tampering protection trigger (or revised RLS `WITH CHECK` constraint) is required to ensure regular users can only update their own requests when `status = 'Pending'`, and can never alter `status`, `reviewed_by`, or `reviewed_at`.

---

## 5. Existing Notifications

Phase 6 Migration 021 implemented server-side triggers for leave requests:
```sql
-- Trigger: on_leave_request_notification on public.leave_requests
-- 1. On INSERT (status = 'Pending'):
--    Notifies all Admins and Super Admins with type = 'leave_pending'
-- 2. On UPDATE (status changes to 'Approved' or 'Rejected'):
--    Notifies applicant user_id with type = 'leave_status'
```
- **Idempotency**: Managed via `public.notify_user()` (15-minute deduplication window).
- **Client Rule**: Frontend code **must not** duplicate notification insertion; all notifications are generated automatically by PostgreSQL triggers.

---

## 6. Existing Attendance Integration

Phase 5B established workforce correlation logic in [src/utils/workforceLogic.ts](file:///E:/scaro/src/utils/workforceLogic.ts) and [src/services/managementService.ts](file:///E:/scaro/src/services/managementService.ts):
```ts
// Active target users on approved leave today:
// status = 'Approved' AND start_date <= today AND end_date >= today
const isApprovedLeave = approvedLeaveUserIds.has(user.id);
const { isPending, status } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);
```
- **Rule**: If a user is on approved leave today, they are classified as `'On Leave'` and are **strictly excluded** from `Reports Pending Today`.
- **Integrity**: Phase 7 must preserve this query and rule without deviation.

---

## 7. Existing Audit Logging

- `public.audit_logs` exists and is secured by RLS.
- In `015_triggers.sql`, `handle_audit_log()` is attached only to `public.roles` and `public.company_settings`.
- Leave requests are **not** currently logged in `public.audit_logs`.

---

## 8. Supported Functionality (Based on Active DB)

The following can be implemented **immediately** using the existing database:
1. **Employee / Intern**:
   - Submit leave application with type (`'Leave'`, `'Permission'`, `'Work From Home'`), `start_date`, `end_date`, and `reason`.
   - View own submitted leave requests and statuses (`'Pending'`, `'Approved'`, `'Rejected'`).
   - View own leave history.
2. **Admin / Super Admin**:
   - View all company leave requests (filtered by status, type, date, or department).
   - Review pending requests: Approve (`status = 'Approved'`) or Reject (`status = 'Rejected'`).
   - Automated recording of `reviewed_by = auth.uid()` and `reviewed_at = NOW()`.
   - Automatic Phase 6 notification delivery to applicant upon review.
3. **Attendance Cross-Referencing**:
   - Real-time display of who is on approved leave today and upcoming approved leave.

---

## 9. Missing Functionality (Unsupported by Current DB)

1. **Leave Balances**:
   - **Leave balances are not currently supported by the existing schema.**
   - No allowance quotas, sick leave tracking, or annual leave balances exist.
2. **Rejection Reason**:
   - `leave_requests` lacks a `rejection_reason` or `admin_comment` column. Rejections cannot persist a written explanation in the database.
3. **Cancellation Workflow**:
   - `leave_status_type` lacks a `'Cancelled'` enum value.
   - `leave_requests` has no DELETE policy. Users cannot cancel or delete a submitted request.
4. **Draft Requests**:
   - No `'Draft'` status exists. Requests are immediately `'Pending'` upon insertion.
5. **Overlapping Leave Prevention**:
   - Database has no unique or exclusion constraint preventing multiple requests across identical dates.
6. **Company Holidays / Weekend Deduction**:
   - No holiday schedule exists. Date ranges calculate as raw calendar days (`end_date - start_date + 1`).
7. **Departmental Manager Routing**:
   - No reporting manager hierarchy exists in `profiles`. Approvals are handled company-wide by any user with `leave.manage` (Admin) or `Super Admin`.

---

## 10. Proposed Phase 7 Scope

To deliver an honest, production-grade module without inventing unsupported features:

### In-Scope:
1. **Leave Service (`src/services/leaveService.ts`)**:
   - Typed queries for fetching own leave, pending approval queue, historical records, and today's on-leave roster.
   - Secure submission and approval/rejection operations.
2. **Employee & Intern Experience (`/app/leave`)**:
   - "My Leave" dashboard.
   - Leave application modal/form with date validation (`end_date >= start_date >= today`).
   - Leave history list with status badges (`Pending` in amber, `Approved` in emerald, `Rejected` in rose).
3. **Admin & Super Admin Experience (`/app/leave` or `/app/admin/leave`)**:
   - Unified operational view:
     - Pending Requests Queue (with 1-click Approve / Reject).
     - Today's On-Leave Overview.
     - Upcoming Approved Leave.
     - Company Leave History with search & filters (status, leave type, department, date range).
4. **Sidebar Navigation Update**:
   - Enable `Leave` in `Sidebar.tsx` for `['Super Admin', 'Admin', 'Employee', 'Intern']`.
5. **Route Registration in `App.tsx`**:
   - Register `/app/leave` under `AppLayout`.
6. **Security & Tampering Fix**:
   - Secure RLS enforcement via Migration 022 (or frontend validation + backend function).

---

## 11. Employee / Intern UX

- **Page**: `/app/leave`
- **Header**: "My Leave & Time Off"
- **Quick Action**: `[ Apply for Leave ]` button.
- **Summary Cards**:
  - Total Requests Submitted
  - Pending Review
  - Approved Leave Days (YTD calendar days)
  *(Notice: Explicitly avoids displaying fake balances; only displays real historical request totals).*
- **Application Form**:
  - Leave Type (`Leave`, `Permission`, `Work From Home`)
  - Start Date (HTML5 date input, minimum = today)
  - End Date (HTML5 date input, minimum = start date)
  - Reason (Required text area)
  - Summary preview: calculated calendar days.
- **Requests Table / Tabs**:
  - `Active Requests` (Pending review)
  - `Past History` (Approved / Rejected)

---

## 12. Admin UX

- **Tab 1: Action Required (`Pending`)**:
  - Table of pending requests across the organization.
  - Columns: Employee Name, Department, Type, Date Range, Total Days, Reason, Submitted At, Actions.
  - Actions: `[ Approve ]` (emerald button), `[ Reject ]` (rose button).
- **Tab 2: Today's On-Leave Users**:
  - Instant roster of users currently on approved leave today (cross-referenced with `attendance_sessions`).
- **Tab 3: Upcoming Approved Leave**:
  - Schedule of upcoming leaves in the next 14/30 days.
- **Tab 4: All Records / Archive**:
  - Searchable by employee name, filterable by leave type, department, and status.

---

## 13. Super Admin UX

- Same operational capabilities as Admin, with complete company-wide oversight.
- Management intelligence indicators:
  - Total leaves approved this month.
  - Leave distribution by type (`Leave` vs `Permission` vs `Work From Home`).
- Access to raw audit logs once leave auditing is connected.

---

## 14. Security Model

### 14.1 Role Hierarchy
- **Employee / Intern**:
  - Can only SELECT rows where `user_id = auth.uid()`.
  - Can only INSERT rows where `user_id = auth.uid()`.
  - Must NOT be able to modify `status`, `reviewed_by`, or `reviewed_at`.
- **Admin**:
  - Can SELECT all rows (authorized via `leave.view`).
  - Can UPDATE rows to set `status`, `reviewed_by = auth.uid()`, `reviewed_at = NOW()` (authorized via `leave.manage`).
- **Super Admin**:
  - Full company-wide SELECT and UPDATE access.

### 14.2 Remediation of RLS Gap
Because the existing RLS policy allows `auth.uid() = user_id` for UPDATE, a client could patch `status = 'Approved'`.
Two options exist:
1. **Option A (Migration 022 — Recommended)**:
   Add a `BEFORE UPDATE` trigger on `public.leave_requests` preventing regular users from changing `status`, `reviewed_by`, or `reviewed_at`, or adjust RLS policy to require `leave.manage` for updating status.
2. **Option B (RPC Function without Migration)**:
   Keep client updates restricted, but this leaves the direct API vulnerable if an employee uses raw PostgREST. A migration is the only authoritative solution.

---

## 15. Privacy Model

- Leave reasons frequently include confidential medical, personal, or family details.
- **Privacy Rules**:
  1. Regular employees can **never** view another employee's leave reason or record.
  2. Public/Team calendars must only show: `"[Employee Name] — On Leave"`. Private reasons must **never** be rendered on team calendars or dashboards.
  3. Notifications must not leak full reason text in notification titles.
  4. Google Sheets (Phase 5A) must not automatically export personal leave reasons.

---

## 16. Attendance Integration

- Reuses existing [src/utils/workforceLogic.ts](file:///E:/scaro/src/utils/workforceLogic.ts).
- Approved leaves (`status = 'Approved' AND start_date <= today AND end_date >= today`) automatically tag users as `'On Leave'` in management correlation views.
- Eliminates false "Report Pending" flags for employees on approved leave.

---

## 17. Notification Integration

- Phase 6 trigger `handle_leave_request_notification` already handles:
  - `INSERT` -> notifies Admins (`leave_pending`).
  - `UPDATE` (status -> `Approved` / `Rejected`) -> notifies applicant (`leave_status`).
- Frontend service will simply update the database; PostgreSQL triggers automatically handle notifications.

---

## 18. Google Sheets Considerations

- **Current State**: Phase 5A synchronizes `daily_reports` only.
- **Leave Data**: Leave records are distinct from daily work reports.
- **Recommendation**: Do **NOT** sync leave requests to Google Sheets in Phase 7. Synchronizing personal leave notes introduces data privacy risks without an immediate operational requirement.

---

## 19. Migration Requirement

### Is Migration 022 genuinely required?
**Decision: RECOMMENDED / OPTIONAL depending on scope boundary.**

- **If strict database security is enforced (Highly Recommended)**:
  **Migration 022** is required to:
  1. Add column tampering trigger on `public.leave_requests` (preventing employees from self-approving leave).
  2. Add `'Cancelled'` to `public.leave_status_type` enum (allowing employees to cancel pending requests).
  3. Add `rejection_reason TEXT` column to `public.leave_requests` (allowing managers to provide feedback).
  4. Add `DELETE` policy on `leave_requests` for pending requests owned by `auth.uid()`.
- **If strictly zero migrations are permitted**:
  Phase 7 can be implemented using existing columns (`Pending`, `Approved`, `Rejected`), but:
  - Cancellation will not be stored as `'Cancelled'`.
  - Rejection reasons cannot be persisted in the database.
  - Client-side checks must guard against self-approval (though database RLS would remain vulnerable).

---

## 20. Testing Strategy

1. **Employee Tests**:
   - Submit leave application.
   - View own submitted requests.
   - Verify unable to view other employees' leave.
   - Verify cannot self-approve leave via direct API.
2. **Admin Tests**:
   - View pending queue.
   - Approve a pending request -> status transitions to `'Approved'`, `reviewed_by` populated, applicant receives notification.
   - Reject a pending request -> status transitions to `'Rejected'`.
3. **Attendance Regression**:
   - Verify approved leave excludes employee from "Reports Pending Today" in management overview.
4. **Notification Regression**:
   - Verify leave notifications trigger exactly once with zero frontend duplication.

---

## 21. Risks

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Self-Approval via API | High (Security) | Introduce Migration 022 trigger or strict RPC to lock status changes to managers only |
| Missing Rejection Reason | Medium (UX) | Clearly inform user that rejection reason is not persisted in database unless Migration 022 is deployed |
| Overlapping Requests | Low | Validate client-side during application submission |
| Fake Balances Confusion | Medium (Product) | Explicitly display historical totals rather than fabricated allowances |

---

## 22. Out of Scope / Future Phase

The following are strictly out of scope for Phase 7:
1. **Leave Quotas & Balance Accruals**: Annual allowance, sick leave balance, carry-forward calculations (requires a dedicated HR policy schema).
2. **Multi-tier Approval Chains**: Department manager -> HR Manager -> Director hierarchy.
3. **Company Holiday Calendar**: Statutory holidays, optional holidays, company shutdowns.
4. **Half-day / Hourly Permission Tracking**: Fractional day leave calculations.

---

## 23. Final Recommendation

1. **Approve Architecture Scope**: Implement the Leave & Basic HR Operations module for all roles (`Employee`, `Intern`, `Admin`, `Super Admin`) using truthful database queries.
2. **Approve Migration 022**: Deploy a targeted security migration to fix the RLS self-approval gap, add `rejection_reason`, and add `'Cancelled'` status.
3. **Preserve All Prior Phases**: Maintain zero changes to Phase 4 (Tracker), Phase 5A (Sheets), Phase 5B (Management Intelligence), and Phase 6 (Notifications).
