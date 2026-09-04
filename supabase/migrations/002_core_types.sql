-- Core ENUM types for SCARO ERP

-- Employment Status
CREATE TYPE public.employment_status_type AS ENUM ('Employee', 'Intern');

-- Task Status
CREATE TYPE public.task_status_type AS ENUM ('Todo', 'In Progress', 'Review', 'Needs Revision', 'Completed', 'On Hold', 'Cancelled');

-- Task Priority
CREATE TYPE public.task_priority_type AS ENUM ('Low', 'Medium', 'High', 'Urgent');

-- Attendance Status
CREATE TYPE public.attendance_status_type AS ENUM ('Present', 'Absent', 'Half Day');

-- Meeting Attendance Status
CREATE TYPE public.meeting_attendance_status_type AS ENUM ('Present', 'Late', 'Absent', 'Excused');

-- Leave Type
CREATE TYPE public.leave_type AS ENUM ('Leave', 'Permission', 'Work From Home');

-- Leave Status
CREATE TYPE public.leave_status_type AS ENUM ('Pending', 'Approved', 'Rejected');

-- Announcement Audience
CREATE TYPE public.announcement_audience_type AS ENUM ('Everyone', 'Employees', 'Interns', 'Department');