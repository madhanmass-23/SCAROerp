import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  CheckSquare
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { extractTodayPlan, extractWorkDone } from '../../utils/dailyReport';

export interface WorkedTaskItem {
  id: string;
  title: string;
  projectName?: string;
  status: string;
  progress: number;
  notes?: string;
}

export interface WorkTimeRecord {
  id: string;
  user_id: string;
  session_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  status: string;
  user?: {
    full_name: string;
    role?: string;
  };
  work_completed?: string;
  today_plan?: string | null;
  tomorrow_plan?: string | null;
  pending_work?: string | null;
  blockers?: string | null;
  company_requirements?: string | null;
  completion_rate?: number;
  tasks_worked?: WorkedTaskItem[];
}

export const AttendancePage: React.FC = () => {
  const { user, role } = useAuth();

  const isSupervisor = role === 'Super Admin' || role === 'Admin';
  const today = new Date().toISOString().split('T')[0];

  // Employee / Intern State
  const [todayRecord, setTodayRecord] = useState<WorkTimeRecord | null>(null);
  const [myHistory, setMyHistory] = useState<WorkTimeRecord[]>([]);
  const [currentDuration, setCurrentDuration] = useState<string>('--:--');

  // Supervisor Management Sheet State
  const [teamRecords, setTeamRecords] = useState<WorkTimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for Supervisor
  const [periodFilter, setPeriodFilter] = useState<'today' | 'specific_date' | 'this_month' | 'prev_month' | 'all'>('today');
  const [specificDate, setSpecificDate] = useState<string>(today);
  const [roleFilter, setRoleFilter] = useState<'all' | 'Employee' | 'Intern'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected Record Modal for viewing full management details
  const [selectedRecord, setSelectedRecord] = useState<WorkTimeRecord | null>(null);

  // Helper: Calculate formatted duration
  const calculateDuration = (startTime: string | null, endTime: string | null): string => {
    if (!startTime) return '--:--';
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const diffMinutes = Math.max(0, Math.floor((end - start) / 60000));
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  // Helper: Derive Session Status
  const getSessionStatus = (record: WorkTimeRecord): string => {
    if (record.clock_out_time) {
      return 'Completed';
    }
    if (record.clock_in_time) {
      if (record.session_date === today) {
        return 'Present'; // User-facing 'Working'
      }
      return 'Needs Revision'; // Incomplete / No Sign Out
    }
    return 'Absent';
  };

  // Employee/Intern: Ensure today's work session exists & fetch history
  const ensureActiveSessionAndFetch = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Check if session exists for today
      const { data: existingSession, error: checkErr } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('session_date', today)
        .maybeSingle();

      if (checkErr) throw checkErr;

      let currentTodaySession = existingSession;

      // Auto-start workday session if none exists
      if (!currentTodaySession) {
        const { data: newSession, error: createErr } = await supabase
          .from('attendance_sessions')
          .insert({
            user_id: user.id,
            session_date: today,
            clock_in_time: new Date().toISOString(),
            status: 'Present'
          })
          .select()
          .single();

        if (!createErr && newSession) {
          currentTodaySession = newSession;
        }
      }

      setTodayRecord(currentTodaySession || null);

      // 2. Fetch user's own history
      const { data: historySessions, error: histErr } = await supabase
        .from('attendance_sessions')
        .select('id, user_id, session_date, clock_in_time, clock_out_time, status')
        .eq('user_id', user.id)
        .order('session_date', { ascending: false })
        .limit(30);

      if (histErr) throw histErr;

      // Correlate with daily reports for work completed summary
      const { data: myReports } = await supabase
        .from('daily_reports')
        .select('report_date, notes, tomorrow_plan, blockers')
        .eq('user_id', user.id);

      const reportMap = new Map<string, { workDone: string; tomorrow: string; blockers: string }>();
      myReports?.forEach(r => {
        reportMap.set(r.report_date, {
          workDone: extractWorkDone(r.notes),
          tomorrow: r.tomorrow_plan || '',
          blockers: r.blockers || ''
        });
      });

      const enrichedHistory: WorkTimeRecord[] = (historySessions || []).map(s => {
        const rep = reportMap.get(s.session_date);
        return {
          ...s,
          work_completed: rep?.workDone || '',
          tomorrow_plan: rep?.tomorrow || '',
          pending_work: rep?.blockers || ''
        };
      });

      setMyHistory(enrichedHistory);

    } catch (err: any) {
      console.error('Error in work session sync:', err);
      setError(err.message || 'Failed to load work time data');
    } finally {
      setLoading(false);
    }
  };

  // Supervisor: Fetch all team records with filters
  const fetchSupervisorRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Determine date filter range
      let dateFrom = '';
      let dateTo = '';
      const now = new Date();

      if (periodFilter === 'today') {
        dateFrom = today;
        dateTo = today;
      } else if (periodFilter === 'specific_date') {
        dateFrom = specificDate;
        dateTo = specificDate;
      } else if (periodFilter === 'this_month') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        dateFrom = `${year}-${month}-01`;
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
        dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      } else if (periodFilter === 'prev_month') {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = prevMonthDate.getFullYear();
        const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
        dateFrom = `${year}-${month}-01`;
        const lastDay = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();
        dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      }

      // 2. Fetch Sessions
      let query = supabase
        .from('attendance_sessions')
        .select(`
          id, user_id, session_date, clock_in_time, clock_out_time, status,
          user:profiles ( id, full_name, employment_status )
        `)
        .order('session_date', { ascending: false })
        .order('clock_in_time', { ascending: false });

      if (dateFrom && dateTo) {
        query = query.gte('session_date', dateFrom).lte('session_date', dateTo);
      }

      const { data: sessions, error: sessErr } = await query;
      if (sessErr) throw sessErr;

      // 3. Fetch user roles map
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('user_id, roles(name)');

      const userRoleMap = new Map<string, string>();
      userRolesData?.forEach((ur: any) => {
        userRoleMap.set(ur.user_id, ur.roles?.name || 'Employee');
      });

      // 4. Fetch daily reports & report tasks in the date range
      let repQuery = supabase
        .from('daily_reports')
        .select(`
          id, user_id, report_date, notes, tomorrow_plan, blockers, company_requirements,
          daily_report_tasks (
            id, task_id, completion_percentage, task_status, custom_task_title,
            tasks ( id, title, progress, status, project:projects(name) )
          )
        `);

      if (dateFrom && dateTo) {
        repQuery = repQuery.gte('report_date', dateFrom).lte('report_date', dateTo);
      }
      const { data: reportsData } = await repQuery;

      const reportDetailMap = new Map<string, any>();
      reportsData?.forEach((r: any) => {
        reportDetailMap.set(`${r.user_id}_${r.report_date}`, r);
      });

      // 5. Combine and structure records
      const formatted: WorkTimeRecord[] = (sessions || []).map((s: any) => {
        const uRole = userRoleMap.get(s.user_id) || s.user?.employment_status || 'Employee';
        const rep = reportDetailMap.get(`${s.user_id}_${s.session_date}`);
        const workDone = rep ? extractWorkDone(rep.notes) : '';
        const todayPlan = rep ? extractTodayPlan(rep.notes) : null;
        
        // Extract worked tasks
        const tasksList: WorkedTaskItem[] = (rep?.daily_report_tasks || []).map((rt: any) => ({
          id: rt.task_id || rt.id,
          title: rt.tasks?.title || rt.custom_task_title || 'General Task',
          projectName: rt.tasks?.project?.name || 'Project',
          status: rt.task_status || rt.tasks?.status || 'Completed',
          progress: rt.completion_percentage ?? rt.tasks?.progress ?? 100
        }));

        const totalProgress = tasksList.reduce((acc, curr) => acc + curr.progress, 0);
        const completionRate = tasksList.length > 0 ? Math.round(totalProgress / tasksList.length) : (s.clock_out_time ? 100 : 0);

        return {
          id: s.id,
          user_id: s.user_id,
          session_date: s.session_date,
          clock_in_time: s.clock_in_time,
          clock_out_time: s.clock_out_time,
          status: s.status,
          user: {
            full_name: s.user?.full_name || 'Team Member',
            role: uRole
          },
          work_completed: workDone,
          today_plan: todayPlan,
          tomorrow_plan: rep?.tomorrow_plan || '',
          pending_work: rep?.blockers || '',
          blockers: rep?.blockers || '',
          company_requirements: rep?.company_requirements || '',
          completion_rate: completionRate,
          tasks_worked: tasksList
        };
      });

      // Filter by role if selected
      const filteredByRole = formatted.filter(r => {
        if (roleFilter === 'all') return true;
        return r.user?.role === roleFilter;
      });

      setTeamRecords(filteredByRole);
      setCurrentPage(1);

    } catch (err: any) {
      console.error('Error fetching team work time records:', err);
      setError(err.message || 'Failed to load team tracking sheet');
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    if (!user) return;

    if (!isSupervisor) {
      ensureActiveSessionAndFetch();
    } else {
      fetchSupervisorRecords();
    }
  }, [user, role, periodFilter, specificDate, roleFilter]);

  // Live Timer for Active Session
  useEffect(() => {
    if (isSupervisor || !todayRecord?.clock_in_time || todayRecord.clock_out_time) {
      if (todayRecord?.clock_in_time && todayRecord?.clock_out_time) {
        setCurrentDuration(calculateDuration(todayRecord.clock_in_time, todayRecord.clock_out_time));
      }
      return;
    }

    const updateTimer = () => {
      if (todayRecord?.clock_in_time) {
        setCurrentDuration(calculateDuration(todayRecord.clock_in_time, new Date().toISOString()));
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 60000);
    return () => clearInterval(timer);
  }, [todayRecord, isSupervisor]);



  // Filtered Supervisor Records (Search & Pagination)
  const filteredSupervisorRecords = useMemo(() => {
    let list = teamRecords;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        r.user?.full_name.toLowerCase().includes(q) ||
        r.user?.role?.toLowerCase().includes(q) ||
        r.work_completed?.toLowerCase().includes(q) ||
        r.pending_work?.toLowerCase().includes(q) ||
        r.tasks_worked?.some(t => t.title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [teamRecords, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSupervisorRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSupervisorRecords.slice(start, start + pageSize);
  }, [filteredSupervisorRecords, currentPage, pageSize]);

  if (loading && !todayRecord && teamRecords.length === 0) {
    return <LoadingState text="Loading work time tracking..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={isSupervisor ? fetchSupervisorRecords : ensureActiveSessionAndFetch} />;
  }

  const isCompletedToday = !!todayRecord?.clock_out_time;
  const isWorkingToday = !!todayRecord?.clock_in_time && !todayRecord?.clock_out_time;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Work Time Tracking"
        description={
          isSupervisor 
            ? "Company workforce sign-in, sign-out, work duration, and completed work tracking sheet" 
            : "Daily work session status, active duration, and work completion verification"
        }
        icon={<Clock className="h-6 w-6" />}
      />

      {/* ==================================================================== */}
      {/* 1. EMPLOYEE & INTERN WORK SESSION UI                                 */}
      {/* ==================================================================== */}
      {!isSupervisor && (
        <>
          {/* Active Work Session Card */}
          <Card className="border-primary/25 bg-gradient-to-r from-surface to-surface-muted shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="p-3.5 rounded-xl bg-primary/10 text-primary shrink-0 shadow-2xs">
                    <Clock className="h-7 w-7" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
                      Work Session
                    </span>
                    <div className="flex items-center gap-2.5 mt-0.5">
                      <h2 className="text-lg sm:text-xl font-bold text-content">
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                      </h2>
                      {isCompletedToday ? (
                        <StatusBadge status="Completed" size="sm" />
                      ) : isWorkingToday ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse" />
                          Working
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded bg-surface-muted text-content-muted border border-border">
                          Not Signed In
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center flex-wrap gap-4 text-xs text-content-muted mt-2">
                      <span>
                        Signed In: <strong className="text-content font-mono">{todayRecord?.clock_in_time ? new Date(todayRecord.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Signed Out: <strong className="text-content font-mono">{todayRecord?.clock_out_time ? new Date(todayRecord.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Duration: <strong className="text-primary font-mono font-semibold">{currentDuration}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-stretch sm:self-auto">
                  {isCompletedToday ? (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-status-success bg-status-success/10 border border-status-success/20 px-4 py-2.5 rounded-lg w-full sm:w-auto">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Workday Completed</span>
                    </div>
                  ) : isWorkingToday ? (
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-content-muted bg-surface-muted border border-border px-4 py-2.5 rounded-lg w-full sm:w-auto">
                      <span>Conclude workday via <strong>Daily Summary &amp; Logout</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-content-muted bg-surface-muted border border-border px-4 py-2.5 rounded-lg w-full sm:w-auto">
                      <span>Attendance recorded automatically on session sign-in</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee / Intern Personal Work History */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-content-muted">
              My Work Time History ({myHistory.length})
            </h3>

            {myHistory.length === 0 ? (
              <EmptyState
                title="No work sessions recorded yet"
                description="Your daily sign-in and sign-out records will appear here."
                icon={<Calendar className="h-10 w-10 text-content-muted" />}
              />
            ) : (
              <>
                {/* Desktop View (>= 640px) */}
                <div className="hidden sm:block">
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-content">
                        <thead className="bg-surface-muted border-b border-border text-content-muted uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Sign In</th>
                            <th className="py-3 px-4">Sign Out</th>
                            <th className="py-3 px-4">Duration</th>
                            <th className="py-3 px-4">Work Completed</th>
                            <th className="py-3 px-4">Plan for Tomorrow</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {myHistory.map((rec) => {
                            const sessionStatus = getSessionStatus(rec);
                            const duration = calculateDuration(rec.clock_in_time, rec.clock_out_time);

                            return (
                              <tr key={rec.id} className="hover:bg-surface-muted/50 transition-colors">
                                <td className="py-3.5 px-4 font-medium text-content whitespace-nowrap">
                                  {rec.session_date}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-content-muted whitespace-nowrap">
                                  {rec.clock_in_time ? new Date(rec.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-content-muted whitespace-nowrap">
                                  {rec.clock_out_time ? new Date(rec.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                </td>
                                <td className="py-3.5 px-4 font-mono font-medium text-content whitespace-nowrap">
                                  {duration}
                                </td>
                                <td className="py-3.5 px-4 text-content-muted max-w-xs">
                                  {rec.work_completed ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRecord(rec)}
                                      className="text-left line-clamp-1 hover:text-primary transition-colors cursor-pointer"
                                      title="Click to view full work details"
                                    >
                                      {rec.work_completed}
                                    </button>
                                  ) : (
                                    <span className="italic text-[11px] text-content-muted/70">In progress / no notes</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-content-muted max-w-xs">
                                  <span className="line-clamp-1">{rec.tomorrow_plan || '—'}</span>
                                </td>
                                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                  <StatusBadge status={sessionStatus} size="sm" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                {/* Mobile View (< 640px) */}
                <div className="sm:hidden space-y-2.5">
                  {myHistory.map((rec) => {
                    const sessionStatus = getSessionStatus(rec);
                    const duration = calculateDuration(rec.clock_in_time, rec.clock_out_time);

                    return (
                      <Card key={rec.id}>
                        <CardContent className="p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-content">{rec.session_date}</span>
                            <StatusBadge status={sessionStatus} size="sm" />
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs text-content-muted pt-1 border-t border-border">
                            <div>
                              <p className="text-[10px] uppercase font-semibold">In</p>
                              <p className="font-mono text-content">{rec.clock_in_time ? new Date(rec.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-semibold">Out</p>
                              <p className="font-mono text-content">{rec.clock_out_time ? new Date(rec.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-semibold">Duration</p>
                              <p className="font-mono font-medium text-primary">{duration}</p>
                            </div>
                          </div>
                          {rec.work_completed && (
                            <div className="pt-1.5 border-t border-border">
                              <p className="text-[10px] uppercase font-semibold text-content-muted">Work Completed</p>
                              <p className="text-xs text-content line-clamp-2 mt-0.5">{rec.work_completed}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* 2. ADMIN & SUPER ADMIN MANAGEMENT TRACKING SHEET                     */}
      {/* ==================================================================== */}
      {isSupervisor && (
        <div className="space-y-4">
          {/* Filtering Controls */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Period Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-content-muted mr-1 flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" /> Period:
                  </span>
                  {(['today', 'specific_date', 'this_month', 'prev_month', 'all'] as const).map((p) => {
                    const labelMap = {
                      today: 'Today',
                      specific_date: 'Specific Date',
                      this_month: 'This Month',
                      prev_month: 'Previous Month',
                      all: 'All Records'
                    };
                    return (
                      <button
                        key={p}
                        id={`filter-period-${p}`}
                        data-testid={`filter-period-${p}`}
                        type="button"
                        onClick={() => setPeriodFilter(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          periodFilter === p 
                            ? 'bg-primary text-white shadow-2xs' 
                            : 'bg-surface-muted text-content-muted hover:text-content border border-border'
                        }`}
                      >
                        {labelMap[p]}
                      </button>
                    );
                  })}
                </div>

                {/* Role Filter & Specific Date Input */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {periodFilter === 'specific_date' && (
                    <input
                      id="filter-specific-date-input"
                      data-testid="filter-specific-date-input"
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-lg text-content focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  )}

                  <select
                    id="filter-role-select"
                    data-testid="filter-role-select"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as any)}
                    className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-content font-medium focus:outline-hidden focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Roles (Employees & Interns)</option>
                    <option value="Employee">Employees Only</option>
                    <option value="Intern">Interns Only</option>
                  </select>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-content-muted" />
                <input
                  id="tracking-search-input"
                  data-testid="tracking-search-input"
                  type="text"
                  placeholder="Search by team member name, role, task, or completed work..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-surface border border-border rounded-lg text-content placeholder:text-content-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tracking Sheet Table */}
          {filteredSupervisorRecords.length === 0 ? (
            <EmptyState
              title="No work time records match your filter"
              description="Try adjusting the selected period, role, or search keyword."
              icon={<Calendar className="h-10 w-10 text-content-muted" />}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-content">
                  <thead className="bg-surface-muted border-b border-border text-content-muted uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Sign In</th>
                      <th className="py-3 px-4">Sign Out</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Tasks Worked</th>
                      <th className="py-3 px-4">Work Completed</th>
                      <th className="py-3 px-4">Completion</th>
                      <th className="py-3 px-4">Pending Work</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedRecords.map((rec) => {
                      const sessionStatus = getSessionStatus(rec);
                      const duration = calculateDuration(rec.clock_in_time, rec.clock_out_time);
                      const tasksCount = rec.tasks_worked?.length || 0;

                      return (
                        <tr 
                          key={rec.id} 
                          id={`tracking-row-${rec.id}`}
                          data-testid={`tracking-row-${rec.id}`}
                          className="hover:bg-surface-muted/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedRecord(rec)}
                        >
                          <td className="py-3.5 px-4 font-medium text-content whitespace-nowrap">
                            {rec.session_date}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-content whitespace-nowrap">
                            {rec.user?.full_name || 'Member'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                              rec.user?.role === 'Intern' 
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' 
                                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                            }`}>
                              {rec.user?.role || 'Employee'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-content-muted whitespace-nowrap">
                            {rec.clock_in_time ? new Date(rec.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-content-muted whitespace-nowrap">
                            {rec.clock_out_time ? new Date(rec.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-medium text-content whitespace-nowrap">
                            {duration}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {tasksCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                                <CheckSquare className="h-3 w-3" /> {tasksCount} {tasksCount === 1 ? 'task' : 'tasks'}
                              </span>
                            ) : (
                              <span className="text-content-muted text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-content-muted max-w-xs">
                            {rec.work_completed ? (
                              <span className="line-clamp-1 hover:text-primary transition-colors">
                                {rec.work_completed}
                              </span>
                            ) : (
                              <span className="italic text-[11px] text-content-muted/70">In progress / no notes</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-content text-[11px]">
                                {rec.completion_rate !== undefined ? `${rec.completion_rate}%` : '—'}
                              </span>
                              {rec.completion_rate !== undefined && (
                                <div className="w-12 bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border">
                                  <div 
                                    className={`h-1.5 rounded-full ${rec.completion_rate === 100 ? 'bg-status-success' : 'bg-primary'}`} 
                                    style={{ width: `${rec.completion_rate}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-content-muted max-w-xs whitespace-nowrap">
                            <span className="line-clamp-1">{rec.pending_work || 'None'}</span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <StatusBadge status={sessionStatus} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-content-muted">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSupervisorRecords.length)} of {filteredSupervisorRecords.length} records
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 px-2.5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </Button>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        type="button"
                        onClick={() => setCurrentPage(pg)}
                        className={`h-8 w-8 rounded text-xs font-semibold transition-colors cursor-pointer ${
                          currentPage === pg
                            ? 'bg-primary text-white'
                            : 'hover:bg-surface-muted text-content-muted'
                        }`}
                      >
                        {pg}
                      </button>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 px-2.5"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}



      {/* ==================================================================== */}
      {/* 4. MANAGEMENT WORK RECORD DETAILS MODAL                              */}
      {/* ==================================================================== */}
      {selectedRecord && (
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title={`Work Details — ${selectedRecord.user?.full_name || 'Team Member'}`}
          className="max-w-2xl"
        >
          <div className="space-y-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
            {/* Metadata Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-surface-muted rounded-lg border border-border">
              <div>
                <p className="text-[10px] font-semibold text-content-muted uppercase">Date</p>
                <p className="font-semibold text-content mt-0.5">{selectedRecord.session_date}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-content-muted uppercase">Role</p>
                <p className="font-semibold text-content mt-0.5">{selectedRecord.user?.role || 'Employee'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-content-muted uppercase">Sign In / Out</p>
                <p className="font-mono text-content mt-0.5">
                  {selectedRecord.clock_in_time ? new Date(selectedRecord.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} – {selectedRecord.clock_out_time ? new Date(selectedRecord.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-content-muted uppercase">Duration / Status</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-primary">{calculateDuration(selectedRecord.clock_in_time, selectedRecord.clock_out_time)}</span>
                  <StatusBadge status={getSessionStatus(selectedRecord)} size="sm" />
                </div>
              </div>
            </div>

            {/* Today's Plan (Morning Check-In) */}
            <div>
              <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">
                Today's Plan (Morning Check-In)
              </p>
              <div className="p-3 bg-surface border border-border rounded-lg text-content whitespace-pre-wrap leading-relaxed">
                {selectedRecord.today_plan || 'No morning plan recorded.'}
              </div>
            </div>

            {/* Tasks Worked On */}
            {selectedRecord.tasks_worked && selectedRecord.tasks_worked.length > 0 && (
              <div>
                <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">
                  Tasks Worked On ({selectedRecord.tasks_worked.length})
                </p>
                <div className="space-y-1.5">
                  {selectedRecord.tasks_worked.map((t) => (
                    <div key={t.id} className="p-2.5 bg-surface-muted rounded-md border border-border flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                          {t.projectName}
                        </span>
                        <p className="font-medium text-content text-xs mt-0.5 truncate">{t.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-xs text-primary">{t.progress}%</span>
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Work */}
            <div>
              <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">
                Work Completed (End-of-Day)
              </p>
              <div className="p-3 bg-surface border border-border rounded-lg text-content whitespace-pre-wrap leading-relaxed">
                {selectedRecord.work_completed || 'No completed work notes recorded.'}
              </div>
            </div>

            {/* Pending Work */}
            <div>
              <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">
                Pending Work
              </p>
              <div className="p-3 bg-surface border border-border rounded-lg text-content whitespace-pre-wrap leading-relaxed">
                {selectedRecord.pending_work || 'None.'}
              </div>
            </div>

            {/* Plan for Tomorrow */}
            <div>
              <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">
                Plan for Tomorrow
              </p>
              <div className="p-3 bg-surface border border-border rounded-lg text-content whitespace-pre-wrap leading-relaxed">
                {selectedRecord.tomorrow_plan || 'None.'}
              </div>
            </div>

            {/* Requirements & Blockers (if any) */}
            {(selectedRecord.company_requirements || selectedRecord.blockers) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {selectedRecord.blockers && (
                  <div>
                    <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">Blockers</p>
                    <div className="p-2.5 bg-surface border border-border rounded-lg text-content text-xs">
                      {selectedRecord.blockers}
                    </div>
                  </div>
                )}
                {selectedRecord.company_requirements && (
                  <div>
                    <p className="font-bold text-content uppercase tracking-wider text-[11px] mb-1">Requirements</p>
                    <div className="p-2.5 bg-surface border border-border rounded-lg text-content text-xs">
                      {selectedRecord.company_requirements}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
