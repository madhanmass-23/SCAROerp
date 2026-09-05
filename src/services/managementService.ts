import { supabase } from '../lib/supabase';
import type {
  ManagementMetrics,
  AttendanceReportCorrelationItem,
  ReportedBlockerItem,
  ReportedRequirementItem,
  SyncHealthSummary,
  ManagementReportItem,
  ManagementReportTask,
  ReportFilterParams,
  PersonProjectContribution,
  PersonMeetingItem,
  PersonLeaveItem,
  WorkHistoryItem,
  OperationalAlert,
  TeamWorkloadMember,
  WorkActivityTrendPoint,
  WorkforceTrendsResult,
  PersonWorkIntelligence,
} from '../types/management';

/**
 * Shared Management Intelligence Data Service
 * Reads authoritative Supabase data using established RLS policies.
 */

export async function fetchManagementMetrics(): Promise<ManagementMetrics> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch active profiles and user_roles separately to avoid foreign-key schema cache assumptions
  const [
    { data: profilesData, error: profilesErr },
    { data: userRolesData, error: rolesErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, employment_status, is_active')
      .eq('is_active', true),
    supabase
      .from('user_roles')
      .select('user_id, roles ( name )'),
  ]);

  if (profilesErr) throw profilesErr;
  if (rolesErr) throw rolesErr;

  // Build user_id -> roles map strictly from database user_roles table
  const userRolesMap = new Map<string, string[]>();
  userRolesData?.forEach((ur: any) => {
    const roleName = Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles?.name;
    if (roleName) {
      const existing = userRolesMap.get(ur.user_id) || [];
      existing.push(roleName);
      userRolesMap.set(ur.user_id, existing);
    }
  });

  let totalEmployees = 0;
  let totalInterns = 0;
  let totalAdmins = 0;
  let totalSuperAdmins = 0;

  profilesData?.forEach((p: any) => {
    if (!p.is_active) return;
    const roles = userRolesMap.get(p.id) || [];
    if (roles.includes('Super Admin')) {
      totalSuperAdmins++;
    } else if (roles.includes('Admin')) {
      totalAdmins++;
    } else if (roles.includes('Intern')) {
      totalInterns++;
    } else if (roles.includes('Employee')) {
      totalEmployees++;
    }
  });

  const activeUsers = profilesData?.filter((p: any) => p.is_active)?.length || 0;

  // Execute independent count queries in parallel
  const [
    { count: activeProjectsCount, error: projErr },
    { count: activeTasksCount, error: taskErr },
    { data: todayAttendance, error: attErr },
    { data: todayReports, error: repErr },
    { count: reportedBlockersCount, error: blkErr },
    { data: todayApprovedLeaves },
  ] = await Promise.all([
    supabase.from('projects').select('*', { count: 'exact', head: true }).ilike('status', 'active'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).neq('status', 'Completed'),
    supabase.from('attendance_sessions').select('user_id').eq('session_date', today).not('clock_in_time', 'is', null),
    supabase.from('daily_reports').select('user_id, status').eq('report_date', today),
    supabase.from('daily_reports').select('*', { count: 'exact', head: true }).neq('blockers', '').not('blockers', 'is', null).eq('status', 'submitted'),
    supabase.from('leave_requests').select('user_id').eq('status', 'Approved').lte('start_date', today).gte('end_date', today),
  ]);

  if (projErr) throw projErr;
  if (taskErr) throw taskErr;
  if (attErr) throw attErr;
  if (repErr) throw repErr;
  if (blkErr) throw blkErr;

  // Unique checked-in users today (Set deduplicates multiple attendance sessions)
  const checkedInUserIds = new Set(todayAttendance?.map((a: any) => a.user_id) || []);
  const submittedUserIds = new Set(todayReports?.filter((r: any) => r.status === 'submitted').map((r: any) => r.user_id) || []);
  const approvedLeaveUserIds = new Set(todayApprovedLeaves?.map((l: any) => l.user_id) || []);

  let checkedInTargetCount = 0;
  let reportsSubmittedToday = 0;
  let reportsPendingToday = 0;

  profilesData?.forEach((p: any) => {
    if (!p.is_active) return;
    const roles = userRolesMap.get(p.id) || [];
    const isEmp = roles.includes('Employee') && !roles.includes('Admin') && !roles.includes('Super Admin');
    const isInt = roles.includes('Intern') && !roles.includes('Admin') && !roles.includes('Super Admin');

    // Exclude Admin and Super Admin from Employee/Intern target population
    if (!isEmp && !isInt) return;

    const isPresent = checkedInUserIds.has(p.id);
    const isSubmitted = submittedUserIds.has(p.id);
    const isApprovedLeave = approvedLeaveUserIds.has(p.id);

    if (isPresent) checkedInTargetCount++;
    if (isSubmitted) reportsSubmittedToday++;

    const { isPending } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);
    if (isPending) {
      reportsPendingToday++;
    }
  });

  return {
    totalEmployees,
    totalInterns,
    totalAdmins,
    totalSuperAdmins,
    activeUsers,
    checkedInToday: checkedInTargetCount,
    reportsSubmittedToday,
    reportsPendingToday,
    reportedBlockersCount: reportedBlockersCount || 0,
    activeProjects: activeProjectsCount || 0,
    activeTasks: activeTasksCount || 0,
  };
}

export { evaluateWorkforceCorrelationStatus } from '../utils/workforceLogic';
import { evaluateWorkforceCorrelationStatus } from '../utils/workforceLogic';

export async function fetchAttendanceReportCorrelation(dateString?: string): Promise<AttendanceReportCorrelationItem[]> {
  const targetDate = dateString || new Date().toISOString().split('T')[0];

  // 1. Fetch active profiles, user roles, sessions, reports, and approved leaves
  const [
    { data: profiles, error: pErr },
    { data: userRolesData, error: rolesErr },
    { data: sessions, error: sErr },
    { data: reports, error: rErr },
    { data: approvedLeaves },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        avatar_url,
        employment_status,
        is_active,
        departments!profiles_department_id_fkey ( name )
      `)
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('user_roles')
      .select('user_id, roles ( name )'),
    supabase
      .from('attendance_sessions')
      .select('*')
      .eq('session_date', targetDate),
    supabase
      .from('daily_reports')
      .select('id, user_id, status')
      .eq('report_date', targetDate),
    supabase
      .from('leave_requests')
      .select('user_id')
      .eq('status', 'Approved')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate),
  ]);

  if (pErr) throw pErr;
  if (rolesErr) throw rolesErr;
  if (sErr) throw sErr;
  if (rErr) throw rErr;

  const userRolesMap = new Map<string, string[]>();
  userRolesData?.forEach((ur: any) => {
    const roleName = ur.roles?.name;
    if (roleName) {
      const existing = userRolesMap.get(ur.user_id) || [];
      existing.push(roleName);
      userRolesMap.set(ur.user_id, existing);
    }
  });

  const sessionMap = new Map<string, any>();
  sessions?.forEach((s: any) => {
    if (!sessionMap.has(s.user_id)) {
      sessionMap.set(s.user_id, s);
    }
  });

  const reportMap = new Map<string, any>();
  reports?.forEach((r: any) => {
    reportMap.set(r.user_id, r);
  });

  const approvedLeaveUserIds = new Set(approvedLeaves?.map((l: any) => l.user_id) || []);

  const correlationList: AttendanceReportCorrelationItem[] = [];

  profiles?.forEach((p: any) => {
    const roles = userRolesMap.get(p.id) || [];
    const isSuperAdmin = roles.includes('Super Admin');
    const isAdmin = roles.includes('Admin');
    const isInt = roles.includes('Intern');
    const isEmp = roles.includes('Employee');

    // Only include operational workforce (Employees and Interns)
    if (isSuperAdmin || isAdmin || (!isInt && !isEmp)) return;

    const primaryRole = isInt ? 'Intern' : 'Employee';
    const session = sessionMap.get(p.id);
    const report = reportMap.get(p.id);

    const isPresent = !!(session && session.clock_in_time);
    const isSubmitted = report?.status === 'submitted';
    const isApprovedLeave = approvedLeaveUserIds.has(p.id);

    const { status } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);

    correlationList.push({
      userId: p.id,
      fullName: p.full_name,
      email: p.email,
      avatarUrl: p.avatar_url,
      role: primaryRole,
      departmentName: p.departments?.name || 'General',
      status,
      clockInTime: session?.clock_in_time || null,
      clockOutTime: session?.clock_out_time || null,
      reportId: report?.id || null,
      reportStatus: report?.status || null,
    });
  });

  return correlationList;
}

export async function fetchReportedBlockers(limit = 15): Promise<ReportedBlockerItem[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`
      id,
      report_date,
      user_id,
      blockers,
      submitted_at,
      profiles!daily_reports_user_id_fkey (
        full_name,
        employment_status,
        departments!profiles_department_id_fkey ( name )
      )
    `)
    .neq('blockers', '')
    .not('blockers', 'is', null)
    .eq('status', 'submitted')
    .order('report_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((item: any) => {
    const role = item.profiles?.employment_status || 'Team Member';
    return {
      reportId: item.id,
      reportDate: item.report_date,
      userId: item.user_id,
      userName: item.profiles?.full_name || 'Unknown',
      role,
      departmentName: item.profiles?.departments?.name || 'General',
      blockerText: item.blockers,
      submittedAt: item.submitted_at,
    };
  });
}

export async function fetchReportedRequirements(limit = 15): Promise<ReportedRequirementItem[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`
      id,
      report_date,
      user_id,
      company_requirements,
      submitted_at,
      profiles!daily_reports_user_id_fkey (
        full_name,
        employment_status,
        departments!profiles_department_id_fkey ( name )
      )
    `)
    .neq('company_requirements', '')
    .not('company_requirements', 'is', null)
    .eq('status', 'submitted')
    .order('report_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((item: any) => {
    const role = item.profiles?.employment_status || 'Team Member';
    return {
      reportId: item.id,
      reportDate: item.report_date,
      userId: item.user_id,
      userName: item.profiles?.full_name || 'Unknown',
      role,
      departmentName: item.profiles?.departments?.name || 'General',
      requirementText: item.company_requirements,
      submittedAt: item.submitted_at,
    };
  });
}

export async function fetchSyncHealth(): Promise<SyncHealthSummary> {
  const { data: syncRecords, error } = await supabase
    .from('daily_report_sync')
    .select(`
      report_id,
      status,
      attempt_count,
      last_attempt_at,
      error_message,
      daily_reports!inner (
        report_date,
        profiles!daily_reports_user_id_fkey (
          full_name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  let synced = 0;
  let pending = 0;
  let failed = 0;
  let permanentlyFailed = 0;
  const failedRecords: SyncHealthSummary['failedRecords'] = [];

  syncRecords?.forEach((r: any) => {
    if (r.status === 'synced') synced++;
    else if (r.status === 'pending' || r.status === 'processing') pending++;
    else if (r.status === 'failed') {
      failed++;
      failedRecords.push({
        reportId: r.report_id,
        reportDate: r.daily_reports?.report_date || '',
        userName: r.daily_reports?.profiles?.full_name || 'Unknown',
        attemptCount: r.attempt_count,
        lastAttemptAt: r.last_attempt_at,
        errorMessage: r.error_message,
      });
    } else if (r.status === 'permanently_failed') {
      permanentlyFailed++;
      failedRecords.push({
        reportId: r.report_id,
        reportDate: r.daily_reports?.report_date || '',
        userName: r.daily_reports?.profiles?.full_name || 'Unknown',
        attemptCount: r.attempt_count,
        lastAttemptAt: r.last_attempt_at,
        errorMessage: r.error_message,
      });
    }
  });

  return {
    synced,
    pending,
    failed,
    permanentlyFailed,
    failedRecords,
  };
}

export async function fetchManagementReports(params: ReportFilterParams): Promise<{
  reports: ManagementReportItem[];
  totalCount: number;
}> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabase
    .from('daily_reports')
    .select(`
      id,
      user_id,
      report_date,
      status,
      submitted_at,
      blockers,
      company_requirements,
      tomorrow_plan,
      notes,
      profiles!daily_reports_user_id_fkey (
        full_name,
        avatar_url,
        employment_status,
        departments!profiles_department_id_fkey ( name )
      ),
      daily_report_tasks (
        id,
        task_id,
        custom_task_title,
        time_spent_minutes,
        completion_percentage,
        task_status,
        tasks (
          title,
          projects ( name )
        )
      ),
      daily_report_sync (
        status,
        error_message
      )
    `, { count: 'exact' });

  // Date Filtering
  if (params.preset === 'today') {
    const today = new Date().toISOString().split('T')[0];
    query = query.eq('report_date', today);
  } else if (params.preset === 'this_week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    query = query.gte('report_date', startOfWeek.toISOString().split('T')[0]);
  } else if (params.preset === 'this_month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    query = query.gte('report_date', startOfMonth.toISOString().split('T')[0]);
  } else if (params.startDate && params.endDate) {
    query = query.gte('report_date', params.startDate).lte('report_date', params.endDate);
  } else if (params.startDate) {
    query = query.eq('report_date', params.startDate);
  }

  // Status Filter
  if (params.status) {
    query = query.eq('status', params.status);
  }

  // User Filter
  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }

  // Deterministic Ordering
  query = query
    .order('report_date', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  let reportItems: ManagementReportItem[] = (data || []).map((item: any) => {
    const role = item.profiles?.employment_status || 'Team Member';
    const tasks: ManagementReportTask[] = (item.daily_report_tasks || []).map((t: any) => ({
      id: t.id,
      taskId: t.task_id,
      taskTitle: t.tasks?.title || t.custom_task_title || 'General Task',
      projectName: t.tasks?.projects?.name || undefined,
      timeSpentMinutes: t.time_spent_minutes || 0,
      completionPercentage: t.completion_percentage || 0,
      taskStatus: t.task_status || 'In Progress',
    }));

    const totalTimeSpentMinutes = tasks.reduce((sum, t) => sum + t.timeSpentMinutes, 0);
    const avgCompletionPercentage = tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.completionPercentage, 0) / tasks.length)
      : 0;

    // Sync status from daily_report_sync relation
    const syncStatus = item.daily_report_sync?.status || null;
    const syncError = item.daily_report_sync?.error_message || null;

    return {
      id: item.id,
      userId: item.user_id,
      userName: item.profiles?.full_name || 'Unknown',
      avatarUrl: item.profiles?.avatar_url,
      role,
      departmentName: item.profiles?.departments?.name || 'General',
      reportDate: item.report_date,
      status: item.status,
      submittedAt: item.submitted_at,
      blockers: item.blockers,
      companyRequirements: item.company_requirements,
      tomorrowPlan: item.tomorrow_plan,
      notes: item.notes,
      taskCount: tasks.length,
      avgCompletionPercentage,
      totalTimeSpentMinutes,
      syncStatus,
      syncError,
      tasks,
    };
  });

  // Client-side filtering on joined properties if specified
  if (params.role) {
    reportItems = reportItems.filter(r => r.role.toLowerCase() === params.role!.toLowerCase());
  }
  if (params.syncStatus) {
    reportItems = reportItems.filter(r => r.syncStatus === params.syncStatus);
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    reportItems = reportItems.filter(r =>
      r.userName.toLowerCase().includes(q) ||
      (r.blockers && r.blockers.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }

  return {
    reports: reportItems,
    totalCount: count || 0,
  };
}

export async function fetchPersonWorkProfile(userId: string) {
  const [
    { data: profile, error: profErr },
    { data: userRolesData, error: rolesErr },
    { data: reports, error: repErr },
    { data: attendance, error: attErr },
    { data: assignedTasks, error: taskErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        *,
        departments!profiles_department_id_fkey ( name )
      `)
      .eq('id', userId)
      .single(),
    supabase
      .from('user_roles')
      .select('roles ( name )')
      .eq('user_id', userId),
    supabase
      .from('daily_reports')
      .select(`
        id,
        report_date,
        status,
        submitted_at,
        blockers,
        tomorrow_plan,
        notes,
        daily_report_tasks (
          id,
          custom_task_title,
          time_spent_minutes,
          completion_percentage,
          task_status,
          tasks ( title )
        )
      `)
      .eq('user_id', userId)
      .order('report_date', { ascending: false })
      .limit(10),
    supabase
      .from('attendance_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: false })
      .limit(14),
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, progress, projects ( name )')
      .eq('assignee_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (profErr) throw profErr;
  if (rolesErr) throw rolesErr;
  if (repErr) throw repErr;
  if (attErr) throw attErr;
  if (taskErr) throw taskErr;

  const roles: string[] = userRolesData?.map((ur: any) => ur.roles?.name) || [];

  return {
    profile: {
      ...profile,
      role: roles[0] || profile.employment_status || 'Team Member',
      departmentName: profile.departments?.name || 'General',
    },
    recentReports: reports || [],
    recentAttendance: attendance || [],
    assignedTasks: assignedTasks || [],
  };
}

// ==========================================
// Phase 9 Workforce Intelligence Functions
// ==========================================

export async function fetchPersonWorkIntelligence(userId: string, timeRangeDays = 30): Promise<PersonWorkIntelligence> {
  const today = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - timeRangeDays * 86400000).toISOString().split('T')[0];

  const [
    { data: profile, error: profErr },
    { data: userRolesData, error: rolesErr },
    { data: allTasks, error: taskErr },
    { data: projectMemberships, error: pmErr },
    { data: reports, error: repErr },
    { data: attendance, error: attErr },
    { data: leaves, error: lErr },
    { data: meetingParts },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, designation, joining_date, employment_status, is_active, departments!profiles_department_id_fkey(name)')
      .eq('id', userId)
      .single(),
    supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', userId),
    supabase
      .from('tasks')
      .select('id, project_id, title, status, priority, progress, estimated_hours, due_date, projects(name, status)')
      .eq('assignee_id', userId)
      .order('due_date', { ascending: true }),
    supabase
      .from('project_members')
      .select('project_id, projects(id, name, status)')
      .eq('user_id', userId),
    supabase
      .from('daily_reports')
      .select(`
        id,
        report_date,
        status,
        submitted_at,
        tomorrow_plan,
        blockers,
        company_requirements,
        daily_report_tasks (
          id,
          task_id,
          custom_task_title,
          time_spent_minutes,
          completion_percentage,
          task_status,
          tasks ( title, projects ( name ) )
        )
      `)
      .eq('user_id', userId)
      .gte('report_date', startDate)
      .order('report_date', { ascending: false }),
    supabase
      .from('attendance_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('session_date', startDate)
      .order('session_date', { ascending: false }),
    supabase
      .from('leave_requests')
      .select('id, type, start_date, end_date, status')
      .eq('user_id', userId)
      .gte('end_date', startDate)
      .order('start_date', { ascending: false }),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, start_time, end_time, status, meeting_type')
      .eq('organizer_id', userId)
      .order('meeting_date', { ascending: false })
      .then((res) => res, () => ({ data: [], error: null })),
  ]);

  if (profErr) throw profErr;
  if (rolesErr) throw rolesErr;
  if (taskErr) throw taskErr;
  if (pmErr) throw pmErr;
  if (repErr) throw repErr;
  if (attErr) throw attErr;
  if (lErr) throw lErr;
  const meetingItems = (meetingParts as any)?.data || (Array.isArray(meetingParts) ? meetingParts : []);

  const rolesRaw: any = userRolesData?.[0]?.roles;
  const roleName = (Array.isArray(rolesRaw) ? rolesRaw[0]?.name : rolesRaw?.name) || (profile as any).employment_status || 'Team Member';

  // Workload calculations
  let activeTasksCount = 0;
  let inProgressCount = 0;
  let reviewCount = 0;
  let needsRevisionCount = 0;
  let onHoldCount = 0;
  let overdueCount = 0;
  let completedCount = 0;

  const activeTasksList: PersonWorkIntelligence['activeTasks'] = [];
  const projectTasksMap = new Map<string, { assigned: number; completed: number; open: number; overdue: number; name: string; status: string }>();

  (allTasks || []).forEach((t: any) => {
    const isCompleted = t.status === 'Completed';
    const isCancelled = t.status === 'Cancelled';
    const isOverdue = !isCompleted && !isCancelled && !!t.due_date && t.due_date < today;

    if (t.status === 'In Progress') inProgressCount++;
    else if (t.status === 'Review') reviewCount++;
    else if (t.status === 'Needs Revision') needsRevisionCount++;
    else if (t.status === 'On Hold') onHoldCount++;
    else if (t.status === 'Completed') completedCount++;

    if (!isCompleted && !isCancelled) {
      activeTasksCount++;
      activeTasksList.push({
        id: t.id,
        projectId: t.project_id,
        projectName: t.projects?.name || 'General',
        title: t.title,
        status: t.status,
        priority: t.priority,
        progress: t.progress || 0,
        dueDate: t.due_date,
        isOverdue,
        estimatedHours: Number(t.estimated_hours) || 0,
      });
    }

    if (isOverdue) overdueCount++;

    // Grouping by project
    const pId = t.project_id;
    const existing = projectTasksMap.get(pId) || {
      assigned: 0,
      completed: 0,
      open: 0,
      overdue: 0,
      name: t.projects?.name || 'Unknown Project',
      status: t.projects?.status || 'Active',
    };
    existing.assigned++;
    if (isCompleted) existing.completed++;
    else existing.open++;
    if (isOverdue) existing.overdue++;
    projectTasksMap.set(pId, existing);
  });

  // Project contributions
  const projectsList: PersonProjectContribution[] = [];
  const enrolledProjectIds = new Set<string>();

  (projectMemberships || []).forEach((pm: any) => {
    enrolledProjectIds.add(pm.project_id);
    const stats = projectTasksMap.get(pm.project_id);
    projectsList.push({
      projectId: pm.project_id,
      projectName: pm.projects?.name || stats?.name || 'Project',
      projectStatus: pm.projects?.status || stats?.status || 'Active',
      isEnrolledMember: true,
      assignedTasksCount: stats?.assigned || 0,
      completedTasksCount: stats?.completed || 0,
      openTasksCount: stats?.open || 0,
      overdueTasksCount: stats?.overdue || 0,
    });
  });

  // Add projects where user has tasks but isn't explicitly in project_members
  projectTasksMap.forEach((stats, pId) => {
    if (!enrolledProjectIds.has(pId)) {
      projectsList.push({
        projectId: pId,
        projectName: stats.name,
        projectStatus: stats.status,
        isEnrolledMember: false,
        assignedTasksCount: stats.assigned,
        completedTasksCount: stats.completed,
        openTasksCount: stats.open,
        overdueTasksCount: stats.overdue,
      });
    }
  });

  // Work History mapping
  const workHistory: WorkHistoryItem[] = [];
  const reportedBlockers: PersonWorkIntelligence['reportedBlockers'] = [];

  (reports || []).forEach((r: any) => {
    if (r.blockers && r.blockers.trim() !== '') {
      reportedBlockers.push({
        reportId: r.id,
        reportDate: r.report_date,
        blockerText: r.blockers,
      });
    }

    if (r.daily_report_tasks && r.daily_report_tasks.length > 0) {
      r.daily_report_tasks.forEach((drt: any) => {
        workHistory.push({
          id: drt.id,
          reportId: r.id,
          reportDate: r.report_date,
          projectName: drt.tasks?.projects?.name,
          taskTitle: drt.tasks?.title || drt.custom_task_title || 'General Activity',
          timeSpentMinutes: drt.time_spent_minutes || 0,
          completionPercentage: drt.completion_percentage || 0,
          taskStatus: drt.task_status,
          tomorrowPlan: r.tomorrow_plan,
          blockers: r.blockers,
          companyRequirements: r.company_requirements,
        });
      });
    } else {
      workHistory.push({
        id: r.id,
        reportId: r.id,
        reportDate: r.report_date,
        taskTitle: 'Daily Log Entry',
        timeSpentMinutes: 0,
        completionPercentage: 100,
        taskStatus: r.status,
        tomorrowPlan: r.tomorrow_plan,
        blockers: r.blockers,
        companyRequirements: r.company_requirements,
      });
    }
  });

  // Meetings
  const meetingsList: PersonMeetingItem[] = (meetingItems || []).map((m: any) => ({
    id: m.id,
    title: m.title,
    meetingDate: m.meeting_date,
    startTime: m.start_time,
    endTime: m.end_time,
    status: m.status || 'Scheduled',
    meetingType: m.meeting_type,
  }));

  // Leaves (Confidential reason is omitted for employee privacy!)
  const leavesList: PersonLeaveItem[] = (leaves || []).map((l: any) => {
    const s = new Date(l.start_date);
    const e = new Date(l.end_date);
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    return {
      id: l.id,
      type: l.type,
      startDate: l.start_date,
      endDate: l.end_date,
      status: l.status,
      daysCount: days,
    };
  });

  // Operational Alerts
  const alerts: OperationalAlert[] = [];
  if (overdueCount > 0) {
    alerts.push({
      id: `alert-overdue-${userId}`,
      type: 'overdue_task',
      severity: 'danger',
      title: `${overdueCount} Overdue Task${overdueCount > 1 ? 's' : ''}`,
      description: `Action required on assigned task deadlines past target date.`,
    });
  }

  const urgentTasksCount = activeTasksList.filter(t => t.priority === 'Urgent').length;
  if (urgentTasksCount >= 3) {
    alerts.push({
      id: `alert-urgent-${userId}`,
      type: 'urgent_backlog',
      severity: 'warning',
      title: `High Urgent Workload (${urgentTasksCount} Tasks)`,
      description: `Assigned multiple concurrent urgent priority tasks.`,
    });
  }

  if (reportedBlockers.length > 0) {
    alerts.push({
      id: `alert-blocker-${userId}`,
      type: 'active_blocker',
      severity: 'warning',
      title: `Reported Operational Blocker`,
      description: reportedBlockers[0].blockerText,
    });
  }

  const activeProjectsCount = projectsList.filter(p => p.projectStatus?.toLowerCase() === 'active').length;

  return {
    profile: {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      role: roleName,
      departmentName: (profile.departments as any)?.name || (Array.isArray(profile.departments) ? (profile.departments[0] as any)?.name : 'General') || 'General',
      designation: profile.designation,
      joiningDate: profile.joining_date,
      isActive: profile.is_active,
    },
    workload: {
      activeTasks: activeTasksCount,
      inProgressTasks: inProgressCount,
      reviewTasks: reviewCount,
      needsRevisionTasks: needsRevisionCount,
      onHoldTasks: onHoldCount,
      overdueTasks: overdueCount,
      completedTasks: completedCount,
      activeProjects: activeProjectsCount,
    },
    activeTasks: activeTasksList,
    projects: projectsList,
    recentReports: reports || [],
    workHistory,
    attendanceSessions: attendance || [],
    leaves: leavesList,
    meetings: meetingsList,
    reportedBlockers,
    alerts,
  };
}

export async function fetchTeamWorkloadIntelligence(): Promise<TeamWorkloadMember[]> {
  const today = new Date().toISOString().split('T')[0];

  const [
    { data: profiles, error: pErr },
    { data: userRolesData, error: rolesErr },
    { data: allTasks, error: tErr },
    { data: todayAttendance, error: attErr },
    { data: todayReports, error: repErr },
    { data: todayLeaves, error: lErr },
    { data: projectMembers, error: pmErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, designation, employment_status, is_active, departments!profiles_department_id_fkey(name)')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('user_roles')
      .select('user_id, roles(name)'),
    supabase
      .from('tasks')
      .select('id, assignee_id, status, due_date, project_id, projects(status)'),
    supabase
      .from('attendance_sessions')
      .select('user_id, clock_in_time')
      .eq('session_date', today),
    supabase
      .from('daily_reports')
      .select('id, user_id, status, blockers')
      .eq('report_date', today),
    supabase
      .from('leave_requests')
      .select('user_id')
      .eq('status', 'Approved')
      .lte('start_date', today)
      .gte('end_date', today),
    supabase
      .from('project_members')
      .select('user_id, project_id, projects(status)'),
  ]);

  if (pErr) throw pErr;
  if (rolesErr) throw rolesErr;
  if (tErr) throw tErr;
  if (attErr) throw attErr;
  if (repErr) throw repErr;
  if (lErr) throw lErr;
  if (pmErr) throw pmErr;

  const userRolesMap = new Map<string, string[]>();
  (userRolesData || []).forEach((ur: any) => {
    const roleName = ur.roles?.name;
    if (roleName) {
      const list = userRolesMap.get(ur.user_id) || [];
      list.push(roleName);
      userRolesMap.set(ur.user_id, list);
    }
  });

  const checkedInUserIds = new Set((todayAttendance || []).filter((a: any) => !!a.clock_in_time).map((a: any) => a.user_id));
  const submittedReportMap = new Map<string, any>();
  (todayReports || []).forEach((r: any) => {
    if (r.status === 'submitted') {
      submittedReportMap.set(r.user_id, r);
    }
  });
  const approvedLeaveUserIds = new Set((todayLeaves || []).map((l: any) => l.user_id));

  // User task stats map
  const taskStatsMap = new Map<string, {
    active: number;
    inProgress: number;
    review: number;
    onHold: number;
    overdue: number;
    completed: number;
    activeProjects: Set<string>;
  }>();

  (allTasks || []).forEach((t: any) => {
    if (!t.assignee_id) return;
    const stats = taskStatsMap.get(t.assignee_id) || {
      active: 0,
      inProgress: 0,
      review: 0,
      onHold: 0,
      overdue: 0,
      completed: 0,
      activeProjects: new Set<string>(),
    };

    const isCompleted = t.status === 'Completed';
    const isCancelled = t.status === 'Cancelled';
    const isOverdue = !isCompleted && !isCancelled && !!t.due_date && t.due_date < today;

    if (!isCompleted && !isCancelled) stats.active++;
    if (t.status === 'In Progress') stats.inProgress++;
    else if (t.status === 'Review') stats.review++;
    else if (t.status === 'On Hold') stats.onHold++;
    else if (isCompleted) stats.completed++;

    if (isOverdue) stats.overdue++;

    if (t.projects?.status?.toLowerCase() === 'active') {
      stats.activeProjects.add(t.project_id);
    }

    taskStatsMap.set(t.assignee_id, stats);
  });

  // Project members enrollment
  (projectMembers || []).forEach((pm: any) => {
    if (pm.projects?.status?.toLowerCase() === 'active') {
      const stats = taskStatsMap.get(pm.user_id) || {
        active: 0,
        inProgress: 0,
        review: 0,
        onHold: 0,
        overdue: 0,
        completed: 0,
        activeProjects: new Set<string>(),
      };
      stats.activeProjects.add(pm.project_id);
      taskStatsMap.set(pm.user_id, stats);
    }
  });

  const result: TeamWorkloadMember[] = [];

  (profiles || []).forEach((p: any) => {
    const roles = userRolesMap.get(p.id) || [];
    const isSuperAdmin = roles.includes('Super Admin');
    const isAdmin = roles.includes('Admin');
    const isInt = roles.includes('Intern');
    const isEmp = roles.includes('Employee');

    // Only include operational workforce (Employees and Interns) in the team workload view
    if (isSuperAdmin || isAdmin || (!isInt && !isEmp)) return;

    const primaryRole = isInt ? 'Intern' : 'Employee';
    const isPresent = checkedInUserIds.has(p.id);
    const isSubmitted = submittedReportMap.has(p.id);
    const isApprovedLeave = approvedLeaveUserIds.has(p.id);

    const { status, isPending } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);
    const taskStats = taskStatsMap.get(p.id) || {
      active: 0,
      inProgress: 0,
      review: 0,
      onHold: 0,
      overdue: 0,
      completed: 0,
      activeProjects: new Set<string>(),
    };

    const report = submittedReportMap.get(p.id);
    const hasBlocker = !!(report && report.blockers && report.blockers.trim() !== '');

    result.push({
      userId: p.id,
      fullName: p.full_name,
      email: p.email,
      avatarUrl: p.avatar_url,
      role: primaryRole,
      departmentName: (p.departments as any)?.name || (Array.isArray(p.departments) ? (p.departments[0] as any)?.name : 'General') || 'General',
      designation: p.designation,
      todayStatus: status,
      activeTasksCount: taskStats.active,
      inProgressCount: taskStats.inProgress,
      reviewCount: taskStats.review,
      onHoldCount: taskStats.onHold,
      overdueCount: taskStats.overdue,
      completedCount: taskStats.completed,
      activeProjectsCount: taskStats.activeProjects.size,
      hasPendingReportToday: isPending,
      hasReportedBlockerToday: hasBlocker,
    });
  });

  return result;
}

export async function fetchWorkforceTrends(
  options: number | { startDate: string; endDate: string } = 14
): Promise<WorkforceTrendsResult> {
  const getLocalDate = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  let startDate: string;
  let endDate: string;

  if (typeof options === 'object' && options.startDate && options.endDate) {
    startDate = options.startDate;
    endDate = options.endDate;
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }
  } else {
    const days = typeof options === 'number' ? options : 14;
    const now = new Date();
    endDate = getLocalDate(now);
    const startObj = new Date(now.getTime() - (days - 1) * 86400000);
    startDate = getLocalDate(startObj);
  }

  const dates: string[] = [];
  const curr = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (curr <= end) {
    dates.push(getLocalDate(curr));
    curr.setDate(curr.getDate() + 1);
  }

  const [
    { data: reports },
    { data: attendance },
    { data: allTasks },
  ] = await Promise.all([
    supabase
      .from('daily_reports')
      .select('report_date, status')
      .eq('status', 'submitted')
      .gte('report_date', startDate)
      .lte('report_date', endDate),
    supabase
      .from('attendance_sessions')
      .select('session_date, clock_in_time')
      .not('clock_in_time', 'is', null)
      .gte('session_date', startDate)
      .lte('session_date', endDate),
    supabase
      .from('tasks')
      .select('id, status, created_at, updated_at'),
  ]);

  const reportMap = new Map<string, number>();
  (reports || []).forEach((r: any) => {
    reportMap.set(r.report_date, (reportMap.get(r.report_date) || 0) + 1);
  });

  const attendanceMap = new Map<string, number>();
  (attendance || []).forEach((a: any) => {
    attendanceMap.set(a.session_date, (attendanceMap.get(a.session_date) || 0) + 1);
  });

  const taskMap = new Map<string, number>();
  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;

  (allTasks || []).forEach((t: any) => {
    const isCompleted = t.status === 'Completed';
    const isInProgress = t.status === 'In Progress';
    const isPending = t.status === 'Todo' || t.status === 'Review' || t.status === 'Needs Revision' || t.status === 'On Hold';

    if (isCompleted) {
      completedCount++;
      const updatedDate = t.updated_at ? t.updated_at.split('T')[0] : '';
      if (updatedDate >= startDate && updatedDate <= endDate) {
        taskMap.set(updatedDate, (taskMap.get(updatedDate) || 0) + 1);
      }
    } else if (isInProgress) {
      inProgressCount++;
    } else if (isPending) {
      pendingCount++;
    }
  });

  const totalTasks = completedCount + inProgressCount + pendingCount;
  const totalReports = (reports || []).length;
  const totalAttendance = (attendance || []).length;
  const totalTasksCompletedInRange = Array.from(taskMap.values()).reduce((sum, n) => sum + n, 0);

  const timeline: WorkActivityTrendPoint[] = dates.map((d) => ({
    date: d,
    reportsSubmitted: reportMap.get(d) || 0,
    attendanceCheckins: attendanceMap.get(d) || 0,
    tasksCompleted: taskMap.get(d) || 0,
  }));

  return {
    timeline,
    taskDistribution: {
      completed: completedCount,
      inProgress: inProgressCount,
      pending: pendingCount,
      total: totalTasks,
    },
    totalReports,
    totalTasksCompleted: totalTasksCompletedInRange,
    totalAttendance,
  };
}
