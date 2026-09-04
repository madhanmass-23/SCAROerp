import type { AttendanceReportCorrelationItem } from '../types/management';

/**
 * Shared workforce correlation and report status evaluator.
 * Determines correlation status and whether a user has a report pending today.
 *
 * Rule: Only active Employees/Interns who checked in today (and are not on approved leave)
 * and have not submitted a report count as 'Present & Report Pending' (pending +1).
 * Absent/not checked-in users are 'Absent / Not Checked In' and NOT counted as pending.
 */
export function evaluateWorkforceCorrelationStatus(
  isPresent: boolean,
  isSubmitted: boolean,
  isApprovedLeave: boolean = false
): {
  status: AttendanceReportCorrelationItem['status'];
  isPending: boolean;
} {
  if (isPresent) {
    if (isSubmitted) {
      return { status: 'Present & Submitted', isPending: false };
    }
    if (isApprovedLeave) {
      // User is on approved leave today; not expected to submit a report
      return { status: 'Present & Submitted', isPending: false };
    }
    return { status: 'Present & Report Pending', isPending: true };
  }

  // Not checked in today -> Absent / Not Checked In (NOT pending)
  return { status: 'Absent / Not Checked In', isPending: false };
}
