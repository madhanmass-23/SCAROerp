export interface ManagementMetrics {
  totalEmployees: number;
  totalInterns: number;
  activeUsers: number;
  checkedInToday: number;
  reportsSubmittedToday: number;
  reportsPendingToday: number;
  reportedBlockersCount: number;
  activeProjects: number;
  activeTasks: number;
}

export type CorrelationStatus =
  | 'Present & Submitted'
  | 'Present & Report Pending'
  | 'Absent / Not Checked In';

export interface AttendanceReportCorrelationItem {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  departmentName?: string;
  status: CorrelationStatus;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  reportId?: string | null;
  reportStatus?: string | null;
}

export interface ReportedBlockerItem {
  reportId: string;
  reportDate: string;
  userId: string;
  userName: string;
  role: string;
  departmentName?: string;
  blockerText: string;
  submittedAt?: string | null;
}

export interface ReportedRequirementItem {
  reportId: string;
  reportDate: string;
  userId: string;
  userName: string;
  role: string;
  departmentName?: string;
  requirementText: string;
  submittedAt?: string | null;
}

export interface FailedSyncRecord {
  reportId: string;
  reportDate: string;
  userName: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
}

export interface SyncHealthSummary {
  synced: number;
  pending: number;
  failed: number;
  permanentlyFailed: number;
  failedRecords: FailedSyncRecord[];
}

export interface ManagementReportTask {
  id: string;
  taskId: string | null;
  taskTitle: string;
  projectName?: string;
  timeSpentMinutes: number;
  completionPercentage: number;
  taskStatus: string;
}

export interface ManagementReportItem {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  role: string;
  departmentName?: string;
  reportDate: string;
  status: string;
  submittedAt?: string | null;
  blockers?: string | null;
  companyRequirements?: string | null;
  tomorrowPlan?: string | null;
  notes?: string | null;
  taskCount: number;
  avgCompletionPercentage: number;
  totalTimeSpentMinutes: number;
  syncStatus?: 'synced' | 'pending' | 'failed' | 'permanently_failed' | null;
  syncError?: string | null;
  tasks?: ManagementReportTask[];
}

export interface ReportFilterParams {
  preset?: 'today' | 'this_week' | 'this_month' | 'custom' | '';
  startDate?: string;
  endDate?: string;
  role?: string;
  departmentId?: string;
  userId?: string;
  projectId?: string;
  status?: string;
  syncStatus?: string;
  search?: string;
  page: number;
  pageSize: number;
}

// ==========================================
// Phase 9 Workforce Work Intelligence Types
// ==========================================

export interface WorkloadSummary {
  activeTasks: number;
  inProgressTasks: number;
  reviewTasks: number;
  needsRevisionTasks: number;
  onHoldTasks: number;
  overdueTasks: number;
  completedTasks: number;
  activeProjects: number;
}

export interface PersonProjectContribution {
  projectId: string;
  projectName: string;
  projectStatus: string;
  isEnrolledMember: boolean;
  assignedTasksCount: number;
  completedTasksCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
}

export interface PersonMeetingItem {
  id: string;
  title: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingType?: string;
}

export interface PersonLeaveItem {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  daysCount: number;
  // NOTE: 'reason' is intentionally excluded to preserve employee privacy
}

export interface WorkHistoryItem {
  id: string;
  reportId: string;
  reportDate: string;
  projectName?: string;
  taskTitle: string;
  timeSpentMinutes: number;
  completionPercentage: number;
  taskStatus?: string;
  tomorrowPlan?: string;
  blockers?: string;
  companyRequirements?: string;
  hasEvidence?: boolean;
}

export interface OperationalAlert {
  id: string;
  type: 'overdue_task' | 'urgent_backlog' | 'report_pending' | 'active_blocker';
  severity: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
  targetId?: string;
  targetType?: 'task' | 'report' | 'user';
}

export interface TeamWorkloadMember {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  departmentName?: string;
  designation?: string;
  todayStatus: CorrelationStatus;
  activeTasksCount: number;
  inProgressCount: number;
  reviewCount: number;
  onHoldCount: number;
  overdueCount: number;
  completedCount: number;
  activeProjectsCount: number;
  hasPendingReportToday: boolean;
  hasReportedBlockerToday: boolean;
}

export interface WorkActivityTrendPoint {
  date: string;
  reportsSubmitted: number;
  tasksCompleted: number;
  attendanceCheckins: number;
}

export interface PersonWorkIntelligence {
  profile: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
    role: string;
    departmentName: string;
    designation?: string;
    joiningDate?: string;
    isActive: boolean;
  };
  workload: WorkloadSummary;
  activeTasks: Array<{
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    status: string;
    priority: string;
    progress: number;
    dueDate: string | null;
    isOverdue: boolean;
    estimatedHours: number;
  }>;
  projects: PersonProjectContribution[];
  recentReports: any[];
  workHistory: WorkHistoryItem[];
  attendanceSessions: any[];
  leaves: PersonLeaveItem[];
  meetings: PersonMeetingItem[];
  reportedBlockers: Array<{
    reportId: string;
    reportDate: string;
    blockerText: string;
  }>;
  alerts: OperationalAlert[];
}
