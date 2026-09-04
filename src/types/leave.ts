export type LeaveType = 'Leave' | 'Permission' | 'Work From Home';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: string;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  applicant?: {
    id: string;
    full_name: string;
    email: string;
    employment_status: string | null;
    department_id: string | null;
    department_name?: string | null;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface LeaveFilterParams {
  status?: LeaveStatus | 'All';
  type?: LeaveType | 'All';
  departmentId?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  overlappingRequests: LeaveRequest[];
}
